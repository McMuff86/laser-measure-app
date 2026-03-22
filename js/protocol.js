/**
 * Bosch GLM 50C / GLM 50-27 CG Bluetooth Low Energy Protocol
 * 
 * This module contains all BLE protocol constants and functions for communicating
 * with Bosch laser distance meters over Bluetooth Low Energy.
 * 
 * Protocol verified against multiple reference implementations:
 * - ESP32 implementation: https://gist.github.com/ketan/054e9f4173aa53a04218fc545241f634
 * - Python GLM implementation: https://github.com/philipptrenz/BOSCH-GLM-rangefinder
 * - Protocol documentation: https://gist.github.com/gmcmicken/b61180a895666475eeaad0dc20719915
 */

// ═══════════════════════════════════════════════════════════════════════════════
// BLE Service & Characteristic UUIDs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Primary BLE service UUID for Bosch GLM devices
 * This is the main GATT service that provides measurement functionality
 */
export const BLE_SERVICE_UUID = '02a6c0d0-0451-4000-b000-fb3210111989';

/**
 * Characteristic UUID for read/write/notify operations
 * All commands are sent and measurements received through this characteristic
 */
export const BLE_CHAR_UUID = '02a6c0d1-0451-4000-b000-fb3210111989';

// ═══════════════════════════════════════════════════════════════════════════════
// Protocol Commands
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BLE Protocol Commands
 * These commands enable measurement streaming over BLE vs. classic RFCOMM protocol
 */
export const Commands = {
    /**
     * Sync/Enable command: Enables measurement notifications over BLE
     * Send this after connecting to receive automatic measurement data when button is pressed
     * Format: [0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A]
     */
    SYNC: new Uint8Array([0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A]),
    
    /**
     * Legacy RFCOMM-style commands (may work over BLE on some models)
     * These are from the older serial protocol but some devices support them over BLE
     */
    
    /** Trigger measurement remotely */
    MEASURE: new Uint8Array([0xC0, 0x40, 0x00, 0xEE]),
    
    /** Turn laser on */
    LASER_ON: new Uint8Array([0xC0, 0x41, 0x00, 0x96]),
    
    /** Turn laser off */
    LASER_OFF: new Uint8Array([0xC0, 0x42, 0x00, 0x1E]),
    
    /** Turn display backlight on */
    BACKLIGHT_ON: new Uint8Array([0xC0, 0x47, 0x00, 0x20]),
    
    /** Turn display backlight off */
    BACKLIGHT_OFF: new Uint8Array([0xC0, 0x48, 0x00, 0x62])
};

// ═══════════════════════════════════════════════════════════════════════════════
// Response Parsing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse measurement data from BLE notification
 * 
 * @param {Uint8Array} data - Raw bytes from BLE notification
 * @returns {Object|null} Parsed measurement or null if not a measurement
 */
export function parseMeasurement(data) {
    // ── BLE Protocol (GLM 50C/50CG) ──
    // Measurement notification format:
    // Header: C0 55 10 06 ... (measurement data subtype)
    // Bytes 7-10: IEEE 754 float32 little-endian = distance in meters
    
    if (data.length >= 11 && data[0] === 0xC0 && data[1] === 0x55) {
        // Check for measurement data subtype (0x10 0x06)
        if (data[2] === 0x10 && data[3] === 0x06) {
            // Extract distance: float32 little-endian at offset 7
            const distanceBuffer = new ArrayBuffer(4);
            const view = new DataView(distanceBuffer);
            
            // Copy bytes 7-10 (distance data)
            view.setUint8(0, data[7]);
            view.setUint8(1, data[8]);
            view.setUint8(2, data[9]);
            view.setUint8(3, data[10]);
            
            // Read as little-endian float32
            const distanceM = view.getFloat32(0, true);
            const distanceMm = distanceM * 1000;
            
            // Sanity check: reasonable distance range (0-100m)
            if (distanceMm > 0 && distanceMm < 100000) {
                return {
                    type: 'measurement',
                    distanceM: distanceM,
                    distanceMm: distanceMm,
                    protocol: 'ble',
                    raw: data
                };
            } else {
                return {
                    type: 'invalid',
                    error: 'Distance out of range',
                    distanceMm: distanceMm,
                    raw: data
                };
            }
        }
        
        // Other BLE message types (status, etc.)
        return {
            type: 'other',
            subtype: `${data[2].toString(16).padStart(2, '0')}/${data[3].toString(16).padStart(2, '0')}`,
            raw: data
        };
    }
    
    // ── Legacy RFCOMM-style Protocol ──
    // Some GLM models may send RFCOMM-style responses over BLE
    // Format: [status][length][data...][checksum]
    // Status 0x00 = OK, distance at bytes 2-5 as uint32 little-endian * 0.05mm
    
    if (data.length >= 6 && data[0] === 0x00) {
        // Extract distance: uint32 little-endian at offset 2
        const raw = data[2] | (data[3] << 8) | (data[4] << 16) | (data[5] << 24);
        const distanceMm = raw * 0.05;
        
        // Sanity check
        if (distanceMm > 0 && distanceMm < 100000) {
            return {
                type: 'measurement',
                distanceM: distanceMm / 1000,
                distanceMm: distanceMm,
                protocol: 'rfcomm_compat',
                raw: data
            };
        }
    }
    
    // Unknown or unsupported format
    return {
        type: 'unknown',
        raw: data
    };
}

