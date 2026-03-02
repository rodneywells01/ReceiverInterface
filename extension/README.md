# Anthem Receiver Controls (Chrome Extension MVP)

## What it does
- Connects to `ws://<receiver-host>/cmd`
- Compact main view with current host/zone summary
- Settings panel for changing/saving receiver host and active zone
- Controls for Main Zone and Zone 2:
  - Icon buttons for power, mute, and refresh
  - Volume slider (dB)
  - Volume +/- buttons (1 dB per click)
  - Saved max volume limit (dB) enforced by the widget
  - Input selector

## Load in Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension` folder in this repo

## Usage
1. Open the extension popup
2. Confirm receiver host (default `192.168.1.89:8080`)
3. Click **Connect** (it also auto-connects on popup open)
4. Use controls for power/mute/volume/input

## Notes
- This is intentionally minimal and does not yet include reconnection backoff, auth, or advanced capability discovery.
- Host is stored in local popup storage for convenience.
