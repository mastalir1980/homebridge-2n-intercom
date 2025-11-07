/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = 'TwoNIntercom';

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
  videoQuality?: 'vga' | 'hd'; // Video stream quality, default: 'vga'
  
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
