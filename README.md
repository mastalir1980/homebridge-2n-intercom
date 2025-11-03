# Homebridge 2N Intercom

[![npm version](https://badge.fury.io/js/homebridge-2n-intercom.svg)](https://badge.fury.io/js/homebridge-2n-intercom)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Complete Homebridge plugin for 2N intercoms with door control, live video streaming, and doorbell notifications.

## Features

- 🚪 **Door Control Switch** - Open doors remotely with auto-off timer
- 📹 **Live Video Streaming** - View camera feed in HomeKit with H.264 support  
- 📸 **Camera Snapshots** - Get instant camera images with dynamic sizing
- 🔔 **Doorbell Notifications** - HomeKit notifications when someone presses the button
- 🏠 **Home Pod Integration** - Doorbell chimes play through Home Pod
- ⚙️ **Easy Configuration** - Works with most 2N intercom models
- 🔄 **Automatic Discovery** - Creates separate accessories for better HomeKit compatibility

## Installation

### Via Homebridge Config UI X (Recommended)
1. Open Homebridge Config UI X
2. Go to **Plugins** tab
3. Search for `homebridge-2n-intercom`
4. Click **Install**

### Manual Installation
```bash
npm install -g homebridge-2n-intercom
```

## Quick Start

### 1. Basic Configuration (Door Switch Only)
```json
{
  "platforms": [
    {
      "platform": "2NIntercom",
      "name": "2N Intercom Switch",
      "host": "192.168.1.100",
      "user": "admin",
      "pass": "password",
      "doorOpenUrl": "http://192.168.1.100/api/switch/ctrl?switch=1&action=trigger"
    }
  ]
}
```

### 2. Full Configuration (Door + Camera + Doorbell)
```json
{
  "platforms": [
    {
      "platform": "2NIntercom",
      "name": "2N Intercom",
      "host": "192.168.1.100",
      "user": "admin",
      "pass": "password",
      "doorOpenUrl": "http://192.168.1.100/api/switch/ctrl?switch=1&action=trigger",
      "snapshotUrl": "http://192.168.1.100/api/camera/snapshot",
      "streamUrl": "rtsp://192.168.1.100:554/h264_stream",
      "enableDoorbell": true,
      "doorbellEventsUrl": "http://192.168.1.100/api/call/status",
      "doorbellPollingInterval": 2000
    }
  ]
}
```

## Configuration Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `platform` | Yes | - | Must be `"2NIntercom"` |
| `name` | No | `"2N Intercom"` | Display name for the platform |
| `host` | Yes | - | IP address of your 2N intercom |
| `user` | Yes | - | Username for intercom authentication |
| `pass` | Yes | - | Password for intercom authentication |
| `doorOpenUrl` | Yes | - | HTTP API endpoint to open the door |
| `switchDuration` | No | `1000` | Duration (ms) switch stays on |
| `snapshotUrl` | No | - | HTTP API endpoint for camera snapshots |
| `streamUrl` | No | - | RTSP URL for live video streaming |
| `enableDoorbell` | No | `false` | Enable doorbell notifications |
| `doorbellEventsUrl` | No | - | HTTP API endpoint for doorbell events |
| `doorbellPollingInterval` | No | `2000` | Doorbell polling frequency (ms) |

## What You Get

When configured, this plugin creates up to **two separate HomeKit accessories**:

### 1. **Door Switch** (`2N Intercom Switch`)
- Toggle to open/unlock the door
- Automatically turns off after configured duration
- Works in HomeKit automations and scenes

### 2. **Security Camera** (`2N Intercom Camera`) 
- Live video streaming with audio
- Snapshot support with dynamic resizing
- Optional doorbell functionality with notifications

## API Endpoints Guide

### Door Control URLs
Test these URLs in your browser to find the right one:
- `http://IP/api/switch/ctrl?switch=1&action=trigger` ✅ **Most common**
- `http://IP/api/door/open`
- `http://IP/cgi-bin/door.cgi?action=open`
- `http://IP/api/switch/ctrl?switch=1&action=on`

### Camera Snapshot URLs
Plugin automatically adds width/height parameters:
- `http://IP/api/camera/snapshot` ✅ **Recommended**
- `http://IP/cgi-bin/snapshot.cgi`
- `http://IP/api/camera/live.jpg`

### RTSP Stream URLs
- `rtsp://IP:554/h264_stream` ✅ **Most common**
- `rtsp://IP:554/stream`
- `rtsp://IP:554/video`
- `rtsp://IP:554/cam/realmonitor?channel=1&subtype=0`

### Doorbell Event URLs
For button press detection:
- `http://IP/api/call/status` ✅ **Recommended**
- `http://IP/api/events/call`
- `http://IP/cgi-bin/call.cgi?status`

## Supported 2N Models

Tested and confirmed working:

| Model | Door Control | Camera | Streaming | Doorbell |
|-------|--------------|--------|-----------|----------|
| 2N IP Verso | ✅ | ✅ | ✅ | ✅ |
| 2N IP Force | ✅ | ✅ | ✅ | ✅ |
| 2N IP Style | ✅ | ✅ | ✅ | ✅ |
| 2N IP Solo | ✅ | ✅ | ✅ | ⚠️ Limited |

## Doorbell Setup

When someone presses your intercom button:
1. 🔔 **Home Pod plays doorbell chime**
2. 📱 **iPhone/Apple Watch gets notification**
3. 📹 **Camera stream available immediately**
4. 🏠 **Can trigger HomeKit automations**

For detailed doorbell configuration, see [DOORBELL_SETUP.md](DOORBELL_SETUP.md)

## Troubleshooting

### Door Switch Not Working
1. Test the `doorOpenUrl` in your web browser
2. Check credentials are correct (`user`/`pass`)
3. Verify the door actually opens when accessing URL manually
4. Try alternative door control URLs

### Camera/Video Issues
1. Test RTSP URL in VLC media player: `rtsp://user:pass@IP:554/h264_stream`
2. Ensure intercom has H.264 codec enabled (not MJPEG)
3. Check network connectivity between Homebridge and intercom
4. Verify RTSP port 554 is not blocked by firewall

### Doorbell Not Triggering
1. Test `doorbellEventsUrl` in browser while pressing button
2. Check if API response changes when button is pressed
3. Ensure HomeKit notifications are enabled in iOS Settings
4. Verify Home Pod is set as Home Hub

### Common Issues

**"This accessory is not responding"**
- Check if intercom IP address is reachable
- Verify username/password are correct
- Ensure URLs return valid responses

**Video shows "Loading..." indefinitely**
- RTSP stream may not be H.264 format
- Try different RTSP URLs from the list above
- Check if intercom requires specific codec settings

**Doorbell notifications not received**
- Enable notifications for Home app in iOS Settings
- Ensure Home Pod is configured as Home Hub
- Check if `doorbellEventsUrl` returns different data when pressed

## Requirements

- **Node.js** 18.0.0 or newer
- **Homebridge** 1.8.0 or newer  
- **FFmpeg** (automatically installed with plugin)
- **2N Intercom** with HTTP API enabled
- **Network access** between Homebridge server and intercom

## Advanced Configuration

### Multiple Intercoms
You can configure multiple intercoms by creating separate platform instances:

```json
{
  "platforms": [
    {
      "platform": "2NIntercom",
      "name": "Front Door",
      "host": "192.168.1.100",
      "doorOpenUrl": "http://192.168.1.100/api/switch/ctrl?switch=1&action=trigger"
    },
    {
      "platform": "2NIntercom", 
      "name": "Back Gate",
      "host": "192.168.1.101",
      "doorOpenUrl": "http://192.168.1.101/api/switch/ctrl?switch=1&action=trigger"
    }
  ]
}
```

### Performance Tuning
For better performance on slower networks:
- Increase `doorbellPollingInterval` to 3000-5000ms
- Use lower resolution RTSP streams if available
- Reduce `switchDuration` to 500ms for faster response

## Contributing

Found a bug or want to contribute? 
- Report issues on [GitHub](https://github.com/mastalir1980/homebridge-2n-intercom)
- Submit pull requests with improvements
- Share your 2N model compatibility results

## License

MIT © Jan Maštalíř

---

**Need Help?** Check the [troubleshooting section](#troubleshooting) or create an issue on GitHub with your 2N model and configuration details.