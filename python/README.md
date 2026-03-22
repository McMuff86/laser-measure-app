# Laser Measure - Python CLI

A cross-platform Python CLI tool for Bosch GLM laser distance meters using Bluetooth Low Energy.

## Features

- **Device Discovery**: Scan for compatible Bosch GLM devices
- **Live Measurements**: Connect and receive real-time measurements
- **Batch Measurements**: Take multiple measurements with one command
- **Door Recording Workflow**: Specialized workflow for measuring doors (Breite/Höhe/Wandstärke)
- **Export Formats**: Save measurements as CSV, JSON, or Excel
- **Cross-Platform**: Works on Windows, macOS, and Linux with BLE support

## Compatible Devices

- Bosch GLM 50C
- Bosch GLM 50-27 CG
- Bosch GLM 50CG
- Bosch GLM 100C
- Bosch PLR 30C/40C/50C
- Other Bosch GLM models with BLE support

## Installation

```bash
# Basic installation
pip install laser-measure

# With Excel export support
pip install laser-measure[excel]

# Development installation
pip install -e .[dev]
```

## Usage

### Command Line Interface

#### Scan for Devices
```bash
# Scan for GLM devices
laser-measure scan

# Scan all BLE devices
laser-measure scan --all-devices
```

#### Connect and Monitor
```bash
# Connect to first device and show live measurements
laser-measure connect

# With custom timeout
laser-measure connect --timeout 60
```

#### Take Measurements
```bash
# Take 3 measurements
laser-measure measure -n 3

# Save to file
laser-measure measure -n 5 --output measurements.csv
laser-measure measure -n 5 --output data.json --format json
```

#### Door Recording Workflow
```bash
# Interactive door measurement workflow
laser-measure record

# Save as Excel
laser-measure record --format excel --output doors.xlsx
```

### Python API

```python
import asyncio
from laser_measure import GLMScanner, GLMClient, MeasurementCollector

async def main():
    # Scan for devices
    devices = await GLMScanner.scan(timeout=5.0)
    if not devices:
        print("No devices found")
        return
    
    device = devices[0]
    print(f"Connecting to {device.name}")
    
    # Connect and measure
    client = GLMClient(device)
    await client.connect()
    
    # Set up measurement collection
    collector = MeasurementCollector()
    client.set_measurement_callback(collector.measurement_callback)
    
    # Enable notifications
    await client.enable_notifications()
    
    # Wait for measurement (press device button)
    print("Press the device button to measure...")
    result = await collector.wait_for_measurement(timeout=30.0)
    
    if result:
        print(f"Distance: {result.distance_mm:.1f} mm")
    
    await client.disconnect()

# Run the example
asyncio.run(main())
```

### Door Measurement Workflow

The `record` command implements a specialized workflow for measuring doors:

1. **Breite** (Width): Measure door width
2. **Höhe** (Height): Measure door height  
3. **Wandstärke** (Wall thickness): Measure wall/frame thickness

Each door requires exactly 3 measurements in this order. The tool automatically groups measurements by doors and exports them with appropriate headers.

```bash
laser-measure record --output doors.csv
```

Output format:
```csv
door_number,breite_mm,hoehe_mm,wandstaerke_mm,timestamp
1,800.5,2100.0,120.0,2024-03-22T10:30:00
2,900.0,2050.0,140.0,2024-03-22T10:35:00
```

## BLE Protocol

The tool implements the Bosch GLM BLE protocol:

- **Service UUID**: `02a6c0d0-0451-4000-b000-fb3210111989`
- **Characteristic UUID**: `02a6c0d1-0451-4000-b000-fb3210111989`
- **SYNC Command**: `C0 55 02 01 00 1A` (enables measurement streaming)
- **Measurement Format**: IEEE 754 float32 little-endian in bytes 7-10

### Protocol Flow

1. Connect to BLE GATT service
2. Subscribe to notifications on characteristic  
3. Send SYNC command to enable measurement streaming
4. Wait for measurement notifications (triggered by device button)
5. Parse float32 distance from notification payload

## Requirements

- Python 3.10+
- Bluetooth Low Energy adapter
- Compatible Bosch GLM device

### Platform-Specific Requirements

**Windows**:
- Windows 10 version 1809+ or Windows 11
- Built-in Bluetooth support or external BLE adapter

**macOS**:
- macOS 10.12+
- Built-in Bluetooth support

**Linux**:
- BlueZ 5.43+
- User must be in `bluetooth` group or run with appropriate permissions

## Development

```bash
# Clone repository
git clone https://github.com/adi/laser-measure-app.git
cd laser-measure-app/python

# Install in development mode
pip install -e .[dev]

# Run tests
pytest

# Format code
black laser_measure/
isort laser_measure/

# Type checking
mypy laser_measure/
```

## Troubleshooting

### Common Issues

**Device not found during scan**:
- Ensure device is in pairing mode
- Check Bluetooth adapter is working
- Try increasing scan timeout: `--timeout 10`

**Connection fails**:
- Device may be connected to another app
- Reset device Bluetooth settings
- Check platform-specific BLE requirements

**No measurements received**:
- Ensure SYNC command was sent successfully
- Try pressing device button firmly
- Check device battery level

### Debug Mode

Enable debug logging for detailed information:

```bash
laser-measure --debug scan
laser-measure --debug connect
```

## License

MIT License - see LICENSE file for details.

## References

- [Bosch GLM Protocol Analysis](https://gist.github.com/gmcmicken/b61180a895666475eeaad0dc20719915)
- [ESP32 Implementation](https://gist.github.com/ketan/054e9f4173aa53a04218fc545241f634)
- [RFCOMM Protocol Documentation](https://github.com/philipptrenz/BOSCH-GLM-rangefinder)
- [Bleak Documentation](https://bleak.readthedocs.io/)