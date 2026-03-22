"""
Bosch GLM 50C / GLM 50-27 CG Bluetooth Low Energy Protocol

This module contains all BLE protocol constants and functions for communicating
with Bosch laser distance meters over Bluetooth Low Energy.

Protocol verified against multiple reference implementations:
- ESP32 implementation: https://gist.github.com/ketan/054e9f4173aa53a04218fc545241f634
- Python GLM implementation: https://github.com/philipptrenz/BOSCH-GLM-rangefinder
- Protocol documentation: https://gist.github.com/gmcmicken/b61180a895666475eeaad0dc20719915
"""

import struct
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

# ═══════════════════════════════════════════════════════════════════════════════
# BLE Service & Characteristic UUIDs
# ═══════════════════════════════════════════════════════════════════════════════

# Primary BLE service UUID for Bosch GLM devices
# This is the main GATT service that provides measurement functionality
BLE_SERVICE_UUID = "02a6c0d0-0451-4000-b000-fb3210111989"

# Characteristic UUID for read/write/notify operations
# All commands are sent and measurements received through this characteristic
BLE_CHAR_UUID = "02a6c0d1-0451-4000-b000-fb3210111989"

# ═══════════════════════════════════════════════════════════════════════════════
# Protocol Commands
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Commands:
    """BLE Protocol Commands
    
    These commands enable measurement streaming over BLE vs. classic RFCOMM protocol
    """
    
    # Sync/Enable command: Enables measurement notifications over BLE
    # Send this after connecting to receive automatic measurement data when button is pressed
    # Format: [0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A]
    SYNC = bytes([0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A])
    
    # Legacy RFCOMM-style commands (may work over BLE on some models)
    # These are from the older serial protocol but some devices support them over BLE
    
    # Trigger measurement remotely
    MEASURE = bytes([0xC0, 0x40, 0x00, 0xEE])
    
    # Turn laser on
    LASER_ON = bytes([0xC0, 0x41, 0x00, 0x96])
    
    # Turn laser off
    LASER_OFF = bytes([0xC0, 0x42, 0x00, 0x1E])
    
    # Turn display backlight on
    BACKLIGHT_ON = bytes([0xC0, 0x47, 0x00, 0x20])
    
    # Turn display backlight off
    BACKLIGHT_OFF = bytes([0xC0, 0x48, 0x00, 0x62])


# ═══════════════════════════════════════════════════════════════════════════════
# Response Parsing
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class MeasurementResult:
    """Represents a parsed measurement result"""
    type: str
    distance_m: Optional[float] = None
    distance_mm: Optional[float] = None
    protocol: Optional[str] = None
    error: Optional[str] = None
    subtype: Optional[str] = None
    raw: Optional[bytes] = None


def parse_measurement(data: bytes) -> MeasurementResult:
    """Parse measurement data from BLE notification
    
    Args:
        data: Raw bytes from BLE notification
        
    Returns:
        MeasurementResult object with parsed measurement or error info
    """
    # BLE Protocol (GLM 50C/50CG)
    # Measurement notification format:
    # Header: C0 55 10 06 ... (measurement data subtype)
    # Bytes 7-10: IEEE 754 float32 little-endian = distance in meters
    
    if len(data) >= 11 and data[0] == 0xC0 and data[1] == 0x55:
        # Check for measurement data subtype (0x10 0x06)
        if data[2] == 0x10 and data[3] == 0x06:
            try:
                # Extract distance: float32 little-endian at offset 7
                distance_bytes = data[7:11]
                distance_m = struct.unpack('<f', distance_bytes)[0]  # little-endian float32
                distance_mm = distance_m * 1000
                
                # Sanity check: reasonable distance range (0-100m)
                if 0 < distance_mm < 100000:
                    return MeasurementResult(
                        type='measurement',
                        distance_m=distance_m,
                        distance_mm=distance_mm,
                        protocol='ble',
                        raw=data
                    )
                else:
                    return MeasurementResult(
                        type='invalid',
                        error='Distance out of range',
                        distance_mm=distance_mm,
                        raw=data
                    )
            except struct.error as e:
                return MeasurementResult(
                    type='invalid',
                    error=f'Failed to parse distance: {e}',
                    raw=data
                )
        
        # Other BLE message types (status, etc.)
        subtype = f"{data[2]:02x}/{data[3]:02x}"
        return MeasurementResult(
            type='other',
            subtype=subtype,
            raw=data
        )
    
    # Legacy RFCOMM-style Protocol
    # Some GLM models may send RFCOMM-style responses over BLE
    # Format: [status][length][data...][checksum]
    # Status 0x00 = OK, distance at bytes 2-5 as uint32 little-endian * 0.05mm
    
    if len(data) >= 6 and data[0] == 0x00:
        try:
            # Extract distance: uint32 little-endian at offset 2
            raw_distance = struct.unpack('<I', data[2:6])[0]  # little-endian uint32
            distance_mm = raw_distance * 0.05
            
            # Sanity check
            if 0 < distance_mm < 100000:
                return MeasurementResult(
                    type='measurement',
                    distance_m=distance_mm / 1000,
                    distance_mm=distance_mm,
                    protocol='rfcomm_compat',
                    raw=data
                )
        except struct.error:
            pass
    
    # Unknown or unsupported format
    return MeasurementResult(
        type='unknown',
        raw=data
    )


