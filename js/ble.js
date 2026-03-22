/**
 * Bluetooth Low Energy Connection Manager
 * 
 * Handles Web Bluetooth API connection lifecycle for Bosch GLM laser meters.
 * Provides connection, auto-reconnection, and data streaming capabilities.
 */

import { BLE_SERVICE_UUID, BLE_CHAR_UUID, Commands, parseMeasurement, formatHex, COMPATIBLE_DEVICES } from './protocol.js';

/**
 * BLE Connection States
 */
export const ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting', 
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting'
};

/**
 * BLE Connection Manager for Bosch GLM devices
 */
export class GLMBleConnection {
    constructor() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.state = ConnectionState.DISCONNECTED;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 2000; // ms
        
        // Event callbacks
        this.onStateChange = null;
        this.onMeasurement = null; 
        this.onRawData = null;
        this.onError = null;
        this.onLog = null;
    }
    
    /**
     * Check if Web Bluetooth is supported in this browser
     * @returns {boolean}
     */
    static isSupported() {
        return 'bluetooth' in navigator;
    }
    
    /**
     * Get current connection state
     * @returns {string}
     */
    getState() {
        return this.state;
    }
    
    /**
     * Check if currently connected
     * @returns {boolean}
     */
    isConnected() {
        return this.state === ConnectionState.CONNECTED;
    }
    
    /**
     * Set connection state and notify listeners
     * @private
     */
    _setState(newState, text = '') {
        this.state = newState;
        this._log(`State: ${newState} ${text}`);
        if (this.onStateChange) {
            this.onStateChange(newState, text);
        }
    }
    
    /**
     * Log message to console and notify listeners
     * @private
     */
    _log(message) {
        console.log(`[GLMBle] ${message}`);
        if (this.onLog) {
            this.onLog(message);
        }
    }
    
    /**
     * Handle errors and notify listeners  
     * @private
     */
    _error(error, context = '') {
        const message = `Error ${context}: ${error.message || error}`;
        console.error(`[GLMBle] ${message}`, error);
        if (this.onError) {
            this.onError(error, context);
        }
        return message;
    }
    
    /**
     * Request and connect to a Bosch GLM device
     * @returns {Promise<void>}
     */
    async connect() {
        if (!GLMBleConnection.isSupported()) {
            throw new Error('Web Bluetooth not supported in this browser');
        }
        
        if (this.state !== ConnectionState.DISCONNECTED) {
            throw new Error('Already connected or connecting');
        }
        
        this._setState(ConnectionState.CONNECTING, 'Scanning for devices...');
        
        try {
            // Request device with multiple filter strategies
            this.device = await this._requestDevice();
            this._log(`Selected device: ${this.device.name || this.device.id}`);
            
            // Add disconnect handler
            this.device.addEventListener('gattserverdisconnected', () => {
                this._onDisconnected();
            });
            
            // Connect to GATT server
            await this._connectToDevice();
            
        } catch (error) {
            this._setState(ConnectionState.DISCONNECTED);
            
            if (error.message.includes('cancelled') || error.message.includes('canceled')) {
                throw new Error('Connection cancelled by user');
            } else {
                throw error;
            }
        }
    }
    
    /**
     * Request device using multiple filter strategies
     * @private
     */
    async _requestDevice() {
        // Strategy 1: Try name-based filters first
        try {
            const filters = COMPATIBLE_DEVICES.map(name => ({ namePrefix: name }));
            filters.push({ services: [BLE_SERVICE_UUID] }); // Also try service-based
            
            return await navigator.bluetooth.requestDevice({
                filters: filters,
                optionalServices: [BLE_SERVICE_UUID]
            });
        } catch (filterError) {
            this._log('Name-based scan failed, trying broad scan...');
            
            // Strategy 2: Fallback to acceptAllDevices
            return await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [BLE_SERVICE_UUID]
            });
        }
    }
    
    /**
     * Connect to the selected device GATT server
     * @private  
     */
    async _connectToDevice() {
        this._setState(ConnectionState.CONNECTING, 'Connecting to GATT server...');
        
        try {
            // Connect to GATT server
            this.server = await this.device.gatt.connect();
            this._log('GATT server connected');
            
            // Get BLE service
            let service;
            try {
                service = await this.server.getPrimaryService(BLE_SERVICE_UUID);
                this._log('GLM BLE service found');
            } catch (serviceError) {
                // Debug: list available services
                await this._debugListServices();
                throw new Error('Bosch GLM BLE service not found. Is this a GLM 50C/50CG?');
            }
            
            // Get characteristic
            this.characteristic = await service.getCharacteristic(BLE_CHAR_UUID);
            this._log('Characteristic found');
            
            // Subscribe to notifications
            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
                this._onBleNotification(event);
            });
            this._log('Notifications enabled');
            
            // Send sync command after short delay
            await new Promise(resolve => setTimeout(resolve, 300));
            await this._sendSyncCommand();
            
            // Try to enable laser (optional - may not work on all models)
            await this._tryEnableLaser();
            
            this._setState(ConnectionState.CONNECTED, this.device.name || 'GLM Device');
            this.reconnectAttempts = 0;
            
            this._log('Ready! Press measurement button on device.');
            
        } catch (error) {
            this._cleanup();
            throw error;
        }
    }
    
    /**
     * Debug helper: list all available services
     * @private
     */
    async _debugListServices() {
        try {
            const services = await this.server.getPrimaryServices();
            this._log(`Available services (${services.length}):`);
            services.forEach(service => {
                this._log(`  → ${service.uuid}`);
            });
        } catch (error) {
            this._log('Cannot list services');
        }
    }
    
    /**
     * Send sync command to enable measurement streaming
     * @private
     */
    async _sendSyncCommand() {
        try {
            await this.characteristic.writeValueWithResponse(Commands.SYNC);
            this._log('Sync command sent (measurements enabled)');
        } catch (error) {
            try {
                // Fallback: try without response
                await this.characteristic.writeValueWithoutResponse(Commands.SYNC);
                this._log('Sync command sent (no response)');
            } catch (error2) {
                this._log('Warning: Sync command failed - ' + error2.message);
            }
        }
    }
    
    /**
     * Try to enable laser (optional, may not work on all models)
     * @private
     */
    async _tryEnableLaser() {
        try {
            await this.characteristic.writeValueWithResponse(Commands.LASER_ON);
            this._log('Laser enabled');
        } catch (error) {
            this._log('Note: Laser control not supported (normal for BLE)');
        }
    }
    
    /**
     * Handle BLE notifications (measurement data)
     * @private
     */
    _onBleNotification(event) {
        const data = new Uint8Array(event.target.value.buffer);
        const hex = formatHex(data);
        
        this._log(`BLE Data (${data.length}B): ${hex}`);
        
        // Notify raw data listeners
        if (this.onRawData) {
            this.onRawData(data, hex);
        }
        
        // Parse measurement
        const result = parseMeasurement(data);
        
        if (result.type === 'measurement') {
            this._log(`Measurement: ${result.distanceMm.toFixed(1)} mm (${result.distanceM.toFixed(4)} m)`);
            
            if (this.onMeasurement) {
                this.onMeasurement(result);
            }
        } else if (result.type === 'invalid') {
            this._log(`Invalid measurement: ${result.error} (${result.distanceMm?.toFixed(1)} mm)`);
        } else if (result.type === 'other') {
            this._log(`GLM message type: ${result.subtype}`);
        } else {
            this._log('Unknown data format');
        }
    }
    
    /**
     * Handle unexpected disconnection
     * @private
     */
    _onDisconnected() {
        const wasConnected = this.state === ConnectionState.CONNECTED;
        this._cleanup();
        this._log('Device disconnected');
        
        // Auto-reconnect if unexpected disconnect
        if (wasConnected && this.device && this.reconnectAttempts < this.maxReconnectAttempts) {
            this._attemptReconnect();
        } else {
            this._setState(ConnectionState.DISCONNECTED, 'Connection lost');
        }
    }
    
    /**
     * Attempt automatic reconnection
     * @private
     */
    async _attemptReconnect() {
        this.reconnectAttempts++;
        this._setState(ConnectionState.RECONNECTING, `Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        this._log(`Reconnecting in ${this.reconnectDelay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(async () => {
            try {
                await this._connectToDevice();
                this._log('Reconnection successful!');
            } catch (error) {
                this._error(error, 'reconnection');
                
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    this._setState(ConnectionState.DISCONNECTED, 'Reconnection failed - please connect manually');
                } else {
                    this._attemptReconnect(); // Try again
                }
            }
        }, this.reconnectDelay);
    }
    
    /**
     * Trigger measurement remotely (may not work on all models)
     * @returns {Promise<void>}
     */
    async triggerMeasurement() {
        if (!this.isConnected()) {
            throw new Error('Not connected to device');
        }
        
        this._log('Sending remote measurement command...');
        
        try {
            await this.characteristic.writeValueWithResponse(Commands.MEASURE);
            this._log('Measurement command sent');
        } catch (error) {
            try {
                await this.characteristic.writeValueWithoutResponse(Commands.MEASURE);
                this._log('Measurement command sent (no response)');
            } catch (error2) {
                this._log('Remote measurement not supported - please use device button');
                throw new Error('Remote measurement not supported by this device');
            }
        }
    }
    
    /**
     * Disconnect from device
     */
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this._cleanup();
        this._setState(ConnectionState.DISCONNECTED, 'Disconnected by user');
    }
    
    /**
     * Clean up connection state
     * @private
     */
    _cleanup() {
        this.characteristic = null;
        this.server = null;
        // Keep device reference for potential reconnection
    }
    
    /**
     * Get device information
     * @returns {Object|null}
     */
    getDeviceInfo() {
        if (!this.device) return null;
        
        return {
            name: this.device.name,
            id: this.device.id,
            connected: this.device.gatt?.connected || false
        };
    }
}