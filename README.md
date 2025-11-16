# Homebridge 2N Intercom

[![npm version](https://badge.fury.io/js/homebridge-2n-intercom.svg)](https://badge.fury.io/js/homebridge-2n-intercom)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Complete Homebridge integration for 2N intercoms. The plugin exposes a HomeKit door switch, camera stream, snapshots, and optional doorbell events. This README focuses on two things only: every plugin parameter and the exact settings you must apply on the intercom for the plugin to work reliably.

## Installation

```bash
npm install -g homebridge-2n-intercom
```

> Tip: Installing through Homebridge Config UI X automatically exposes a guided form. No manual JSON editing is required unless you prefer it.

---

## Plugin Parameters

Everything in the UI is just a friendlier wrapper around the JSON keys below. URLs for switches, snapshots, doorbell events, and RTSP are generated automatically from these values—no need to paste raw endpoints anymore.

### Parameter Overview

| JSON key | UI label | Purpose | Typical value |
| --- | --- | --- | --- |
| `name` | Platform Name | Friendly name shown in Homebridge / HomeKit. | `"Front Gate"` |
| `host` | 2N Intercom IP Address | Host (IPv4 or `IP:port`) used for every API call. | `"192.168.1.100"` |
| `user` | Username | Service account with HTTP API rights. | `"homebridge"` |
| `pass` | Password | Password for the service account. | `"changeMe"` |
| `protocol` | Connection Protocol | `https` (default) or `http`. Controls generated URLs. | `"https"` |
| `verifySSL` | Verify SSL Certificates | Toggle TLS verification. Leave `false` for the factory self-signed cert. | `false` |
| `doorSwitchNumber` | Door Relay Number | Which relay (1‑4) is triggered when the HomeKit switch is toggled. | `1` |
| `enableDoorbell` | Enable Doorbell Notifications | Turn on/off the doorbell service inside the camera accessory. | `true` |
| `doorbellFilterPeer` | Doorbell Filter by Phone Number | Limits notifications to a single directory peer. Empty = all callers. | `""` |
| `videoQuality` | Video Stream Quality | `vga` (640×480@15fps) or `hd` (Apple default). | `"vga"` |
| `snapshotRefreshInterval` | Snapshot Refresh Interval | Seconds between cached snapshots (10‑300). | `30` |

### Basic Connectivity

- `host`, `protocol`, and `verifySSL` decide every URL the plugin generates: door control (`/api/switch/ctrl`), snapshots (`/api/camera/snapshot`), call status (`/api/call/status`), and RTSP (`rtsp://host:554/h264_stream`). Use HTTPS wherever possible; disable `verifySSL` unless you uploaded a trusted certificate to the intercom.
- `user` / `pass` should belong to a **dedicated HTTP API user**. The account only needs the permissions referenced in the intercom setup section below.
- `name` identifies the platform in Homebridge logs and becomes the accessory label in HomeKit.

### Door / Doorbell Behavior

- `doorSwitchNumber` must match the relay you wired to the lock. If you change the relay assignment on the intercom later, update this value so the generated `/api/switch/ctrl?switch=X&action=trigger` keeps working.
- `enableDoorbell` toggles whether the camera accessory exposes the HomeKit doorbell service. Set it to `false` if you only want the switch + camera but no notifications.
- `doorbellFilterPeer` uses the list of directory entries returned by `/api/dir/query`. On startup the plugin logs every peer it found and injects them into the Homebridge UI dropdown. Leave the field empty (or choose “All callers”) to react to every press. To restrict notifications, select one of the discovered peers or type the exact SIP/number manually (e.g. `4374834473/2` or `sip:4374830182@proxy.my2n.com:5061`).

### Video and Snapshots

- `videoQuality` swaps the FFmpeg profile definition. `vga` launches quickly and uses less bandwidth. `hd` matches Apple’s default 1280×720@24fps but stresses the intercom CPU more.
- `snapshotRefreshInterval` prevents black screens by caching snapshots for the given duration. Lower values refresh more often but call `/api/camera/snapshot` more frequently.

### Advanced / Legacy Keys

Keys such as `doorOpenUrl`, `snapshotUrl`, `streamUrl`, and `doorbellEventsUrl` still work for legacy JSON setups, but they are **generated automatically** when you use the web form. You normally never need to set them manually unless you are debugging a custom firmware.

### Minimal JSON Example

```json
{
  "platforms": [
    {
      "platform": "2NIntercom",
      "name": "Front Gate",
      "host": "192.168.1.100",
      "user": "homebridge",
      "pass": "changeMe",
      "doorSwitchNumber": 1,
      "enableDoorbell": true,
      "doorbellFilterPeer": "",
      "videoQuality": "vga",
      "snapshotRefreshInterval": 30,
      "protocol": "https",
      "verifySSL": false
    }
  ]
}
```

---

## 2N Intercom Configuration

The plugin cannot fix a misconfigured device. Use the checklist below to guarantee that every required endpoint is reachable.

### 1. Create a Service Account with HTTP API Access

1. Sign in to the 2N web UI as an administrator.
2. Go to **Services → HTTP API** and enable the service.
3. Create (or reuse) a user and grant the HTTP API profile the following scopes:
   - `/api/dir/query` – directory/peer enumeration for the doorbell filter dropdown.
   - `/api/call/status` – button press detection.
   - `/api/switch/ctrl` – relay trigger for the lock.
   - `/api/camera/snapshot` – still images for HomeKit snapshots.
4. Save and verify the account by opening `https://IP/api/call/status` in a browser (log in when prompted). You should see JSON, not an error page.

### 2. Map the Door Relay You Want to Control

1. Navigate to **Hardware → Switches**.
2. Confirm which relay (1‑4) is wired to your strike/lock and allowed for the HTTP API profile.
3. Match that number with `doorSwitchNumber` in the plugin configuration. The plugin will then call `/api/switch/ctrl?switch=<number>&action=trigger` whenever the HomeKit switch is toggled.

### 3. Prepare Directory Entries for Doorbell Filtering

1. Under **Directory → Users / Buttons** create entries for every physical button or virtual keypad position.
2. Assign the entries to the buttons so that pressing the hardware button always places a call to the intended peer.
3. Restart the plugin and check the Homebridge logs. You will see lines such as `📞 Found 3 phone number(s) in directory ...`. These peers populate the `doorbellFilterPeer` dropdown. If nothing is listed, the directory is either empty or your HTTP API profile cannot read it.

### 4. Enable Video Streaming

1. Open **Services → Streaming**.
2. Ensure the `h264_stream` profile (or any H.264 stream) is enabled.
3. Test the stream in VLC: `rtsp://user:pass@IP:554/h264_stream`. If the stream does not start, verify the codec is H.264 and that port 554 is reachable from the Homebridge host.
4. Optional: create a lower-resolution secondary stream and set `videoQuality` to `vga` for faster response.

### 5. Verify Snapshot Capability

1. Visit `https://IP/api/camera/snapshot` while logged in as the service account.
2. You should receive a JPEG. If the browser prompts you to download XML/HTML, the account lacks permission.
3. The plugin appends size hints automatically; no additional tuning is required.

### 6. Decide on HTTPS vs HTTP

1. Under **System → Maintenance → Certificates** (exact menu differs per model) upload a trusted certificate if you want to keep `verifySSL: true`.
2. If you keep the factory self-signed certificate, leave `verifySSL` disabled in the plugin. The data path still runs over HTTPS; only certificate validation is skipped.
3. For older devices that do not support HTTPS, switch the plugin `protocol` to `http` and ensure your network is trusted.

### 7. Final Checklist and Testing

- **Connectivity**: From your Homebridge server run:

  ```bash
  curl -u user:pass https://IP/api/call/status
  curl -u user:pass https://IP/api/dir/query
  curl -u user:pass "https://IP/api/switch/ctrl?switch=1&action=trigger"
  ```

  Each command should return JSON (or trigger the relay) without HTTP errors.

- **Doorbell Logging**: Press the hardware button and confirm the Homebridge log prints `🔔 Doorbell button pressed!`. If it does not, re-check directory permissions and the `call/status` endpoint.
- **Directory Sync**: After the first successful startup, open the Homebridge Config UI form again—the doorbell filter dropdown should show the peers detected above.
- **HomeKit Test**: Open the Home app camera tile and verify you can request snapshots and open the RTSP feed. Toggle the switch accessory to ensure the correct relay fires.

---

## Need Help?

- Enable debug logging in Homebridge and attach the log snippet when opening an issue.
- Use the GitHub issues page if a parameter is unclear or if the plugin fails to read your directory peers.
- Contributions describing additional 2N models or edge cases are welcome.

MIT © Jan Maštalíř
