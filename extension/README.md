# Anthem Receiver Controls (Chrome Extension MVP)

## What it does
- Connects to `ws://<receiver-host>/cmd`
- Compact main view with current host/zone summary
- Settings panel for changing/saving receiver host and active zone
- Optional Xbox control panel (only shown when active input name is `Xbox`)
- Controls for Main Zone and Zone 2:
  - Icon buttons for power, mute, and refresh
  - Volume slider (dB)
  - Volume +/- buttons (1 dB per click)
  - Saved max volume limit (dB) enforced by the widget
  - Input selector
- Xbox controls use a local SmartGlass bridge service:
  - Power on/off
  - Navigation (`up/down/left/right`, `A/B/X/Y`, `View`, `Menu`, `Home`)
  - Media (`play`, `pause`)

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

## Xbox setup (optional)
1. Start the local bridge:
   - `cd xbox-bridge`
   - `npm install`
   - `npm start`
2. In popup **Settings**, set:
   - `Xbox Host` (console IP only, no protocol or port)
   - Click `Discover ID` to auto-fill `Xbox Live Device ID` (needed for Power On / Wake)
   - `Xbox Bridge URL` (default `http://127.0.0.1:8765`)
3. Save settings.
4. Select receiver input named `Xbox` in the popup.  
   The `Xbox Controls` card appears only when that active input name is `Xbox` (case-insensitive).

## How to find Xbox settings

### Xbox Host (console IP)
1. On Xbox: `Settings` -> `General` -> `Network settings`
2. Use the shown IPv4 address as `Xbox Host` (example: `192.168.1.120`).

### Remote permissions required
1. On Xbox: `Settings` -> `Devices & connections` -> `Remote features`
2. Enable remote features.
3. Set power mode to `Sleep` for reliable wake/power-on behavior.
4. On Xbox: `Settings` -> `Devices & connections` -> `Xbox app preferences` (label may vary by OS version)
5. Allow connections from apps/devices on your network.
6. If present, allow anonymous/unauthenticated SmartGlass-style connections.

### Xbox Live Device ID (`FD...`) for Power On
- This SmartGlass `liveId` is usually not exposed directly in the normal Xbox UI.
- You can still use all non-power-on controls without it (`power_off`, navigation, media), once connected.
- Use popup `Discover ID` to auto-discover and save it from your console certificate.
- If `Discover ID` reports missing `/discover`, restart the bridge after pulling latest changes.

## Notes
- This is intentionally minimal and does not yet include reconnection backoff, auth, or advanced capability discovery.
- Host is stored in local popup storage for convenience.
- SmartGlass behavior depends on Xbox network/remote settings and may vary by Xbox OS version.
