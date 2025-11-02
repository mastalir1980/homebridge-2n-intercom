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
  snapshotUrl: string;
  streamUrl: string;
  doorOpenUrl: string;
  doorStatusUrl: string;
  pollInterval?: number; // in milliseconds, defaults to 5000
}