/**
 * Format raw data bytes as hex string for debugging
 * 
 * @param {Uint8Array} data - Raw bytes
 * @returns {string} Hex representation
 */
export function formatHex(data) {
    return Array.from(data)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
        .toUpperCase();
}

/**
 * Get human-readable description of a command
 * 
 * @param {Uint8Array} command - Command bytes
 * @returns {string} Description
 */
export function getCommandName(command) {
    const hex = formatHex(command);
    
    // Check against known commands
    for (const [name, cmd] of Object.entries(Commands)) {
        if (formatHex(cmd) === hex) {
            return name;
        }
    }
    
    return 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Device Information
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Known compatible device names/prefixes for filtering during device discovery
 */
export const COMPATIBLE_DEVICES = [
    'GLM 50C',
    'GLM 50-27 CG', 
    'GLM 50CG',
    'GLM 100C',
    'Bosch GLM',
    'PLR 30C',
    'PLR 40C',
    'PLR 50C'
];

/**
 * Device-specific measurement offsets (from reference point to laser)
 * These offsets account for the physical position of the laser relative to device edges
 */
export const DEVICE_OFFSETS = {
    // GLM 50C measurements from different reference points
    'GLM_50C': {
        fromTop: 0,        // mm - from top of device (default measurement reference)
        fromTripodSocket: 40,   // mm - from tripod socket on bottom
        fromBack: 110      // mm - from back of device
    },
    
    // GLM 100C measurements 
    'GLM_100C': {
        fromTop: 0,
        fromTripodSocket: 40,
        fromBack: 110
    }
};

/**
 * Get device offset for a specific measurement reference point
 * 
 * @param {string} deviceType - Device type (e.g., 'GLM_50C')
 * @param {string} referencePoint - Reference point ('fromTop', 'fromTripodSocket', 'fromBack')
 * @returns {number} Offset in millimeters
 */
export function getDeviceOffset(deviceType = 'GLM_50C', referencePoint = 'fromTop') {
    return DEVICE_OFFSETS[deviceType]?.[referencePoint] || 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Protocol Notes & References
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PROTOCOL IMPLEMENTATION NOTES:
 * 
 * 1. BLE vs RFCOMM:
 *    - Modern GLM models (50C, 50-27 CG) use BLE with custom GATT services
 *    - Older models used classic Bluetooth RFCOMM serial interface
 *    - Some newer models support both protocols
 * 
 * 2. Measurement Flow:
 *    - Connect to BLE GATT service
 *    - Subscribe to notifications on characteristic
 *    - Send SYNC command to enable measurement streaming
 *    - Wait for measurement notifications (automatic when button pressed)
 *    - Parse float32 distance from bytes 7-10
 * 
 * 3. Alternative Commands:
 *    - Remote measurement trigger may work on some models (MEASURE command)
 *    - Laser on/off commands for programmatic control
 *    - Not all models support remote commands - manual button press preferred
 * 
 * 4. Data Validation:
 *    - Always validate distance is within reasonable range (0-100m)
 *    - Check message headers to ensure correct protocol parsing
 *    - Handle both BLE and RFCOMM-style responses for compatibility
 * 
 * REFERENCES:
 * - ESP32 BLE implementation: https://gist.github.com/ketan/054e9f4173aa53a04218fc545241f634
 * - RFCOMM protocol docs: https://github.com/philipptrenz/BOSCH-GLM-rangefinder
 * - Protocol analysis: https://gist.github.com/gmcmicken/b61180a895666475eeaad0dc20719915
 * - EEVblog discussion: https://www.eevblog.com/forum/projects/hacking-the-bosch-glm-20-laser-measuring-tape/
 */