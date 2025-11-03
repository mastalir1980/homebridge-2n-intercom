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

    // Camera URLs are optional - if not provided, only switch will be available
    if (!this.config.snapshotUrl || !this.config.streamUrl) {
            this.log.debug('Camera streaming enabled');
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
    // Create two separate accessories for better HomeKit compatibility
    this.createSwitchAccessory();
    
    // Only create camera accessory if URLs are provided
    if (this.config.snapshotUrl && this.config.streamUrl) {
      this.createCameraAccessory();
    }
  }

  private createSwitchAccessory() {
    // Generate UUID for switch accessory
    const switchUuid = this.api.hap.uuid.generate(this.config.host + '-switch');
    const existingSwitchAccessory = this.accessories.find(accessory => accessory.UUID === switchUuid);

    if (existingSwitchAccessory) {
      this.log.info('Restoring existing switch accessory from cache:', existingSwitchAccessory.displayName);
      
      // Update context
      existingSwitchAccessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        doorOpenUrl: this.config.doorOpenUrl,
        switchDuration: this.config.switchDuration || 1000,
        type: 'switch',
      };

      new TwoNIntercomAccessory(this, existingSwitchAccessory);
    } else {
      this.log.info('Adding new switch accessory:', (this.config.name || '2N Intercom') + ' Switch');
      
      const switchAccessory = new this.api.platformAccessory((this.config.name || '2N Intercom') + ' Switch', switchUuid);
      
      switchAccessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        doorOpenUrl: this.config.doorOpenUrl,
        switchDuration: this.config.switchDuration || 1000,
        type: 'switch',
      };

      new TwoNIntercomAccessory(this, switchAccessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [switchAccessory]);
    }
  }

  private createCameraAccessory() {
    // Generate UUID for camera accessory  
    const cameraUuid = this.api.hap.uuid.generate(this.config.host + '-camera');
    const existingCameraAccessory = this.accessories.find(accessory => accessory.UUID === cameraUuid);

    if (existingCameraAccessory) {
      this.log.info('Restoring existing camera accessory from cache:', existingCameraAccessory.displayName);
      
      // Update context
      existingCameraAccessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        snapshotUrl: this.config.snapshotUrl,
        streamUrl: this.config.streamUrl,
        type: 'camera',
      };

      new TwoNIntercomAccessory(this, existingCameraAccessory);
    } else {
      this.log.info('Adding new camera accessory:', (this.config.name || '2N Intercom') + ' Camera');
      
      const cameraAccessory = new this.api.platformAccessory((this.config.name || '2N Intercom') + ' Camera', cameraUuid);
      
      cameraAccessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        snapshotUrl: this.config.snapshotUrl,
        streamUrl: this.config.streamUrl,
        type: 'camera',
      };

      new TwoNIntercomAccessory(this, cameraAccessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cameraAccessory]);
    }
  }
}
