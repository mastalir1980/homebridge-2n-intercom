import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import path from 'path';

import { PLATFORM_NAME, PLUGIN_NAME, TwoNIntercomConfig } from './settings';
import { TwoNIntercomAccessory } from './accessory';
import { fetchDirectoryPeers } from './schemaService';
import { writeDynamicSchema } from './schemaGenerator';

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
  // Cached directory peers (button peers)
  public directoryPeers: Array<{ name: string; peer: string }> = [];

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
    this.config.snapshotRefreshInterval = this.config.snapshotRefreshInterval || 30;
    this.config.protocol = this.config.protocol || 'https'; // Default HTTPS
    this.config.verifySSL = this.config.verifySSL !== undefined ? this.config.verifySSL : false; // Default false
    this.config.switchDuration = 1000; // Fixed 1 second
    this.config.doorbellPollingInterval = 2000; // Fixed 2 seconds
    
    // Auto-generate URLs from host IP
    this.generateUrls();
    
    this.log.info('🏠 2N Intercom Platform initialized');
    this.log.info(`📡 Device: ${this.config.host}`);
    this.log.info(`� Protocol: ${this.config.protocol?.toUpperCase()} (SSL verify: ${this.config.verifySSL ? 'enabled' : 'disabled'})`);
    this.log.info(`�🚪 Door relay: ${this.config.doorSwitchNumber}`);
    this.log.info(`🔔 Doorbell: ${this.config.enableDoorbell ? 'enabled' : 'disabled'}`);
    this.log.info(`📺 Video quality: ${this.config.videoQuality.toUpperCase()}`);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.fetchAndLogSipAccounts();
      this.discoverDevices();
    });
  }

  /**
   * Fetch and log available SIP accounts and directory peers from the intercom
   */
  private async fetchAndLogSipAccounts(): Promise<void> {
    try {
      this.log.info('🔍 Fetching directory and SIP accounts from intercom...');
      
      // Fetch directory peers (button peers)
      this.log.debug('========== Directory Discovery Debug Start ==========');
      this.directoryPeers = await fetchDirectoryPeers(
        this.config.host,
        this.config.user,
        this.config.pass,
        this.config.protocol || 'https',
        this.config.verifySSL || false,
        this.log,
      );
      this.log.debug('========== Directory Discovery Debug End ==========');
      
      if (this.directoryPeers.length > 0) {
        this.log.info(`📞 Found ${this.directoryPeers.length} phone number(s) in directory:`);
        this.directoryPeers.forEach((button, index) => {
          // Extract just the phone number from peer (e.g., "4374834473/2" -> "4374834473")
          const phoneNumber = button.peer.split('/')[0];
          this.log.info(`   ${index + 1}. ${phoneNumber} (${button.name})`);
        });
        this.log.info('💡 These numbers are available in the doorbell filter configuration');
      }
      await this.updateDynamicSchema();
      

      
      if (this.directoryPeers.length > 0) {
        this.log.info('💡 Use directory button peer values in the "Filter Doorbell by Caller" configuration');
      } else {
        this.log.warn('⚠️  No directory buttons found on the intercom');
        this.log.warn('    Check that:');
        this.log.warn('    1. Directory is configured with buttons in the intercom');
        this.log.warn('    2. Your credentials have access to the directory');
      }
    } catch (error) {
      this.log.error('❌ Failed to fetch directory/SIP data:', error);
      this.log.warn('You can still manually configure peer filtering');
    }
  }

  /**
   * Auto-generate URLs based on host IP address
   */
  private generateUrls(): void {
    const host = this.config.host;
    const switchNum = this.config.doorSwitchNumber;
    
    // Use explicitly configured protocol (defaults to HTTPS)
    const protocol = this.config.protocol || 'https';
    
    // Clean host (remove protocol if included)
    const cleanHost = host.replace(/^https?:\/\//, '');
    
    // Generate all URLs based on 2N API standards
    this.config.doorOpenUrl = `${protocol}://${cleanHost}/api/switch/ctrl?switch=${switchNum}&action=on`;
    this.config.snapshotUrl = `${protocol}://${cleanHost}/api/camera/snapshot`;
    this.config.streamUrl = `rtsp://${cleanHost}:554/h264_stream`;
    this.config.doorbellEventsUrl = `${protocol}://${cleanHost}/api/call/status`;
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
        protocol: this.config.protocol,
        verifySSL: this.config.verifySSL,
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
        protocol: this.config.protocol,
        verifySSL: this.config.verifySSL,
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
        doorbellFilterPeer: this.config.doorbellFilterPeer || '',
        directoryPeers: this.directoryPeers,
        videoQuality: this.config.videoQuality,
        snapshotRefreshInterval: this.config.snapshotRefreshInterval,
        protocol: this.config.protocol,
        verifySSL: this.config.verifySSL,
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
        doorbellFilterPeer: this.config.doorbellFilterPeer || '',
        directoryPeers: this.directoryPeers,
        videoQuality: this.config.videoQuality,
        snapshotRefreshInterval: this.config.snapshotRefreshInterval,
        protocol: this.config.protocol,
        verifySSL: this.config.verifySSL,
      };

      new TwoNIntercomAccessory(this, cameraAccessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cameraAccessory]);
    }
  }

  private async updateDynamicSchema(): Promise<void> {
    try {
      const baseSchemaPath = path.resolve(__dirname, '..', 'config.schema.json');
      const storagePath = this.api.user.storagePath();

      await writeDynamicSchema({
        baseSchemaPath,
        storagePath,
        peers: this.directoryPeers,
        log: this.log,
      });
    } catch (error) {
      this.log.warn('⚠️  Unable to update dynamic config schema:', error);
    }
  }
}