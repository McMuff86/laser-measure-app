"""
Laser Measure - Python CLI for Bosch GLM laser distance meters

A cross-platform Python package for communicating with Bosch GLM series
laser distance meters over Bluetooth Low Energy using the bleak library.

Example usage:
    from laser_measure import GLMScanner, GLMClient
    
    # Scan for devices
    devices = await GLMScanner.scan()
    
    # Connect to first device
    client = GLMClient(devices[0])
    await client.connect()
    await client.enable_notifications()
"""

from .protocol import (
    BLE_SERVICE_UUID,
    BLE_CHAR_UUID,
    Commands,
    MeasurementResult,
    parse_measurement,
    format_hex,
    is_compatible_device,
    get_device_offset,
    COMPATIBLE_DEVICES,
    DEVICE_OFFSETS
)

from .ble import (
    GLMDevice,
    GLMClient,
    GLMScanner,
    MeasurementCollector,
    scan_devices,
    connect_to_first_device
)

from .export import (
    MeasurementExporter,
    export_measurements,
    get_default_filename
)

__version__ = "1.0.0"
__author__ = "Laser Measure CLI Team"
__email__ = "contact@example.com"
__description__ = "Python CLI for Bosch GLM laser distance meters"

__all__ = [
    # Protocol
    'BLE_SERVICE_UUID',
    'BLE_CHAR_UUID', 
    'Commands',
    'MeasurementResult',
    'parse_measurement',
    'format_hex',
    'is_compatible_device',
    'get_device_offset',
    'COMPATIBLE_DEVICES',
    'DEVICE_OFFSETS',
    
    # BLE Interface
    'GLMDevice',
    'GLMClient', 
    'GLMScanner',
    'MeasurementCollector',
    'scan_devices',
    'connect_to_first_device',
    
    # Export
    'MeasurementExporter',
    'export_measurements',
    'get_default_filename',
]