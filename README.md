# 📐 Laser Measure – Bosch GLM 50C BLE PWA

Progressive Web App zur Erfassung von Türmassen mit dem Bosch GLM 50C / 50CG Laser-Messgerät via Web Bluetooth (BLE).

## Features

- **BLE Verbindung** zum Bosch GLM 50C/50CG über Web Bluetooth
- **Auto-Empfang** von Messwerten (Knopf am Gerät drücken)
- **3 Felder pro Tür:** Breite, Höhe, Wandstärke
- **Auto-Advance** zum nächsten leeren Feld nach Messung
- **Auto-Increment** Tür-Nummer bei "Nächste"
- **CSV Export** mit Semikolon-Trennung (Excel-kompatibel)
- **Offline-fähig** via Service Worker
- **Manuelle Eingabe** als Fallback
- **Auto-Reconnect** bei Verbindungsverlust

## Setup zum Testen

### Voraussetzungen

1. **Bosch GLM 50C oder 50CG** (mit Bluetooth/BLE)
2. **Chrome oder Edge** (kein Safari/Firefox!)
3. **HTTPS** erforderlich (oder `localhost`)

### Starten

```bash
# Option 1: Python HTTP Server (nur für localhost-Test)
cd ~/projects/laser-measure-app
python3 -m http.server 8080
# → Öffne http://localhost:8080

# Option 2: Mit HTTPS (für BLE auf Android notwendig)
# Nutze z.B. caddy, nginx mit SSL, oder ngrok
npx serve -s . --ssl-cert cert.pem --ssl-key key.pem
```

### Auf Android testen

Web Bluetooth funktioniert am besten auf **Chrome für Android**:

1. HTTPS-URL öffnen (oder `chrome://flags` → `#unsafely-treat-insecure-origin-as-secure`)
2. Bosch GLM einschalten
3. Bluetooth am GLM aktivieren (BT-Taste drücken bis BT-Symbol blinkt)
4. In der App "Verbinden" drücken
5. GLM in der Liste auswählen
6. Messen am Gerät → Wert erscheint automatisch

### Desktop Chrome

Auf Desktop Chrome funktioniert Web Bluetooth ebenfalls:
- HTTPS erforderlich
- Oder mit Flag: `chrome://flags/#enable-experimental-web-platform-features`

## BLE Protokoll

Siehe [BLE Research Dokument](../../clawd/research/solid-ai/laser-measure-ble-research.md) für Details.

**Kurzfassung:**
- Service UUID: `02a6c0d0-0451-4000-b000-fb3210111989`
- Characteristic UUID: `02a6c0d1-0451-4000-b000-fb3210111989`
- Sync-Befehl: `C0 55 02 01 00 1A` (aktiviert Mess-Indikationen)
- Messdaten: Prefix `C0 55 10 06`, Float32 LE an Offset 7-10 (Meter)

## Dateistruktur

```
laser-measure-app/
├── index.html      # Alles-in-einer-Datei (HTML + CSS + JS)
├── manifest.json   # PWA Manifest
├── sw.js           # Service Worker für Offline-Support
└── README.md       # Diese Datei
```

## Kompatible Geräte

| Gerät | Status |
|-------|--------|
| Bosch GLM 50C | Sollte funktionieren (gleiche BLE-Protokollfamilie) |
| Bosch GLM 50-27 CG | Getestet & bestätigt (ketan/Bosch-GLM50C-Rangefinder) |
| Bosch GLM 100C | Möglicherweise (RFCOMM, nicht BLE) |
| Bosch PLR 30/40/50C | Unbekannt |

## Bekannte Einschränkungen

- **iOS/Safari:** Kein Web Bluetooth Support
- **Firefox:** Kein Web Bluetooth Support
- **Remote-Messung:** Nicht alle Modelle unterstützen das Auslösen einer Messung über BLE – physischer Knopf am Gerät ist nötig
- **Pairing:** Einige Geräte erfordern erstmaliges Pairing über OS Bluetooth-Einstellungen

## Credits

BLE-Protokoll reverse-engineered basierend auf:
- [ketan/Bosch-GLM50C-Rangefinder](https://github.com/ketan/Bosch-GLM50C-Rangefinder) (ESP32 + Python)
- [philipptrenz/BOSCH-GLM-rangefinder](https://github.com/philipptrenz/BOSCH-GLM-rangefinder) (RFCOMM)
- [EEVblog Forum: Hacking the Bosch GLM 20](https://www.eevblog.com/forum/projects/hacking-the-bosch-glm-20-laser-measuring-tape/)
