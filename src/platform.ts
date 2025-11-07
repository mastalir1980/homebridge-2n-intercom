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
      this.log.error('Missing required configuration: host, user, and pass are required');
      return;
    }

    // Set defaults for optional parameters
    this.config.doorSwitchNumber = this.config.doorSwitchNumber || 1;
    this.config.enableDoorbell = this.config.enableDoorbell !== false; // Default true
    this.config.videoQuality = this.config.videoQuality || 'vga';
    this.config.snapshotRefreshInterval = this.config.snapshotRefreshInterval || 10;
    this.config.deviceType = this.config.deviceType || 'garage';
    this.config.protocol = this.config.protocol || 'https';
    this.config.switchDuration = 1000; // Fixed 1 second
    this.config.doorbellPollingInterval = 2000; // Fixed 2 seconds
    
    // Auto-generate URLs from host IP
    this.generateUrls();
    
    this.log.info('🏠 2N Intercom Platform initialized');
    this.log.info(`📡 Device: ${this.config.host}`);
    this.log.info(`🚪 Door relay: ${this.config.doorSwitchNumber}`);
    this.log.info(`🔔 Doorbell: ${this.config.enableDoorbell ? 'enabled' : 'disabled'}`);
    this.log.info(`📺 Video quality: ${this.config.videoQuality.toUpperCase()}`);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  /**
   * Auto-generate URLs based on host IP address
   */
  private generateUrls(): void {
    const host = this.config.host;
    const switchNum = this.config.doorSwitchNumber;
    const protocol = this.config.protocol;
    
    // Generate all URLs based on 2N API standards with selected protocol
    this.config.doorOpenUrl = `${protocol}://${host}/api/switch/ctrl?switch=${switchNum}&action=on`;
    this.config.snapshotUrl = `${protocol}://${host}/api/camera/snapshot`;
    this.config.streamUrl = `rtsp://${host}:554/h264_stream`; // RTSP always uses rtsp://
    this.config.doorbellEventsUrl = `${protocol}://${host}/api/call/status`;
    

  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    this.createSwitchAccessory();
    this.createCameraAccessory();
  }

  private createSwitchAccessory() {
    // Try to find accessory with legacy UUID first (for backward compatibility)
    const legacySwitchUuid = this.api.hap.uuid.generate(this.config.host + '-switch');
    let existingSwitchAccessory = this.accessories.find(accessory => accessory.UUID === legacySwitchUuid);
    
    // If not found with legacy UUID, try new UUID format
    if (!existingSwitchAccessory) {
      const uuid = this.api.hap.uuid.generate((this.config.name || '2N Intercom') + ' Switch');
      existingSwitchAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    }
    
    const uuid = existingSwitchAccessory ? existingSwitchAccessory.UUID : this.api.hap.uuid.generate((this.config.name || '2N Intercom') + ' Switch');

    if (existingSwitchAccessory) {
      this.log.info('Restoring existing switch accessory from cache:', existingSwitchAccessory.displayName);
      
      existingSwitchAccessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        doorOpenUrl: this.config.doorOpenUrl,
        switchDuration: this.config.switchDuration,
        deviceType: this.config.deviceType,
        type: 'switch',
      };

      new TwoNIntercomAccessory(this, existingSwitchAccessory);
    } else {
      this.log.info('Adding new switch accessory:', (this.config.name || '2N Intercom') + ' Switch');
      
      const switchAccessory = new this.api.platformAccessory((this.config.name || '2N Intercom') + ' Switch', uuid);
      
      switchAccessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        doorOpenUrl: this.config.doorOpenUrl,
        switchDuration: this.config.switchDuration,
        deviceType: this.config.deviceType,
        type: 'switch',
      };

      new TwoNIntercomAccessory(this, switchAccessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [switchAccessory]);
    }
  }

  private createCameraAccessory() {
    // Try to find accessory with legacy UUID first (for backward compatibility)  
    const legacyCameraUuid = this.api.hap.uuid.generate(this.config.host + '-camera');
    let existingCameraAccessory = this.accessories.find(accessory => accessory.UUID === legacyCameraUuid);
    
    // If not found with legacy UUID, try new UUID format
    if (!existingCameraAccessory) {
      const cameraUuid = this.api.hap.uuid.generate((this.config.name || '2N Intercom') + ' Camera');
      existingCameraAccessory = this.accessories.find(accessory => accessory.UUID === cameraUuid);
    }
    
    const cameraUuid = existingCameraAccessory ? existingCameraAccessory.UUID : this.api.hap.uuid.generate((this.config.name || '2N Intercom') + ' Camera');

    if (existingCameraAccessory) {
      this.log.info('Restoring existing camera accessory from cache:', existingCameraAccessory.displayName);
      
      existingCameraAccessory.context.device = {
        host: this.config.host,
        user: this.config.user,
        pass: this.config.pass,
        snapshotUrl: this.config.snapshotUrl,
        streamUrl: this.config.streamUrl,
        type: 'camera',
        enableDoorbell: this.config.enableDoorbell,
        doorbellEventsUrl: this.config.doorbellEventsUrl,
        doorbellPollingInterval: this.config.doorbellPollingInterval,
        videoQuality: this.config.videoQuality,
        snapshotRefreshInterval: this.config.snapshotRefreshInterval,
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
        enableDoorbell: this.config.enableDoorbell,
        doorbellEventsUrl: this.config.doorbellEventsUrl,
        doorbellPollingInterval: this.config.doorbellPollingInterval,
        videoQuality: this.config.videoQuality,
        snapshotRefreshInterval: this.config.snapshotRefreshInterval,
      };

      new TwoNIntercomAccessory(this, cameraAccessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cameraAccessory]);
    }
  }
}