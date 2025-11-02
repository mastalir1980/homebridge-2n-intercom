import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import axios from 'axios';
import { TwoNIntercomPlatform } from './platform';
// import { TwoNStreamingDelegate } from './streamingDelegate'; // MVP: Camera streaming disabled

/**
 * Platform Accessory (MVP version - door unlock switch only)
 * An instance of this class is created for each accessory your platform registers
 */
export class TwoNIntercomAccessory {
  // MVP: Only switch service for door unlock
  private switchService: Service;

  // Future features (commented out for MVP)
  // private doorbellService: Service;
  // private contactSensorService: Service;
  // private streamingDelegate: TwoNStreamingDelegate;
  // private doorState: CharacteristicValue = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
  // private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly platform: TwoNIntercomPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, '2N')
      .setCharacteristic(this.platform.Characteristic.Model, 'Intercom MVP')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.host);

    // MVP: Create Switch service for door unlock
    this.switchService = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, 'Door Unlock');

    this.switchService.setCharacteristic(this.platform.Characteristic.Name, 'Door Unlock');

    this.switchService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleSwitchOnGet.bind(this))
      .onSet(this.handleSwitchOnSet.bind(this));

    // Future features (commented out for MVP)
    
    /* MVP: Doorbell service disabled
    this.doorbellService = this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell);
    this.doorbellService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
    this.doorbellService.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .onGet(this.handleProgrammableSwitchEventGet.bind(this));
    */

    /* MVP: Contact Sensor service disabled
    this.contactSensorService = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor, 'Door Status');
    this.contactSensorService.setCharacteristic(this.platform.Characteristic.Name, 'Door Status');
    this.contactSensorService.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.handleContactSensorStateGet.bind(this));
    */

    /* MVP: Camera streaming disabled
    this.streamingDelegate = new TwoNStreamingDelegate(
      this.platform.api.hap,
      this.platform.log,
      accessory.context.device.snapshotUrl,
      accessory.context.device.streamUrl,
      accessory.context.device.user,
      accessory.context.device.pass,
    );
    const cameraController = this.streamingDelegate.getController();
    this.accessory.configureController(cameraController);
    */

    /* MVP: Door status polling disabled
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
        this.platform.log.info(`Switch will turn off after ${switchDuration}ms`);
        
        setTimeout(() => {
          this.switchService.updateCharacteristic(this.platform.Characteristic.On, false);
          this.platform.log.info('Switch turned off');
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

      this.platform.log.info('Door unlocked successfully');
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
}
