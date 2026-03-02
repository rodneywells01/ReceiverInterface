# Anthem Receiver Controls (Chrome Extension MVP)

## What it does
- Connects to `ws://<receiver-host>/cmd`
- Controls for Main Zone and Zone 2:
  - Power toggle
  - Mute toggle
  - Volume slider (dB)
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
