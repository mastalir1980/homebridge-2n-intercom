import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME, TwoNIntercomConfig } from './settings';
import { TwoNIntercomAccessory } from './accessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class TwoNIntercomPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig & TwoNIntercomConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // Validate required configuration
    if (!this.config.host || !this.config.user || !this.config.pass) {
      this.log.error('Missing required configuration: host, user, pass');
      return;
    }

    if (!this.config.doorOpenUrl) {
      this.log.error('Missing required configuration: doorOpenUrl');
      return;
    }

    if (!this.config.snapshotUrl || !this.config.streamUrl) {
      this.log.error('Missing required configuration: snapshotUrl, streamUrl');
      return;
    }

    /* Future features validation commented out
    if (!this.config.doorStatusUrl) {
      this.log.error('Missing required configuration: doorStatusUrl');
      return;
    }
    */

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    // Generate a unique id for the accessory
    const uuid = this.api.hap.uuid.generate(this.config.host);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      // create the accessory handler for the restored accessory
      new TwoNIntercomAccessory(this, existingAccessory);
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Adding new accessory:', this.config.name || '2N Intercom');

      // create a new accessory
      const accessory = new this.api.platformAccessory(this.config.name || '2N Intercom', uuid);

      // Store device configuration
      accessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        doorOpenUrl: this.config.doorOpenUrl,
        switchDuration: this.config.switchDuration || 1000,
        snapshotUrl: this.config.snapshotUrl,
        streamUrl: this.config.streamUrl,
        // Future features
        // doorStatusUrl: this.config.doorStatusUrl,
        // pollInterval: this.config.pollInterval || 5000,
      };

      // create the accessory handler for the newly create accessory
      new TwoNIntercomAccessory(this, accessory);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}
