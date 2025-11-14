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
 * Version 2.0 - Simplified web-based configuration
 */
export interface TwoNIntercomConfig {
  platform: string;
  name?: string;
  host: string;
  user: string;
  pass: string;
  
  // Web-configurable parameters
  doorSwitchNumber?: number; // Which relay to use (1-4), default: 1
  enableDoorbell?: boolean; // Enable doorbell functionality, default: true
  doorbellFilterPeer?: string; // Filter selection: "" (all) or "custom" (use doorbellFilterPeerCustom)
  doorbellFilterPeerCustom?: string; // Custom SIP peer filter (e.g., "sip:4374834473@proxy.my2n.com:5061")
  videoQuality?: 'vga' | 'hd'; // Video stream quality, default: 'vga'
  snapshotRefreshInterval?: number; // Snapshot refresh interval in seconds, default: 10
  protocol?: 'http' | 'https'; // Protocol to use, default: 'https'
  verifySSL?: boolean; // Verify SSL certificates for HTTPS, default: false
  
  // Auto-generated internal URLs (not user-configurable)
  doorOpenUrl?: string; // Auto-generated from host and doorSwitchNumber
  snapshotUrl?: string; // Auto-generated from host
  streamUrl?: string; // Auto-generated from host
  doorbellEventsUrl?: string; // Auto-generated from host
  
  // Internal parameters (hidden from user)
  switchDuration?: number; // Fixed at 1000ms
  doorbellPollingInterval?: number; // Fixed at 2000ms
  doorbellWebhookPort?: number; // Optional webhook port
}
