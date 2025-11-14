# Homebridge 2N Intercom

[![npm version](https://badge.fury.io/js/homebridge-2n-intercom.svg)](https://badge.fury.io/js/homebridge-2n-intercom)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Complete Homebridge plugin for 2N intercoms with door control, live video streaming, and doorbell notifications.

## Features

- 🚪 **Door Control Switch** - Open doors remotely with auto-off timer
- 📹 **Live Video Streaming** - View camera feed in HomeKit with H.264 support  
- 📸 **Smart Camera Snapshots** - Instant images with caching to prevent black screens
- 🔔 **Doorbell Notifications** - HomeKit notifications when someone presses the button
- 🔒 **SSL/HTTPS Support** - Secure communication with configurable certificate handling
- 🏠 **Home Pod Integration** - Doorbell chimes play through Home Pod
- ⚙️ **Easy Web Configuration** - Complete setup via Homebridge UI
- 🔄 **Automatic Discovery** - Creates separate accessories for better HomeKit compatibility

## Installation

### Via Homebridge Config UI X (Recommended)
1. Open Homebridge Config UI X
2. Go to **Plugins** tab
3. Search for `homebridge-2n-intercom`
4. Click **Install**
5. **Configure via web UI** - No manual JSON editing needed! 🎉

### Manual Installation
```bash
npm install -g homebridge-2n-intercom
```

## Quick Setup (v2.1.0+)

### Web Configuration Interface ✨
Starting with v2.0.0, configuration is **dramatically simplified**:

1. **Install the plugin** via Homebridge UI
2. **Add platform** using the web form:
   - **Device Name**: `My 2N Intercom`
   - **IP Address**: `192.168.1.100`
   - **Username**: `admin`
   - **Password**: `password`
   - **Door Switch**: `1` (relay 1-4)
   - **Enable Doorbell**: `Yes`
   - **Video Quality**: `VGA (Recommended)`
   - **Protocol**: `HTTPS (Recommended)` 🔒
   - **SSL Verification**: `Disabled (for self-signed certs)`

**That's it!** All URLs are auto-generated with secure HTTPS by default! 🚀

### Legacy Manual Configuration (v1.x)
For advanced users or legacy setups:

```json
{
  "platforms": [
    {
      "platform": "2NIntercom",
      "name": "2N Intercom",
      "host": "192.168.1.100", 
      "user": "admin",
      "pass": "password",
      "doorSwitchNumber": 1,
      "enableDoorbell": true,
      "videoQuality": "vga"
    }
  ]
}
```

## Configuration Parameters

### Web UI Parameters (v2.0.0+)
All URLs are **auto-generated** from these simple settings:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `name` | Yes | - | Display name for your intercom |
| `host` | Yes | - | IP address of your 2N intercom |
| `user` | Yes | - | Username for intercom authentication |
| `pass` | Yes | - | Password for intercom authentication |
| `doorSwitchNumber` | No | `1` | Which relay controls door (1-4) |
| `enableDoorbell` | No | `true` | Enable doorbell notifications |
| `doorbellFilterPeer` | No | - | Filter doorbell by SIP peer (see below) |
| `videoQuality` | No | `vga` | Stream quality: `vga` or `hd` |
| `snapshotRefreshInterval` | No | `30` | Snapshot refresh rate (10-300s) |
| `protocol` | No | `https` | Connection protocol: `https` or `http` 🔒 |
| `verifySSL` | No | `false` | Verify SSL certificates (disable for self-signed) |

### Filtering Doorbell by Caller (v2.1.0+)

When your intercom has **multiple buttons or SIP accounts**, you can filter which calls trigger doorbell notifications:

#### **Finding Available SIP Peers**
To see all configured SIP accounts on your intercom:
1. Access: `https://YOUR_INTERCOM_IP/api/phone/config` (requires authentication)
2. Look for the `sipNumber` and `domain` fields in enabled accounts
3. Format as: `sip:NUMBER@DOMAIN:PORT`

Example response:
```json
{
  "success": true,
  "result": {
    "accounts": [
      {
        "account": 2,
        "enabled": true,
        "sipNumber": "4374834473",
        "domain": "proxy.my2n.com",
        "domainPort": 5062,
        "proxyPort": 5061
      }
    ]
  }
}
```

#### **Configuring Peer Filter**
Use the SIP peer format in your configuration:
```json
{
  "doorbellFilterPeer": "sip:4374834473@proxy.my2n.com:5061"
}
```

- **Leave empty** to respond to all calls (default behavior)
- **Set a peer** to only trigger doorbell for that specific caller
- The filter uses partial matching, so you can use just the number if unique

### Legacy Manual Parameters (v1.x)
For backward compatibility and advanced setups:

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `doorOpenUrl` | Yes | - | HTTP API endpoint to open the door |
| `snapshotUrl` | No | - | HTTP API endpoint for camera snapshots |
| `streamUrl` | No | - | RTSP URL for live video streaming |
| `doorbellEventsUrl` | No | - | HTTP API endpoint for doorbell events |
| `doorbellPollingInterval` | No | `2000` | Doorbell polling frequency (ms) |

## 🔒 SSL/HTTPS Configuration (v2.1.0+)

### Secure by Default
- **HTTPS is enabled by default** for all new installations
- **SSL certificate verification disabled by default** (most 2N intercoms use self-signed certificates)
- **Automatic protocol detection** based on your configuration

### SSL Configuration Options

#### **HTTPS (Recommended)**
```json
{
  "protocol": "https",
  "verifySSL": false,  // Recommended for 2N intercoms
  "host": "192.168.1.100"
}
```

#### **HTTP (Legacy/Unsecure)**
```json
{
  "protocol": "http",
  "host": "192.168.1.100"
}
```

#### **Custom HTTPS Port**
```json
{
  "protocol": "https",
  "host": "192.168.1.100:8443",
  "verifySSL": false
}
```

### SSL Certificate Handling
- **Most 2N intercoms use self-signed certificates** → Set `verifySSL: false`
- **Enterprise setups with proper certificates** → Set `verifySSL: true`  
- **Mixed environments** → Configure per device in web UI

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
- `http://IP/api/switch/ctrl?switch=1&action=trigger` 

### Camera Snapshot URLs
Plugin automatically adds width/height parameters:
- `http://IP/api/camera/snapshot`

### RTSP Stream URLs
- `rtsp://IP:554/h264_stream` 

### Doorbell Event URLs
For button press detection:
- `http://IP/api/call/status` 

## Supported 2N Models

Tested and confirmed working:

| Model | Door Control | Camera | Streaming | Doorbell |
|-------|--------------|--------|-----------|----------|
| 2N IP Verso | ✅ | ✅ | ✅ | ✅ |
| 2N IP Force | ✅ | ✅ | ✅ | ✅ |
| 2N IP Style | ✅ | ✅ | ✅ | ✅ |
| 2N IP Solo | ✅ | ✅ | ✅ | ✅ |

## Doorbell Setup

When someone presses your intercom button:
1. 🔔 **Home Pod plays doorbell chime**
2. 📱 **iPhone/Apple Watch gets notification**
3. 📹 **Camera stream available immediately**
4. 🏠 **Can trigger HomeKit automations**

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
