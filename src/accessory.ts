import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import axios from 'axios';
import { TwoNIntercomPlatform } from './platform';
import { TwoNStreamingDelegate } from './streamingDelegate';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TwoNIntercomAccessory {
  private doorbellService: Service;
  private contactSensorService: Service;
  private switchService: Service;
  private streamingDelegate: TwoNStreamingDelegate;

  private doorState: CharacteristicValue = this.platform.Characteristic.ContactSensorState.CONTACT_DETECTED;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly platform: TwoNIntercomPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, '2N')
      .setCharacteristic(this.platform.Characteristic.Model, 'Intercom')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.host);

    // Create Doorbell service
    this.doorbellService = this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell);

    this.doorbellService.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);

    // The doorbell can be triggered programmatically
    this.doorbellService.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .onGet(this.handleProgrammableSwitchEventGet.bind(this));

    // Create Contact Sensor service for door status
    this.contactSensorService = this.accessory.getService(this.platform.Service.ContactSensor) ||
      this.accessory.addService(this.platform.Service.ContactSensor, 'Door Status');

    this.contactSensorService.setCharacteristic(this.platform.Characteristic.Name, 'Door Status');

    this.contactSensorService.getCharacteristic(this.platform.Characteristic.ContactSensorState)
      .onGet(this.handleContactSensorStateGet.bind(this));

    // Create Switch service for door unlock
    this.switchService = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, 'Door Unlock');

    this.switchService.setCharacteristic(this.platform.Characteristic.Name, 'Door Unlock');

    this.switchService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleSwitchOnGet.bind(this))
      .onSet(this.handleSwitchOnSet.bind(this));

    // Setup camera streaming
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

    // Start polling for door status
    this.startPolling();
  }

  /**
   * Handle requests to get the current value of the "Programmable Switch Event" characteristic
   */
  handleProgrammableSwitchEventGet(): CharacteristicValue {
    this.platform.log.debug('Triggered GET ProgrammableSwitchEvent');
    return this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
  }

  /**
   * Handle requests to get the current value of the "Contact Sensor State" characteristic
   */
  handleContactSensorStateGet(): CharacteristicValue {
    this.platform.log.debug('Triggered GET ContactSensorState:', this.doorState);
    return this.doorState;
  }

  /**
   * Handle requests to get the current value of the "On" characteristic (for door unlock switch)
   */
  handleSwitchOnGet(): CharacteristicValue {
    this.platform.log.debug('Triggered GET On');
    return false; // Switch is always off by default
  }

  /**
   * Handle requests to set the "On" characteristic (for door unlock)
   */
  async handleSwitchOnSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET On:', value);

    if (value) {
      try {
        await this.unlockDoor();
        
        // Automatically turn off the switch after a short delay
        setTimeout(() => {
          this.switchService.updateCharacteristic(this.platform.Characteristic.On, false);
        }, 1000);
      } catch (error) {
        this.platform.log.error('Error unlocking door:', error);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
  }

  /**
   * Unlock the door by calling the configured URL
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

  /**
   * Poll the door status from the configured URL
   */
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
      // The 2N API may return different formats depending on the model and configuration:
      // - Object with properties: { open: true/false } or { state: "open"/"closed" }
      // - String: "open" or "closed"
      // - Boolean: true (open) or false (closed)
      // Users may need to customize this logic based on their specific 2N intercom API
      let isOpen = false;
      
      if (typeof response.data === 'object' && response.data !== null) {
        // Try common property names that might indicate door state
        isOpen = response.data.open || response.data.isOpen || response.data.state === 'open' || 
                 response.data.status === 'open' || false;
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

  /**
   * Start polling for door status at the configured interval
   */
  startPolling(): void {
    const pollInterval = this.accessory.context.device.pollInterval || 5000;
    this.platform.log.info('Starting door status polling every', pollInterval, 'ms');

    // Poll immediately
    this.pollDoorStatus();

    // Then poll at the configured interval
    this.pollInterval = setInterval(() => {
      this.pollDoorStatus();
    }, pollInterval);
  }

  /**
   * Trigger doorbell event (can be called externally if needed)
   */
  triggerDoorbellEvent(): void {
    this.platform.log.info('Doorbell triggered');
    this.doorbellService.updateCharacteristic(
      this.platform.Characteristic.ProgrammableSwitchEvent,
      this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
    );
  }
}
