/**
 * Laser Measure App - Main Application Module
 * 
 * Handles UI interactions, measurement workflow, and coordinates between
 * BLE connection and storage modules.
 */

import { GLMBleConnection, ConnectionState } from './ble.js';
import { MeasurementStorage } from './storage.js';

/**
 * Main Application Class
 */
class LaserMeasureApp {
    constructor() {
        // Core modules
        this.ble = new GLMBleConnection();
        this.storage = new MeasurementStorage();
        
        // UI state
        this.currentField = 'breite';
        this.currentDoor = { breite: null, hoehe: null, wandstaerke: null };
        this.fieldOrder = ['breite', 'hoehe', 'wandstaerke'];
        
        // UI elements (initialized in init())
        this.elements = {};
        
        // Setup BLE event handlers
        this.setupBleHandlers();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        this.cacheElements();
        this.setupEventListeners();
        this.updateUI();
        this.setupServiceWorker();
        this.checkWebBluetoothSupport();
        
        console.log('🚀 Laser Measure App initialized');
    }
    
    /**
     * Cache DOM elements for easy access
     */
    cacheElements() {
        this.elements = {
            // Status
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            connectBtn: document.getElementById('connectBtn'),
            
            // Measurement display
            measureDisplay: document.getElementById('measureDisplay'),
            measureValue: document.getElementById('measureValue'),
            measureLabel: document.getElementById('measureLabel'),
            
            // Door input
            doorId: document.getElementById('doorId'),
            
            // Field buttons
            fieldRow: document.getElementById('fieldRow'),
            fieldButtons: document.querySelectorAll('.field-btn'),
            
            // Manual input
            manualInput: document.getElementById('manualInput'),
            manualValue: document.getElementById('manualValue'),
            
            // Debug
            debugLog: document.getElementById('debugLog'),
            
            // Table
            dataTable: document.getElementById('dataTable'),
            dataBody: document.getElementById('dataBody'),
            emptyState: document.getElementById('emptyState'),
            countBadge: document.getElementById('countBadge'),
            
            // Info
            infoBox: document.getElementById('infoBox')
        };
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Connection button
        this.elements.connectBtn.addEventListener('click', () => {
            this.toggleConnection();
        });
        
        // Field selection buttons
        this.elements.fieldButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectField(btn.dataset.field);
            });
        });
        
        // Manual input
        this.elements.manualValue.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.applyManualValue();
            }
        });
        
        // Door ID auto-save on blur/enter
        this.elements.doorId.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.elements.doorId.blur();
            }
        });
    }
    
    /**
     * Setup BLE event handlers
     */
    setupBleHandlers() {
        this.ble.onStateChange = (state, text) => {
            this.updateConnectionStatus(state, text);
        };
        
        this.ble.onMeasurement = (measurement) => {
            this.handleMeasurement(measurement);
        };
        
        this.ble.onRawData = (data, hex) => {
            this.log(`BLE Data (${data.length}B): ${hex}`);
        };
        
        this.ble.onError = (error, context) => {
            this.log(`❌ Error ${context}: ${error.message}`);
        };
        
        this.ble.onLog = (message) => {
            this.log(message);
        };
    }
    
    /**
     * Update connection status display
     */
    updateConnectionStatus(state, text) {
        const { statusDot, statusText, connectBtn } = this.elements;
        
        // Update status dot
        statusDot.className = 'status-dot';
        switch (state) {
            case ConnectionState.CONNECTED:
                statusDot.classList.add('connected');
                break;
            case ConnectionState.CONNECTING:
            case ConnectionState.RECONNECTING:
                statusDot.classList.add('connecting');
                break;
        }
        
        // Update status text
        statusText.textContent = this.getStatusText(state, text);
        
        // Update button
        connectBtn.disabled = state === ConnectionState.CONNECTING || state === ConnectionState.RECONNECTING;
        
        if (state === ConnectionState.CONNECTED) {
            connectBtn.textContent = 'Trennen';
            this.elements.infoBox.style.display = 'none';
        } else {
            connectBtn.textContent = state === ConnectionState.CONNECTING ? 'Suche...' : 'Verbinden';
            if (state === ConnectionState.DISCONNECTED) {
                this.elements.infoBox.style.display = 'block';
            }
        }
    }
    
    /**
     * Get human-readable status text
     */
    getStatusText(state, text) {
        switch (state) {
            case ConnectionState.DISCONNECTED:
                return text || 'Nicht verbunden';
            case ConnectionState.CONNECTING:
                return text || 'Verbinde...';
            case ConnectionState.CONNECTED:
                return text || 'Verbunden';
            case ConnectionState.RECONNECTING:
                return `Reconnect... ${text}`;
            default:
                return text || state;
        }
    }
    
    /**
     * Toggle BLE connection
     */
    async toggleConnection() {
        try {
            if (this.ble.isConnected()) {
                this.ble.disconnect();
            } else {
                await this.ble.connect();
            }
        } catch (error) {
            this.log(`❌ Connection error: ${error.message}`);
            this.showError('Verbindungsfehler', error.message);
        }
    }
    
    /**
     * Handle measurement data from BLE
     */
    handleMeasurement(measurement) {
        const distanceMm = Math.round(measurement.distanceMm);
        this.log(`📏 ${distanceMm} mm`);
        
        // Apply to current field
        this.applyValue(distanceMm);
        
        // Visual feedback
        this.flashMeasurementDisplay();
        this.vibrate(30);
    }
    
    /**
     * Apply a measurement value to the current field
     */
    applyValue(valueMm) {
        const mm = Math.round(valueMm);
        this.currentDoor[this.currentField] = mm;
        
        this.updateFieldDisplays();
        this.updateMeasurementDisplay(mm);
        
        // Auto-advance to next empty field
        this.autoAdvanceField();
    }
    
    /**
     * Auto-advance to next empty field after measurement
     */
    autoAdvanceField() {
        const currentIdx = this.fieldOrder.indexOf(this.currentField);
        
        // Look for next empty field
        for (let i = 1; i <= this.fieldOrder.length; i++) {
            const nextField = this.fieldOrder[(currentIdx + i) % this.fieldOrder.length];
            if (this.currentDoor[nextField] === null) {
                setTimeout(() => this.selectField(nextField), 300);
                return;
            }
        }
        
        // All fields filled
        this.log('✅ Alle 3 Felder gemessen – Tür speichern oder Nächste');
    }
    
    /**
     * Select active measurement field
     */
    selectField(field) {
        this.currentField = field;
        
        // Update button states
        this.elements.fieldButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.field === field);
        });
        
        this.log(`Active field: ${field}`);
    }
    
    /**
     * Update field button displays
     */
    updateFieldDisplays() {
        this.fieldOrder.forEach(field => {
            const btn = document.querySelector(`.field-btn[data-field="${field}"]`);
            const valueEl = document.getElementById(`val-${field}`);
            
            if (this.currentDoor[field] !== null) {
                valueEl.textContent = this.currentDoor[field];
                btn.classList.add('filled');
            } else {
                valueEl.textContent = '—';
                btn.classList.remove('filled');
            }
        });
    }
    
    /**
     * Update main measurement display
     */
    updateMeasurementDisplay(valueMm = null) {
        const { measureValue, measureLabel } = this.elements;
        
        if (valueMm === null) {
            measureValue.innerHTML = '—';
            measureLabel.textContent = 'Warte auf Messung...';
            return;
        }
        
        const mm = Math.round(valueMm);
        measureValue.innerHTML = `${mm}<span class="measure-unit">mm</span>`;
        
        const doorName = this.elements.doorId.value.trim() || '(keine Tür)';
        measureLabel.textContent = `→ ${this.currentField} für ${doorName}`;
    }
    
    /**
     * Flash measurement display for visual feedback
     */
    flashMeasurementDisplay() {
        const el = this.elements.measureDisplay;
        el.classList.remove('flash');
        void el.offsetWidth; // Force reflow
        el.classList.add('flash');
    }
    
    /**
     * Apply manual measurement value
     */
    applyManualValue() {
        const val = parseFloat(this.elements.manualValue.value);
        if (isNaN(val) || val <= 0) {
            this.showError('Ungültiger Wert', 'Bitte gültigen Messwert eingeben');
            return;
        }
        
        this.log(`✏️ Manueller Wert: ${val} mm`);
        this.applyValue(val);
        
        this.elements.manualValue.value = '';
        this.toggleManualInput();
    }
    
    /**
     * Toggle manual input visibility
     */
    toggleManualInput() {
        const el = this.elements.manualInput;
        const isVisible = el.classList.contains('show');
        
        el.classList.toggle('show');
        
        if (!isVisible) {
            // Opening - focus input
            setTimeout(() => this.elements.manualValue.focus(), 100);
        }
    }
    
    /**
     * Save current door measurement
     */
    saveDoor() {
        const id = this.elements.doorId.value.trim();
        
        if (!id) {
            this.showError('Tür-ID fehlt', 'Bitte Tür-Bezeichnung eingeben');
            this.elements.doorId.focus();
            return;
        }
        
        try {
            const result = this.storage.saveMeasurement({
                id,
                breite: this.currentDoor.breite,
                hoehe: this.currentDoor.hoehe,
                wandstaerke: this.currentDoor.wandstaerke
            });
            
            const action = result.updated ? 'aktualisiert' : 'gespeichert';
            this.log(`💾 Tür ${id} ${action}`);
            
            this.renderTable();
            this.vibrate(100);
            
        } catch (error) {
            this.showError('Speicher-Fehler', error.message);
        }
    }
    
    /**
     * Move to next door (auto-save current if has data)
     */
    nextDoor() {
        // Auto-save if we have data
        const hasData = this.currentDoor.breite !== null || 
                       this.currentDoor.hoehe !== null || 
                       this.currentDoor.wandstaerke !== null;
        
        if (this.elements.doorId.value.trim() && hasData) {
            this.saveDoor();
        }
        
        // Auto-increment door ID
        this.incrementDoorId();
        
        // Reset measurement state
        this.resetCurrentDoor();
    }
    
    /**
     * Auto-increment door number in ID
     */
    incrementDoorId() {
        const current = this.elements.doorId.value;
        const match = current.match(/^(.*?)(\d+)$/);
        
        if (match) {
            const prefix = match[1];
            const number = parseInt(match[2]);
            const padding = match[2].length;
            
            const newNumber = (number + 1).toString().padStart(padding, '0');
            this.elements.doorId.value = prefix + newNumber;
        } else {
            this.elements.doorId.value = '';
        }
    }
    
    /**
     * Reset current door measurement state
     */
    resetCurrentDoor() {
        this.currentDoor = { breite: null, hoehe: null, wandstaerke: null };
        this.updateFieldDisplays();
        this.selectField('breite');
        this.updateMeasurementDisplay(null);
    }
    
    /**
     * Delete measurement by index
     */
    deleteMeasurement(index) {
        const measurements = this.storage.getAllMeasurements();
        if (index < 0 || index >= measurements.length) return;
        
        const measurement = measurements[index];
        const confirmMsg = `Tür "${measurement.id}" wirklich löschen?`;
        
        if (!confirm(confirmMsg)) return;
        
        this.storage.deleteMeasurementByIndex(index);
        this.renderTable();
        this.log(`🗑️ Tür ${measurement.id} gelöscht`);
    }
    
    /**
     * Clear all measurements
     */
    clearAllMeasurements() {
        const count = this.storage.getCount();
        if (count === 0) {
            this.showError('Keine Daten', 'Keine Messungen zum Löschen vorhanden');
            return;
        }
        
        const confirmMsg = `Alle ${count} Messungen löschen?\n\nDas kann nicht rückgängig gemacht werden.`;
        if (!confirm(confirmMsg)) return;
        
        try {
            this.storage.clearAll(true);
            this.renderTable();
            this.log(`🗑️ Alle ${count} Messungen gelöscht`);
        } catch (error) {
            this.showError('Fehler', error.message);
        }
    }
    
    /**
     * Export measurements as CSV
     */
    exportCSV() {
        try {
            const result = this.storage.downloadCSV();
            this.log(`📥 CSV exportiert: ${result.filename} (${result.count} Türen)`);
        } catch (error) {
            this.showError('Export-Fehler', error.message);
        }
    }
    
    /**
     * Render measurements table
     */
    renderTable() {
        const measurements = this.storage.getAllMeasurements();
        const { dataBody, emptyState, countBadge } = this.elements;
        
        countBadge.textContent = measurements.length;
        
        if (measurements.length === 0) {
            dataBody.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        // Render rows (reverse order - newest first)
        const rowsHTML = measurements
            .slice()
            .reverse()
            .map((m, i) => {
                const actualIndex = measurements.length - 1 - i;
                return `
                    <tr>
                        <td><strong>${this.escapeHtml(m.id)}</strong></td>
                        <td>${m.breite ?? '—'}</td>
                        <td>${m.hoehe ?? '—'}</td>
                        <td>${m.wandstaerke ?? '—'}</td>
                        <td>
                            <button class="delete-btn" 
                                    onclick="app.deleteMeasurement(${actualIndex})"
                                    title="Löschen">✕</button>
                        </td>
                    </tr>
                `;
            })
            .join('');
        
        dataBody.innerHTML = rowsHTML;
    }
    
    /**
     * Update UI state
     */
    updateUI() {
        this.updateFieldDisplays();
        this.renderTable();
        this.updateMeasurementDisplay(null);
        this.selectField(this.currentField);
    }
    
    /**
     * Setup service worker for PWA functionality
     */
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(() => this.log('Service Worker registered'))
                .catch(error => console.warn('SW registration failed:', error));
        }
    }
    
    /**
     * Check Web Bluetooth support and update UI accordingly
     */
    checkWebBluetoothSupport() {
        if (!GLMBleConnection.isSupported()) {
            this.elements.infoBox.innerHTML = `
                <strong style="color: var(--danger)">⚠️ Web Bluetooth nicht verfügbar</strong><br>
                Dieser Browser unterstützt kein Web Bluetooth.<br><br>
                <strong>Unterstützte Browser:</strong><br>
                • Chrome / Edge auf Android ✅<br>
                • Chrome auf Windows / macOS / Linux ✅ (mit HTTPS)<br>
                • Safari / Firefox / iOS ❌<br><br>
                <em>Du kannst trotzdem Werte manuell eingeben (✏️ Manuell).</em>
            `;
        }
    }
    
    /**
     * Toggle debug log visibility
     */
    toggleDebugLog() {
        this.elements.debugLog.classList.toggle('show');
    }
    
    /**
     * Log message to debug console
     */
    log(message) {
        const time = new Date().toLocaleTimeString('de-CH');
        const logMessage = `[${time}] ${message}`;
        
        // Add to debug log
        this.elements.debugLog.innerHTML += logMessage + '\\n';
        this.elements.debugLog.scrollTop = this.elements.debugLog.scrollHeight;
        
        // Console log
        console.log(`[LaserMeasure] ${message}`);
    }
    
    /**
     * Show error message
     */
    showError(title, message) {
        alert(`${title}\\n\\n${message}`);
    }
    
    /**
     * Trigger device vibration
     */
    vibrate(duration = 50) {
        if (navigator.vibrate) {
            navigator.vibrate(duration);
        }
    }
    
    /**
     * Escape HTML for safe rendering
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Global Functions (called from HTML onclick handlers)
// ═══════════════════════════════════════════════════════════════════════════════

// Make these functions globally available for HTML event handlers
window.saveDoor = () => app.saveDoor();
window.nextDoor = () => app.nextDoor();
window.toggleManual = () => app.toggleManualInput();
window.applyManual = () => app.applyManualValue();
window.toggleLog = () => app.toggleDebugLog();
window.exportCSV = () => app.exportCSV();
window.clearAll = () => app.clearAllMeasurements();

// ═══════════════════════════════════════════════════════════════════════════════
// App Initialization
// ═══════════════════════════════════════════════════════════════════════════════

// Create global app instance
let app;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

async function initApp() {
    app = new LaserMeasureApp();
    await app.init();
    
    // Make app globally accessible for debugging
    window.app = app;
}