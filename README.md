# Homebridge 2N Intercom

[![npm version](https://badge.fury.io/js/homebridge-2n-intercom.svg)](https://badge.fury.io/js/homebridge-2n-intercom)
[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Practical Homebridge plugin for 2N intercoms. It provides a HomeKit door switch (relay control), camera stream with snapshots, and an optional doorbell service exposed inside the camera accessory. The guide below is written for Homebridge users with basic DIY experience.

## Install the plugin

```
npm install -g homebridge-2n-intercom
```

Or simply install it from the **Plugins** tab inside Homebridge Config UI X. The UI form is the recommended way to configure it.

---

## Homebridge UI form – what to fill in

Open the plugin settings in Config UI X. Every field maps 1:1 to the list below.

| UI Label | What it does | What to type |
| --- | --- | --- |
| **Platform Name** | How the accessory shows up in logs / HomeKit. | Any friendly name, e.g. `Front Gate` |
| **2N Intercom IP Address** | Where the plugin talks to. | Your intercom IP (add `:port` if you changed HTTPS port) |
| **Username / Password** | Account used for the HTTP API. | Use a service user you created on the intercom |
| **Door Relay Number** | Which relay the HomeKit switch should trigger. | Usually `1`. Pick `2-4` if you wired a different relay |
| **Enable Doorbell Notifications** | Exposes the doorbell service within the camera accessory (generates HomeKit notifications). | Enable unless you only want the door switch |
| **Doorbell Filter by Phone Number** | Optional filter so only one directory entry rings HomeKit. | Leave blank for “everyone”. Otherwise pick one of the dropdown values the plugin discovered |
| **Video Stream Quality** | Tells FFmpeg which stream profile to use. | `VGA (640×480)` starts fastest, `HD` needs more CPU |
| **Snapshot Refresh Interval** | How often a fresh picture is pulled. | `30` seconds is a good default. Use `10` if you want faster refresh |
| **Connection Protocol** | HTTP vs HTTPS. | Stick with `HTTPS` unless your unit is legacy |
| **Verify SSL Certificates** | Whether to validate the HTTPS certificate. | Turn **off** if you kept the factory self‑signed cert; turn **on** if you uploaded a trusted one |

### Doorbell filter

- On startup the plugin reads the 2N directory and shows discovered button names in the dropdown.
- Leave the field empty to allow all incoming calls (any button press).
- Select a discovered entry to limit notifications to that button only.
- Advanced users may enter a SIP identifier manually when needed.

### Defaults at a glance

- HTTPS enabled, SSL verification disabled (best for self-signed factory certs).
- Door relay `1`, doorbell enabled, VGA video, snapshots cached for 30 seconds.
- Hidden power-user options (`doorOpenUrl`, `streamUrl`, etc.) are auto-generated—no need to touch JSON.

---

## 2N intercom setup checklist

You only have to configure this once on the intercom web UI. Follow the steps in order.

1. **Create a service account**
  - Log into the 2N web UI → **Services → HTTP API** → enable it.
  - Create a user (or reuse one) and allow it to call these endpoints: `/api/dir/query`, `/api/call/status`, `/api/switch/ctrl`, `/api/camera/snapshot`.
  - Test in a browser: `https://IP/api/call/status`. If you see JSON after logging in, your account works.

2. **Match the relay number**
  - Go to **Hardware → Switches** and note which relay drives your door strike.
  - Use that number in **Door Relay Number** inside Homebridge. When you toggle the HomeKit switch, the plugin runs `/api/switch/ctrl?switch=<number>&action=trigger` for you.

3. **Program the directory buttons**
  - Under **Directory → Users / Buttons**, create entries for each physical button or keypad slot.
  - Assign them so that pressing the hardware button places a call to a specific peer.
  - Restart Homebridge once—you should now see those entries listed in the doorbell filter dropdown and in the logs (startup log lists discovered peers).

4. **Enable video streaming**
  - Visit **Services → Streaming** → ensure an H.264 profile such as `h264_stream` is active.
  - Test it with VLC: `rtsp://user:pass@IP:554/h264_stream`. If VLC plays it, the Home app will as well.

5. **Check snapshots**
  - Open `https://IP/api/camera/snapshot` in a browser while logged in as the service user.
  - You should download a JPEG still. If you get HTML or an error, fix the account permissions.

6. **Decide on HTTPS vs HTTP**
  - If you leave the factory certificate, keep `Verify SSL Certificates` **off**.
  - If you uploaded a trusted cert (under **System → Certificates**), feel free to enable verification.
  - Only choose HTTP if your unit truly cannot serve HTTPS.

7. **Final sanity checks**
  - From your Homebridge box you can run:

    ```bash
    curl -u user:pass https://IP/api/call/status
    curl -u user:pass https://IP/api/dir/query
    curl -u user:pass "https://IP/api/switch/ctrl?switch=1&action=trigger"
    ```

  - Each command should succeed. After that, open the Home app, tap the camera tile, and test the door switch + doorbell notification.

---

## Need help?

- Enable **Debug** logs in Homebridge if something does not show up; the plugin prints very explicit hints (missing permissions, unknown caller, etc.).
- File issues or share ideas on [GitHub](https://github.com/mastalir1980/homebridge-2n-intercom/issues).
- Pull requests that improve wording or cover other 2N models are welcome.

MIT © Jan Maštalíř
