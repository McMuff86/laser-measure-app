/**
 * Local Storage and CSV Export Module
 * 
 * Handles persistent storage of measurements and CSV export functionality.
 */

const STORAGE_KEY = 'laser-measurements';
const STORAGE_VERSION = 1;

/**
 * Measurement Storage Manager
 */
export class MeasurementStorage {
    constructor() {
        this.measurements = [];
        this.load();
    }
    
    /**
     * Load measurements from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                
                // Handle version migration if needed
                if (Array.isArray(data)) {
                    // Legacy format (just array)
                    this.measurements = data;
                } else if (data.version === STORAGE_VERSION) {
                    // Current format with versioning
                    this.measurements = data.measurements || [];
                } else {
                    // Unknown version - start fresh but backup old data
                    console.warn('Unknown storage version, starting fresh');
                    this.measurements = [];
                }
            }
        } catch (error) {
            console.error('Failed to load measurements from storage:', error);
            this.measurements = [];
        }
    }
    
    /**
     * Save measurements to localStorage
     */
    save() {
        try {
            const data = {
                version: STORAGE_VERSION,
                measurements: this.measurements,
                lastModified: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save measurements to storage:', error);
            throw new Error('Could not save data to local storage');
        }
    }
    
    /**
     * Add or update a measurement
     * @param {Object} measurement - Measurement object
     * @param {string} measurement.id - Door identifier
     * @param {number|null} measurement.breite - Width in mm
     * @param {number|null} measurement.hoehe - Height in mm  
     * @param {number|null} measurement.wandstaerke - Wall thickness in mm
     */
    saveMeasurement(measurement) {
        const { id, breite, hoehe, wandstaerke } = measurement;
        
        if (!id || !id.trim()) {
            throw new Error('Door ID is required');
        }
        
        // Must have at least one measurement
        if (breite === null && hoehe === null && wandstaerke === null) {
            throw new Error('At least one measurement value is required');
        }
        
        // Find existing measurement
        const existingIndex = this.measurements.findIndex(m => m.id === id);
        
        const entry = {
            id: id.trim(),
            breite,
            hoehe, 
            wandstaerke,
            timestamp: new Date().toISOString()
        };
        
        if (existingIndex >= 0) {
            // Update existing
            this.measurements[existingIndex] = entry;
            this.save();
            return { updated: true, index: existingIndex };
        } else {
            // Add new
            this.measurements.push(entry);
            this.save();
            return { updated: false, index: this.measurements.length - 1 };
        }
    }
    
    /**
     * Delete a measurement by ID
     * @param {string} id - Door identifier
     * @returns {boolean} - True if measurement was found and deleted
     */
    deleteMeasurement(id) {
        const index = this.measurements.findIndex(m => m.id === id);
        if (index >= 0) {
            this.measurements.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }
    
    /**
     * Delete a measurement by index
     * @param {number} index - Array index  
     * @returns {boolean} - True if measurement was found and deleted
     */
    deleteMeasurementByIndex(index) {
        if (index >= 0 && index < this.measurements.length) {
            this.measurements.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    }
    
    /**
     * Get all measurements
     * @returns {Array} - Array of measurement objects
     */
    getAllMeasurements() {
        return [...this.measurements]; // Return copy
    }
    
    /**
     * Get measurement by ID
     * @param {string} id - Door identifier
     * @returns {Object|null} - Measurement object or null
     */
    getMeasurement(id) {
        return this.measurements.find(m => m.id === id) || null;
    }
    
    /**
     * Get measurement count
     * @returns {number}
     */
    getCount() {
        return this.measurements.length;
    }
    
    /**
     * Clear all measurements
     * @param {boolean} confirm - Confirmation flag
     */
    clearAll(confirm = false) {
        if (!confirm) {
            throw new Error('Confirmation required to clear all data');
        }
        
        this.measurements = [];
        this.save();
    }
    
    /**
     * Export measurements as CSV
     * @param {Object} options - Export options
     * @param {string} options.separator - CSV separator (default: ';')
     * @param {boolean} options.includeBOM - Include UTF-8 BOM (default: true)
     * @returns {string} - CSV content
     */
    exportCSV(options = {}) {
        const { separator = ';', includeBOM = true } = options;
        
        if (this.measurements.length === 0) {
            throw new Error('No measurements to export');
        }
        
        // CSV headers (German)
        const headers = [
            'Tür',
            'Breite (mm)',
            'Höhe (mm)', 
            'Wandstärke (mm)',
            'Zeitpunkt'
        ];
        
        // CSV rows
        const rows = this.measurements.map(m => [
            m.id,
            m.breite ?? '',
            m.hoehe ?? '',
            m.wandstaerke ?? '',
            m.timestamp
        ]);
        
        // Join with separator
        const csvLines = [
            headers.join(separator),
            ...rows.map(row => row.join(separator))
        ];
        
        const csvContent = csvLines.join('\n');
        
        // Add UTF-8 BOM for proper encoding in Excel
        return includeBOM ? '\ufeff' + csvContent : csvContent;
    }
    
    /**
     * Download CSV file
     * @param {string} filename - Optional filename (default: auto-generated)
     * @param {Object} exportOptions - CSV export options
     */
    downloadCSV(filename, exportOptions = {}) {
        const csvContent = this.exportCSV(exportOptions);
        
        // Generate filename if not provided
        if (!filename) {
            const date = new Date().toISOString().slice(0, 10);
            filename = `tuermasse-${date}.csv`;
        }
        
        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        return { filename, count: this.measurements.length };
    }
    
    /**
     * Import measurements from CSV
     * @param {string} csvContent - CSV content to import
     * @param {Object} options - Import options
     * @param {string} options.separator - CSV separator (default: ';')
     * @param {boolean} options.skipHeader - Skip first row (default: true)
     * @param {boolean} options.merge - Merge with existing data (default: false)
     * @returns {Object} - Import result with stats
     */
    importCSV(csvContent, options = {}) {
        const { separator = ';', skipHeader = true, merge = false } = options;
        
        if (!merge) {
            this.measurements = [];
        }
        
        const lines = csvContent.trim().split('\n');
        let startIndex = skipHeader ? 1 : 0;
        
        let imported = 0;
        let errors = [];
        
        for (let i = startIndex; i < lines.length; i++) {
            try {
                const columns = lines[i].split(separator);
                
                if (columns.length >= 5) {
                    const measurement = {
                        id: columns[0].trim(),
                        breite: columns[1] ? parseFloat(columns[1]) : null,
                        hoehe: columns[2] ? parseFloat(columns[2]) : null,
                        wandstaerke: columns[3] ? parseFloat(columns[3]) : null,
                        timestamp: columns[4] || new Date().toISOString()
                    };
                    
                    // Validate
                    if (measurement.id) {
                        this.saveMeasurement(measurement);
                        imported++;
                    }
                }
            } catch (error) {
                errors.push({ line: i + 1, error: error.message });
            }
        }
        
        return {
            imported,
            errors,
            total: this.measurements.length
        };
    }
    
    /**
     * Get storage statistics
     * @returns {Object} - Storage info
     */
    getStorageStats() {
        const dataSize = new Blob([localStorage.getItem(STORAGE_KEY) || '']).size;
        
        return {
            count: this.measurements.length,
            dataSize,
            lastModified: this.measurements.length > 0 
                ? new Date(Math.max(...this.measurements.map(m => new Date(m.timestamp)))).toISOString()
                : null
        };
    }
}