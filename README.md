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
