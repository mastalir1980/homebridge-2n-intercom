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
      "streamUrl": "rtsp://192.168.1.100:554/h264_stream",
      "doorOpenUrl": "http://192.168.1.100/api/switch/ctrl?switch=1&action=trigger",
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

The plugin uses the official 2N HTTP API. Below are the correct endpoints according to the [2N HTTP API Manual](https://wiki.2n.com/hip/hapi/latest/en):

### Camera Snapshot
```
http://<host>/api/camera/snapshot
```
Optional parameters: `?width=<width>&height=<height>&source=<internal|external>`

**Documentation**: [api/camera/snapshot](https://wiki.2n.com/hip/hapi/latest/en/5-prehled-funkci-http-api/5-8-api-camera/5-8-2-api-camera-snapshot)

### RTSP Video Stream
```
rtsp://<host>:554/h264_stream
```
For MJPEG codec use: `rtsp://<host>:554/mjpeg_stream`

With authentication: `rtsp://<user>:<pass>@<host>:554/h264_stream`

**Documentation**: [Streaming Configuration](https://wiki.2n.com/hip/conf/latest/en/5-konfigurace-interkomu/5-4-sluzby/5-4-2-streamovani)

### Door Unlock (Switch Control)
```
http://<host>/api/switch/ctrl?switch=<num>&action=<action>
```
Parameters:
- `switch`: Switch number (1, 2, 3, 4...)
- `action`: `trigger` (monostable), `on`, `off`, `hold`, `release`, `lock`, `unlock`

Example: `http://<host>/api/switch/ctrl?switch=1&action=trigger`

**Documentation**: [api/switch/ctrl](https://wiki.2n.com/hip/hapi/latest/en/5-prehled-funkci-http-api/5-4-api-switch/5-4-3-api-switch-ctrl)

### Door Status (I/O Monitoring)
```
http://<host>/api/io/status
```
Returns JSON with current status of inputs and outputs:
```json
{
  "inputs": [
    { "id": 0, "name": "DoorSensor", "value": 1 }
  ],
  "outputs": [
    { "id": 0, "name": "Relay1", "value": 0 }
  ]
}
```
Where `value: 1` means active/on, `value: 0` means inactive/off.

**Documentation**: [HTTP API Manual](https://wiki.2n.com/hip/hapi/latest/en)

### Authentication

All API requests require HTTP authentication. Configure the username and password in the plugin settings. The 2N device must have HTTP API enabled in its web interface.

### Door Status Response Format

The plugin attempts to parse various response formats for the door status:
- JSON object: `{ "open": true }`, `{ "isOpen": true }`, `{ "state": "open" }`, `{ "status": "open" }`
- JSON with inputs array: `{ "inputs": [{ "value": 1 }] }` (1 = open, 0 = closed)
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
