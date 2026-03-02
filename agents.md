# Agent Notes

## Project scope
- This repository contains a Chrome extension MVP for controlling an Anthem receiver.
- Extension root: `/Users/rodneywells/Programs/wellsprojects/ReceiverInterface/extension`

## Receiver protocol (confirmed)
- UI/device control uses WebSocket, not REST polling, at:
  - `ws://<receiver-host>:8080/cmd`
- Message framing is semicolon-delimited command frames.
- Writes use: `COMMAND<value>;`
- Reads use: `COMMAND?;`

## Commands used by the extension
- Zone 1:
  - `Z1POW`, `Z1MUT`, `Z1VOL`, `Z1INP`
- Zone 2:
  - `Z2POW`, `Z2MUT`, `Z2VOL`, `Z2INP`
- Input discovery:
  - `ICN` for input count
  - `ISxIN` for input name (`x` is input index)
- Keepalive:
  - `IDQ?;` every 30 seconds while connected

## Extension behavior
- Settings panel stores and applies:
  - receiver host (`localStorage: anthemHost`)
  - active zone (`localStorage: anthemZone`)
- Volume safety:
  - max volume cap stored as `anthemMaxVolumeDb`
  - UI enforces cap on slider and +/- buttons
  - if cap is lowered below current zone volume, extension immediately sends new capped volume
- Keyboard shortcut:
  - `M` toggles mute for active zone when popup is focused
  - ignored while typing in inputs/textarea/contentEditable

## Current UI choices
- Host/zone are shown as read-only summary on main view.
- Host/zone edits are inside settings panel.
- Top-right controls:
  - refresh icon
  - settings icon
- Action buttons:
  - power icon with active state styling
  - mute icon with animated red slash on active mute

## Icons
- Extension icon assets are under `extension/icons/`.
- Source favicon retained at `extension/assets_favicon.ico`.
- `manifest.json` maps both `action.default_icon` and `icons` to `extension/icons/icon16|32|48|128.png`.

## Quick validation
- JS syntax check:
  - `node --check extension/popup.js`
- Load extension:
  - `chrome://extensions` -> Developer mode -> Load unpacked -> `extension/`

## Git/PR context
- Main feature branch used for this work:
  - `codex/ui-polish-settings-icons-shortcuts`
- Open PR from that branch to `main`:
  - `https://github.com/rodneywells01/ReceiverInterface/pull/1`