def format_hex(data: bytes) -> str:
    """Format raw data bytes as hex string for debugging
    
    Args:
        data: Raw bytes
        
    Returns:
        Hex representation
    """
    return ' '.join(f'{b:02X}' for b in data)


def get_command_name(command: bytes) -> str:
    """Get human-readable description of a command
    
    Args:
        command: Command bytes
        
    Returns:
        Description
    """
    hex_cmd = format_hex(command)
    
    # Check against known commands
    commands_dict = {
        format_hex(Commands.SYNC): 'SYNC',
        format_hex(Commands.MEASURE): 'MEASURE',
        format_hex(Commands.LASER_ON): 'LASER_ON',
        format_hex(Commands.LASER_OFF): 'LASER_OFF',
        format_hex(Commands.BACKLIGHT_ON): 'BACKLIGHT_ON',
        format_hex(Commands.BACKLIGHT_OFF): 'BACKLIGHT_OFF',
    }
    
    return commands_dict.get(hex_cmd, 'UNKNOWN')


# ═══════════════════════════════════════════════════════════════════════════════
# Device Information
# ═══════════════════════════════════════════════════════════════════════════════

# Known compatible device names/prefixes for filtering during device discovery
COMPATIBLE_DEVICES = [
    'GLM 50C',
    'GLM 50-27 CG',
    'GLM 50CG',
    'GLM 100C',
    'Bosch GLM',
    'PLR 30C',
    'PLR 40C',
    'PLR 50C'
]

# Device-specific measurement offsets (from reference point to laser)
# These offsets account for the physical position of the laser relative to device edges
DEVICE_OFFSETS = {
    # GLM 50C measurements from different reference points
    'GLM_50C': {
        'from_top': 0,        # mm - from top of device (default measurement reference)
        'from_tripod_socket': 40,   # mm - from tripod socket on bottom
        'from_back': 110      # mm - from back of device
    },
    
    # GLM 100C measurements 
    'GLM_100C': {
        'from_top': 0,
        'from_tripod_socket': 40,
        'from_back': 110
    }
}


def get_device_offset(device_type: str = 'GLM_50C', reference_point: str = 'from_top') -> int:
    """Get device offset for a specific measurement reference point
    
    Args:
        device_type: Device type (e.g., 'GLM_50C')
        reference_point: Reference point ('from_top', 'from_tripod_socket', 'from_back')
        
    Returns:
        Offset in millimeters
    """
    return DEVICE_OFFSETS.get(device_type, {}).get(reference_point, 0)


def is_compatible_device(device_name: str) -> bool:
    """Check if device name matches known compatible devices
    
    Args:
        device_name: Bluetooth device name
        
    Returns:
        True if device is likely compatible
    """
    if not device_name:
        return False
        
    device_name_upper = device_name.upper()
    return any(compat.upper() in device_name_upper for compat in COMPATIBLE_DEVICES)


# ═══════════════════════════════════════════════════════════════════════════════
# Protocol Notes & References
# ═══════════════════════════════════════════════════════════════════════════════

"""
PROTOCOL IMPLEMENTATION NOTES:

1. BLE vs RFCOMM:
   - Modern GLM models (50C, 50-27 CG) use BLE with custom GATT services
   - Older models used classic Bluetooth RFCOMM serial interface
   - Some newer models support both protocols

2. Measurement Flow:
   - Connect to BLE GATT service
   - Subscribe to notifications on characteristic
   - Send SYNC command to enable measurement streaming
   - Wait for measurement notifications (automatic when button pressed)
   - Parse float32 distance from bytes 7-10

3. Alternative Commands:
   - Remote measurement trigger may work on some models (MEASURE command)
   - Laser on/off commands for programmatic control
   - Not all models support remote commands - manual button press preferred

4. Data Validation:
   - Always validate distance is within reasonable range (0-100m)
   - Check message headers to ensure correct protocol parsing
   - Handle both BLE and RFCOMM-style responses for compatibility

REFERENCES:
- ESP32 BLE implementation: https://gist.github.com/ketan/054e9f4173aa53a04218fc545241f634
- RFCOMM protocol docs: https://github.com/philipptrenz/BOSCH-GLM-rangefinder
- Protocol analysis: https://gist.github.com/gmcmicken/b61180a895666475eeaad0dc20719915
- EEVblog discussion: https://www.eevblog.com/forum/projects/hacking-the-bosch-glm-20-laser-measuring-tape/
"""