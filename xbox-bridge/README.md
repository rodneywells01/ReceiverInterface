# Xbox SmartGlass Bridge

This local service lets the Chrome extension send Xbox commands using the SmartGlass protocol through `xbox-smartglass-core-node`.

## Start

```bash
cd xbox-bridge
npm install
npm start
```

The service listens on `http://127.0.0.1:8765` by default.

## API

### `GET /health`
Returns health and known session hosts.

### `POST /command`
Sends one command to the console.

Request body:

```json
{
  "xboxHost": "192.168.1.120",
  "liveId": "FD00000000000000",
  "action": "power_on"
}
```

Supported actions:
- `power_on` (requires `liveId`)
- `power_off`
- Navigation/input: `up`, `down`, `left`, `right`, `a`, `b`, `x`, `y`, `view`, `menu`, `nexus`
- Media: `play`, `pause`, `playpause`, `stop`

### `POST /discover`
Discovers a console at a known IP and extracts the SmartGlass Live Device ID from its certificate.

Request body:

```json
{
  "xboxHost": "192.168.1.120"
}
```

Note: `xboxHost` should be the console IP/hostname. If protocol/port is provided, the bridge strips it.

Response fields include:
- `xboxHost`
- `name`
- `uuid`
- `liveId`

## Xbox settings

On the Xbox, allow remote/anonymous SmartGlass connections:
- Settings -> Devices & connections -> Remote features / Xbox app settings

Wording differs by OS version, but the service needs network access similar to the Xbox mobile app.
