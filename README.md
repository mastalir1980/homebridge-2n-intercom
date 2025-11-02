# homebridge-2n-intercom

Homebridge plugin for 2N intercoms that provides:
- Camera accessory with snapshot support
- RTSP video streaming
- Doorbell events
- Door unlock control via HTTP
- Door status monitoring via contact sensor (with polling)

## Installation

```bash
npm install -g homebridge-2n-intercom
```

## Configuration

Add the following configuration to your Homebridge `config.json`:

```json
{
  "platforms": [
    {
      "platform": "2NIntercom",
      "name": "2N Intercom",
      "host": "192.168.1.100",
      "user": "admin",
      "pass": "password",
      "snapshotUrl": "http://192.168.1.100/api/camera/snapshot",
      "streamUrl": "rtsp://192.168.1.100:554/stream",
      "doorOpenUrl": "http://192.168.1.100/api/switch/ctrl?switch=1",
      "doorStatusUrl": "http://192.168.1.100/api/io/status",
      "pollInterval": 5000
    }
  ]
}
```

### Configuration Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `platform` | Yes | Must be `2NIntercom` |
| `name` | No | Display name for the accessory (default: "2N Intercom") |
| `host` | Yes | IP address or hostname of the 2N intercom |
| `user` | Yes | Username for authentication |
| `pass` | Yes | Password for authentication |
| `snapshotUrl` | Yes | HTTP URL to fetch camera snapshot |
| `streamUrl` | Yes | RTSP URL for video streaming |
| `doorOpenUrl` | Yes | HTTP URL to trigger door unlock |
| `doorStatusUrl` | Yes | HTTP URL to check door status |
| `pollInterval` | No | Polling interval in milliseconds for door status (default: 5000) |

## Features

### Camera
- Displays the 2N intercom as a HomeKit camera
- Supports snapshot capture
- RTSP video streaming

### Doorbell
- Triggers doorbell events in HomeKit
- Can be used to send notifications

### Door Control
- Switch accessory to unlock the door
- Automatically resets after unlocking

### Door Status
- Contact sensor shows whether the door is open or closed
- Polls the status at the configured interval
- Updates automatically when the state changes

## 2N API Endpoints

The plugin requires specific URLs for different functions. These URLs depend on your 2N intercom model and configuration. Here are some common examples:

### Snapshot URL
```
http://<host>/api/camera/snapshot
```

### Stream URL
```
rtsp://<host>:554/stream
```

### Door Open URL
```
http://<host>/api/switch/ctrl?switch=1
```

### Door Status URL
```
http://<host>/api/io/status
```

**Note**: The exact API endpoints may vary depending on your 2N intercom model. Consult your 2N intercom documentation for the correct API endpoints.

### Door Status Response Format

The plugin attempts to parse various response formats for the door status:
- JSON object: `{ "open": true }`, `{ "state": "open" }`, `{ "status": "open" }`
- String: `"open"` or `"closed"`
- Boolean: `true` (open) or `false` (closed)

If your 2N intercom returns a different format, you may need to modify the parsing logic in `src/accessory.ts`.

## Development

```bash
# Clone the repository
git clone https://github.com/mastalir1980/homebridge-2n-intercom.git
cd homebridge-2n-intercom

# Install dependencies
npm install

# Build the plugin
npm run build

# Watch for changes during development
npm run watch
```

## License

MIT
