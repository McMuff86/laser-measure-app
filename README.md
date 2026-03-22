# Laser Measure App

PWA for measuring door dimensions with Bosch GLM 50C/50CG laser distance meters via Bluetooth Low Energy (BLE).

## Features

- **📱 PWA**: Works offline, installable on mobile devices
- **🔵 Bluetooth LE**: Connect to Bosch GLM 50C/50-27 CG via Web Bluetooth API  
- **📏 3-Field Measurement**: Width, Height, Wall Thickness per door
- **🔄 Auto-advance**: Automatically moves to next empty field after measurement
- **💾 Local Storage**: Persistent measurement storage with CSV export
- **🔧 Manual Input**: Fallback for manual value entry
- **📊 Data Table**: View and manage all measurements
- **🌙 Dark Theme**: Optimized for mobile use in various lighting conditions

## Device Compatibility

### Supported Laser Meters
- **Bosch GLM 50C** ✅
- **Bosch GLM 50-27 CG** ✅ 
- **Bosch GLM 100C** ✅ (likely)
- **Bosch PLR 30C/40C/50C** ✅ (likely)

### Browser Support
- **Chrome/Edge on Android** ✅
- **Chrome on Windows/macOS/Linux** ✅ (requires HTTPS)
- **Safari/Firefox/iOS** ❌ (no Web Bluetooth support)

## Quick Start

1. **Device Setup**:
   - Turn on your Bosch GLM 50C
   - Activate Bluetooth (BT symbol on device display)

2. **Connect**:
   - Open app in supported browser
   - Tap "Verbinden" → select your laser meter
   - Wait for "Verbunden" status

3. **Measure**:
   - Enter door ID (e.g., "OH1-EG-101")  
   - Press measurement button on laser meter
   - Value auto-fills current field (Width → Height → Wall Thickness)
   - Tap "Tür speichern" when done

4. **Export**:
   - Use "📥 CSV Export" to download data
   - Compatible with Excel/LibreOffice

## Project Structure

```
laser-measure-app/
├── index.html          # Main PWA shell
├── manifest.json       # PWA manifest
├── sw.js              # Service Worker for offline support
├── css/
│   └── app.css        # Application styles
├── js/
│   ├── app.js         # Main application logic & UI
│   ├── ble.js         # Bluetooth LE connection management
│   ├── protocol.js    # Bosch GLM BLE protocol implementation
│   └── storage.js     # Local storage & CSV export
└── README.md          # This file
```

## Technical Implementation

### BLE Protocol

The app implements the Bosch GLM BLE protocol based on reverse-engineering research:

- **Service UUID**: `02a6c0d0-0451-4000-b000-fb3210111989`
- **Characteristic UUID**: `02a6c0d1-0451-4000-b000-fb3210111989`
- **Sync Command**: `[0xC0, 0x55, 0x02, 0x01, 0x00, 0x1A]`
- **Measurement Data**: Float32 (little-endian) at bytes 7-10 in BLE notifications

### Architecture

- **ES6 Modules**: Clean separation of concerns, no build step required
- **Web Bluetooth API**: Native browser BLE support
- **LocalStorage**: Persistent data with versioning
- **PWA**: Service Worker caching for offline capability
- **Mobile-first**: Touch-optimized UI with haptic feedback

### Protocol References

- [ESP32 Implementation](https://gist.github.com/ketan/054e9f4173aa53a04218fc545241f634) - BLE protocol details
- [Python GLM Library](https://github.com/philipptrenz/BOSCH-GLM-rangefinder) - RFCOMM protocol  
- [Protocol Analysis](https://gist.github.com/gmcmicken/b61180a895666475eeaad0dc20719915) - Message format documentation

## Development

### Local Development

```bash
# Serve over HTTPS (required for Web Bluetooth)
python -m http.server 8000 --bind 127.0.0.1

# Or use any HTTPS dev server
npx serve -s . --listen 8000
```

**Note**: Web Bluetooth requires HTTPS, even for localhost testing.

### File Structure

- **`protocol.js`**: Contains all BLE protocol knowledge with extensive documentation
- **`ble.js`**: Handles Web Bluetooth connection lifecycle and auto-reconnection  
- **`storage.js`**: Manages localStorage with versioning and CSV export/import
- **`app.js`**: Coordinates UI, measurement workflow, and module interactions

### Key Features

- **Auto-reconnection**: Handles temporary BLE disconnects
- **Protocol validation**: Sanity checks for measurement data
- **Error handling**: Graceful fallbacks for unsupported operations
- **Debug logging**: Comprehensive logging for troubleshooting
- **Mobile optimization**: Touch events, vibration feedback

## Usage Tips

### Measurement Workflow

1. **Field Selection**: Active field highlighted in cyan
2. **Auto-advance**: After each measurement, advances to next empty field
3. **Manual Override**: Use field buttons to change active field
4. **Manual Input**: ✏️ button for manual value entry
5. **Door Management**: Auto-increment door numbers (e.g., "101" → "102")

### Troubleshooting

- **Connection Issues**: Check Bluetooth is enabled on both devices
- **No Measurements**: Ensure sync command was successful (check debug log)
- **Wrong Values**: Verify measurement distance is reasonable (0-100m range)
- **Browser Compatibility**: Use Chrome/Edge on Android for best results

### Data Export

- **CSV Format**: German locale (semicolon separator)
- **UTF-8 BOM**: Proper encoding for Excel
- **Timestamp**: ISO format for sortability
- **Empty Values**: Blank cells for missing measurements

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## Acknowledgments

- Bosch GLM protocol reverse-engineering community
- [ketan](https://github.com/ketan) for ESP32 BLE implementation
- [philipptrenz](https://github.com/philipptrenz) for RFCOMM protocol documentation
- Web Bluetooth community for API implementation examples