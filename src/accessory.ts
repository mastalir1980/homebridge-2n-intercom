import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import axios from 'axios';
import { TwoNIntercomPlatform } from './platform';
import { TwoNStreamingDelegate } from './streamingDelegate';

/**
 * Platform Accessory - door unlock switch and camera
 * An instance of this class is created for each accessory your platform registers
 */
export class TwoNIntercomAccessory {
  // Active features
  private switchService?: Service;
  private streamingDelegate?: TwoNStreamingDelegate;
  private doorbellService?: Service;

  // Doorbell state tracking
  private isPolling = false;
  private pollingInterval?: NodeJS.Timeout;
  private lastCallState = false;

  constructor(
    private readonly platform: TwoNIntercomPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, '2N')
      .setCharacteristic(this.platform.Characteristic.Model, 'Intercom')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.host);

    const deviceType = accessory.context.device.type;

    // Create Switch service for door unlock (for switch accessory or combined)
    if (deviceType === 'switch' || !deviceType) {
      this.switchService = this.accessory.getService(this.platform.Service.Switch) ||
        this.accessory.addService(this.platform.Service.Switch);

      this.switchService.setCharacteristic(this.platform.Characteristic.Name, 'Door Unlock');

      this.switchService.getCharacteristic(this.platform.Characteristic.On)
        .onGet(this.handleSwitchOnGet.bind(this))
        .onSet(this.handleSwitchOnSet.bind(this));

      this.platform.log.info('Door unlock switch initialized');
    }

    // Setup camera streaming (for camera accessory)
    if (deviceType === 'camera' && accessory.context.device.snapshotUrl && accessory.context.device.streamUrl) {
      this.streamingDelegate = new TwoNStreamingDelegate(
        this.platform.api.hap,
        this.platform.log,
        accessory.context.device.snapshotUrl,
        accessory.context.device.streamUrl,
        accessory.context.device.user,
        accessory.context.device.pass,
      );

      // Configure camera controller  
      const cameraController = this.streamingDelegate.getController();
      this.accessory.configureController(cameraController);
      
      this.platform.log.info('Camera streaming enabled');
    }

    // Add doorbell service if enabled
    if (accessory.context.device.enableDoorbell) {
      this.doorbellService = this.accessory.getService(this.platform.Service.Doorbell) ||
        this.accessory.addService(this.platform.Service.Doorbell);
      this.doorbellService.setCharacteristic(this.platform.Characteristic.Name, `${accessory.displayName} Doorbell`);
      
      // Set up doorbell event handling
      this.doorbellService.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
        .onGet(this.handleProgrammableSwitchEventGet.bind(this));

      this.platform.log.info('Doorbell service enabled for:', accessory.displayName);
      
      // Start monitoring for doorbell events
      this.startDoorbellMonitoring();
    }

    /* Contact Sensor service disabled
    this.contactSensorService = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor, 'Door Status');
    this.contactSensorService.setCharacteristic(this.platform.Characteristic.Name, 'Door Status');
    this.contactSensorService.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.handleContactSensorStateGet.bind(this));
    */

    /* Door status polling disabled
    this.startPolling();
    */
  }

  /* MVP: Future features commented out
  handleProgrammableSwitchEventGet(): CharacteristicValue {
    this.platform.log.debug('Triggered GET ProgrammableSwitchEvent');
    return this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
  }

  handleContactSensorStateGet(): CharacteristicValue {
    this.platform.log.debug('Triggered GET ContactSensorState:', this.doorState);
    return this.doorState;
  }
  */

  /**
   * Handle requests to get the current value of the "On" characteristic (for door unlock switch)
   */
  handleSwitchOnGet(): CharacteristicValue {
    this.platform.log.debug('Triggered GET On');
    return false; // Switch is always off by default
  }

  /**
   * Handle requests to set the "On" characteristic (for door unlock)
   * MVP: Switch activates for configured duration then automatically turns off
   */
  async handleSwitchOnSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET On:', value);

    if (value) {
      try {
        await this.unlockDoor();
        
        // Automatically turn off the switch after configured duration
        const switchDuration = this.accessory.context.device.switchDuration || 1000;
        this.platform.log.debug(`Switch will turn off after ${switchDuration}ms`);
        
        setTimeout(() => {
          if (this.switchService) {
            this.switchService.updateCharacteristic(this.platform.Characteristic.On, false);
            this.platform.log.debug('Switch turned off');
          }
        }, switchDuration);
      } catch (error) {
        this.platform.log.error('Error unlocking door:', error);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  /**
   * MVP: Unlock the door by calling the configured URL
   */
  async unlockDoor(): Promise<void> {
    try {
      this.platform.log.info('Unlocking door...');
      
      await axios.get(this.accessory.context.device.doorOpenUrl, {
        auth: {
          username: this.accessory.context.device.user,
          password: this.accessory.context.device.pass,
        },
        timeout: 5000,
      });

      this.platform.log.debug('Door unlocked successfully');
    } catch (error) {
      this.platform.log.error('Failed to unlock door:', error);
      throw error;
    }
  }

  /* MVP: Future features commented out
  
  async pollDoorStatus(): Promise<void> {
    try {
      const response = await axios.get(this.accessory.context.device.doorStatusUrl, {
        auth: {
          username: this.accessory.context.device.user,
          password: this.accessory.context.device.pass,
        },
        timeout: 5000,
      });

      // Parse the door status response
      let isOpen = false;
      
      if (typeof response.data === 'object' && response.data !== null) {
        if (Array.isArray(response.data.inputs) && response.data.inputs.length > 0) {
          isOpen = response.data.inputs[0].value === 1;
        } 
        else if (response.data.open !== undefined || response.data.isOpen !== undefined || 
                 response.data.state !== undefined || response.data.status !== undefined) {
          isOpen = response.data.open || response.data.isOpen || 
                   response.data.state === 'open' || response.data.status === 'open' || false;
        }
      } else if (typeof response.data === 'string') {
        isOpen = response.data.toLowerCase().includes('open');
      } else if (typeof response.data === 'boolean') {
        isOpen = response.data;
      }

      const newState = isOpen ? 
        this.platform.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : 
        this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;

      if (this.doorState !== newState) {
        this.doorState = newState;
        this.platform.log.info('Door state changed to:', isOpen ? 'Open' : 'Closed');
        this.contactSensorService.updateCharacteristic(
          this.platform.Characteristic.ContactSensorState,
          this.doorState,
        );
      }
    } catch (error) {
      this.platform.log.error('Error polling door status:', error);
    }
  }

  startPolling(): void {
    const pollInterval = this.accessory.context.device.pollInterval || 5000;
    this.platform.log.info('Starting door status polling every', pollInterval, 'ms');
    this.pollDoorStatus();
    this.pollInterval = setInterval(() => {
      this.pollDoorStatus();
    }, pollInterval);
  }

  triggerDoorbellEvent(): void {
    this.platform.log.info('Doorbell triggered');
    this.doorbellService.updateCharacteristic(
      this.platform.Characteristic.ProgrammableSwitchEvent,
      this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
    );
  }
  */

  /**
   * Handle GET requests for doorbell events
   */
  async handleProgrammableSwitchEventGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Triggered GET ProgrammableSwitchEvent');
    // This is just for HomeKit compatibility, actual events are triggered via polling/webhooks
    return this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
  }

  /**
   * Start monitoring for doorbell button presses
   */
  startDoorbellMonitoring(): void {
    const config = this.accessory.context.device;
    
    if (config.doorbellEventsUrl) {
      const pollInterval = config.doorbellPollingInterval || 2000;
      this.platform.log.info(`Starting doorbell monitoring every ${pollInterval}ms`);
      
      this.isPolling = true;
      this.checkDoorbellStatus();
      
      this.pollingInterval = setInterval(() => {
        this.checkDoorbellStatus();
      }, pollInterval);
    } else {
      this.platform.log.warn('Doorbell enabled but no doorbellEventsUrl configured');
    }
  }

  /**
   * Check for doorbell button press events
   */
  async checkDoorbellStatus(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    try {
      const config = this.accessory.context.device;
      const response = await axios.get(config.doorbellEventsUrl!, {
        auth: {
          username: config.user,
          password: config.pass,
        },
        timeout: 5000,
      });

      // Different 2N models return different formats
      let isCallActive = false;
      
      if (response.data && typeof response.data === 'object') {
        // Handle various API response formats
        isCallActive = response.data.call_state === 'active' ||
                      response.data.state === 'calling' ||
                      response.data.status === 'incoming' ||
                      response.data.ringing === true ||
                      (response.data.calls && response.data.calls.length > 0);
      }

      // Trigger doorbell on state change from false to true
      if (isCallActive && !this.lastCallState) {
        this.triggerDoorbellEvent();
      }
      
      this.lastCallState = isCallActive;

    } catch (error) {
      this.platform.log.error('Error checking doorbell status:', error);
    }
  }

  /**
   * Trigger doorbell event in HomeKit
   */
  triggerDoorbellEvent(): void {
    this.platform.log.info('🔔 Doorbell button pressed!');
    
    if (this.doorbellService) {
      this.doorbellService.updateCharacteristic(
        this.platform.Characteristic.ProgrammableSwitchEvent,
        this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
      );
    }
  }

  /**
   * Stop doorbell monitoring when accessory is removed
   */
  stopDoorbellMonitoring(): void {
    this.isPolling = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }
}
