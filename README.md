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

## Required 2N Intercom Configuration

Before adding the plugin, make sure your 2N device exposes the endpoints the plugin uses:

1. **Enable HTTP API**: In the 2N web UI go to *Services → HTTP API* and enable it for the profile used by your Homebridge credentials. Allow the following endpoints: `/api/dir/query`, `/api/call/status`, `/api/switch/ctrl`, `/api/camera/snapshot`.
2. **Door Relay**: Under *Hardware → Switches* confirm the relay number (1-4) you plan to control and that it is allowed for your HTTP API profile.
3. **Video / RTSP**: Enable RTSP streaming (*Services → Streaming*) and verify the `h264_stream` profile works in VLC using `rtsp://user:pass@IP:554/h264_stream`.
4. **Directory Buttons**: Create directory entries and assign them to physical buttons (or virtual keypad positions). The plugin reads these via `/api/dir/query` and turns them into the dropdown list in the Homebridge UI. Whatever number the directory entry dials is what you will see in the `Doorbell Filter by Phone Number` selector.
5. **Credentials**: The Homebridge user must have permission to read the directory, call status and control the switch. Test by calling the endpoints in a browser (you should get JSON, not an authentication error).
6. **Self-signed HTTPS**: If your intercom uses the default certificate, leave `Verify SSL` disabled. To require verification, upload a valid certificate on the 2N device first.

After these steps, restart Homebridge. When the plugin logs the list of discovered phone numbers (📞 log lines), they will also appear automatically in the Homebridge UI dropdown.

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
| `doorbellFilterPeer` | No | `""` | Filter doorbell by caller (see below) |
| `videoQuality` | No | `vga` | Stream quality: `vga` or `hd` |
| `snapshotRefreshInterval` | No | `30` | Snapshot refresh rate (10-300s) |
| `protocol` | No | `https` | Connection protocol: `https` or `http` 🔒 |
| `verifySSL` | No | `false` | Verify SSL certificates (disable for self-signed) |

### Filtering Doorbell by Caller (v2.1.0+)

You can choose to respond to **all calls** or only **specific users** from your intercom's directory.

**How It Works:**
1. When the plugin starts, it automatically fetches the list of directory button peers from `/api/dir/query`.
2. Available callers are logged in Homebridge and written into the dynamic schema so the Config UI dropdown shows real phone numbers (requires Homebridge Config UI X ≥ 4.8.1).
3. Pick **All callers** or select a single entry from the dropdown to restrict notifications.

**Configuration:**
- Leave the field **empty** (or pick *All callers*) to ring for everyone.
- Select a specific phone number from the dropdown to ring only when that directory entry is called.
- Advanced: manually type a value (e.g. `sip:4374830182@proxy.my2n.com:5061` or `4374830182/2`) if you want to filter by a peer that is not part of the dropdown.

**Finding Your SIP Peers:**
On every restart the plugin prints the list of available directory peers, e.g.:
```
📞 Found 3 phone number(s) in directory:
  1. 4374834473 (Main Entrance)
  2. 4374834474 (Side Gate)
  3. 4374834475 (Delivery)
💡 These numbers are available in the doorbell filter configuration
```

#### **Example Configuration - All Users**
```json
{
  "platform": "2NIntercom",
  "enableDoorbell": true,
  "doorbellFilterPeer": ""
}
```

#### **Example Configuration - Specific User**
```json
{
  "platform": "2NIntercom",
  "enableDoorbell": true,
  "doorbellFilterPeer": "sip:4374830182@proxy.my2n.com:5061"
}
```

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
