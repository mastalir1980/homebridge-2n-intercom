/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = '2NIntercom';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-2n-intercom';

/**
 * Configuration interface for the 2N Intercom plugin
 */
export interface TwoNIntercomConfig {
  platform: string;
  name?: string;
  host: string;
  user: string;
  pass: string;
  doorOpenUrl: string;
  switchDuration?: number; // Duration in milliseconds that switch stays on, defaults to 1000
  // Camera and streaming features
  snapshotUrl?: string; // URL for camera snapshots (e.g., http://IP/api/camera/snapshot)
  streamUrl?: string; // RTSP URL for video streaming (e.g., rtsp://IP:554/stream)
  
  // Doorbell configuration
  enableDoorbell?: boolean; // Enable doorbell functionality
  doorbellEventsUrl?: string;  // API endpoint to check for button press events (e.g., "http://IP/api/call/status")
  doorbellPollingInterval?: number; // Polling interval in ms (default: 2000)
  doorbellWebhookPort?: number; // Port for receiving webhooks from 2N (optional)
}
