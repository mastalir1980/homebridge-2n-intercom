/**
 * This is the name of the platform that users will use to register the plugin in the Homebridge config.json
 */
export const PLATFORM_NAME = '2NIntercom';

/**
 * This must match the name of your plugin as defined the package.json
 */
export const PLUGIN_NAME = 'homebridge-2n-intercom';

/**
 * Configuration interface for the 2N Intercom plugin (MVP version)
 */
export interface TwoNIntercomConfig {
  platform: string;
  name?: string;
  host: string;
  user: string;
  pass: string;
  doorOpenUrl: string;
  switchDuration?: number; // Duration in milliseconds that switch stays on, defaults to 1000
  // Camera and streaming features (future)
  // snapshotUrl?: string;
  // streamUrl?: string;
  // Door status polling (future)
  // doorStatusUrl?: string;
  // pollInterval?: number;
}
