# 🔔 Doorbell Setup Guide

This guide helps you configure the doorbell functionality to get notifications when someone presses the button on your 2N intercom.

## How It Works

When someone presses the doorbell button on your 2N intercom:
1. Plugin detects the button press via API polling
2. HomeKit sends notification to your iPhone/Apple Watch
3. Home Pod/HomePod mini plays doorbell sound
4. You can see who's at the door via camera stream

## Configuration

Add doorbell settings to your Homebridge config:

```json
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
```

## Finding Your Doorbell Events URL

Different 2N models use different API endpoints. Try these URLs in your browser:

### Common 2N API Endpoints:
- `http://IP/api/call/status` ✅ **Most common**
- `http://IP/api/events/call`
- `http://IP/api/device/status`
- `http://IP/cgi-bin/call.cgi?status`

### Testing the URL:
1. Open the URL in your browser while logged in
2. Press the doorbell button on your intercom
3. Refresh the page - you should see the status change

### Expected Response Formats:

**Active call (button pressed) - 2N Format:**
```json
{
  "success": true,
  "result": {
    "sessions": [
      {
        "session": 65,
        "direction": "outgoing", 
        "state": "ringing",
        "calls": [
          {
            "id": 65,
            "state": "ringing",
            "peer": "sip:4374834473@proxy.my2n.com:5061"
          }
        ]
      }
    ]
  }
}
```

**No call:**
```json
{
  "success": true,
  "result": {
    "sessions": []
  }
}
```

**Alternative formats (other models):**
```json
{
  "call_state": "active",
  "caller_id": "Button 1"
}
```

## Configuration Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `enableDoorbell` | No | `false` | Enable doorbell notifications |
| `doorbellEventsUrl` | Yes* | - | API endpoint to check for button presses |
| `doorbellPollingInterval` | No | `2000` | How often to check for button press (ms) |

*Required only if `enableDoorbell` is `true`

## Troubleshooting

### Doorbell Not Working?

1. **Check API URL**: Test the `doorbellEventsUrl` in browser
2. **Check Credentials**: Ensure username/password are correct
3. **Check Response**: Make sure API returns different data when button is pressed
4. **Check Logs**: Look for "🔔 Doorbell button pressed!" in Homebridge logs

### Common Issues:

**"Doorbell enabled but no doorbellEventsUrl configured"**
- Add `doorbellEventsUrl` to your config

**No notifications received:**
- Check HomeKit notifications are enabled in iOS Settings
- Ensure Home Pod is set as Home Hub
- Try adjusting `doorbellPollingInterval` (try 1000ms)

**False triggers:**
- Increase `doorbellPollingInterval` to 3000-5000ms
- Check if API returns different data for different events

## Advanced Setup

### Multiple Buttons:
If your intercom has multiple buttons, you can create separate platform instances:

```json
{
  "platforms": [
    {
      "platform": "2NIntercom",
      "name": "Entrance Door",
      "enableDoorbell": true,
      "doorbellEventsUrl": "http://IP/api/call/status?button=1"
    },
    {
      "platform": "2NIntercom", 
      "name": "Garage Door",
      "enableDoorbell": true,
      "doorbellEventsUrl": "http://IP/api/call/status?button=2"
    }
  ]
}
```

### Custom Doorbell Sound:
In iOS Home app:
1. Go to Home Settings → Notifications
2. Select your intercom doorbell
3. Choose custom notification sound

## Supported Models

Tested with:
- ✅ 2N IP Verso
- ✅ 2N IP Force  
- ✅ 2N IP Style
- ⚠️ 2N Analog (via IP gateway - limited API)

## Need Help?

1. Enable debug logging: Set Homebridge log level to "Debug"
2. Check what your API returns: `curl -u admin:password http://IP/api/call/status`
3. Look for error messages in Homebridge logs
4. Test doorbell press timing - some intercoms need 1-2 seconds between presses