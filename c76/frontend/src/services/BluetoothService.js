class BluetoothService {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristics = new Map();
    this.isConnected = false;
    this.isScanning = false;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.autoReconnect = true;
  }

  async scan() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API is not supported in this browser');
    }

    this.isScanning = true;
    this.notify('scan_started', {});

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'Muse' },
          { services: ['0000fe8d-0000-1000-8000-00805f9b34fb'] }
        ],
        optionalServices: ['battery_service']
      });

      this.notify('device_found', { device: this.device.name });
      return this.device;
    } catch (error) {
      this.notify('scan_error', { error: error.message });
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  async connect() {
    if (!this.device) {
      throw new Error('No device selected. Call scan() first.');
    }

    try {
      this.notify('connecting', {});
      
      this.server = await this.device.gatt.connect();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnection.bind(this));

      await this.discoverServicesAndCharacteristics();
      
      this.notify('connected', { device: this.device.name });
      return true;
    } catch (error) {
      this.notify('connect_error', { error: error.message });
      throw error;
    }
  }

  handleDisconnection(event) {
    this.isConnected = false;
    this.notify('disconnected', { device: event.target.name });

    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.notify('reconnecting', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts });
      
      setTimeout(() => {
        this.connect().catch(err => {
          console.error('Reconnection failed:', err);
        });
      }, 2000 * this.reconnectAttempts);
    }
  }

  async discoverServicesAndCharacteristics() {
    const services = await this.server.getPrimaryServices();
    
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      
      for (const characteristic of characteristics) {
        this.characteristics.set(characteristic.uuid, characteristic);
        
        if (characteristic.properties.notify) {
          await characteristic.startNotifications();
          characteristic.addEventListener('characteristicvaluechanged', this.handleData.bind(this));
        }
      }
    }
  }

  handleData(event) {
    const value = event.target.value;
    const uuid = event.target.uuid;
    
    const data = this.parseEEGData(value, uuid);
    if (data) {
      this.notify('eeg_data', data);
    }
  }

  parseEEGData(value, uuid) {
    if (value.byteLength < 2) return null;

    const channelData = [];
    const numChannels = 4;
    
    for (let i = 0; i < numChannels; i++) {
      const byteOffset = i * 2;
      if (byteOffset + 2 <= value.byteLength) {
        const rawValue = value.getInt16(byteOffset, true);
        channelData.push(rawValue * 0.0001);
      } else {
        channelData.push(0);
      }
    }

    return {
      channels: channelData,
      timestamp: Date.now(),
      uuid: uuid
    };
  }

  async disconnect() {
    this.autoReconnect = false;
    
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    
    this.isConnected = false;
    this.server = null;
    this.characteristics.clear();
    this.notify('disconnected', { manual: true });
  }

  simulateData() {
    const simulatedData = {
      channels: [
        Math.random() * 100 - 50,
        Math.random() * 100 - 50,
        Math.random() * 100 - 50,
        Math.random() * 100 - 50
      ],
      timestamp: Date.now(),
      simulated: true
    };

    this.notify('eeg_data', simulatedData);
    return simulatedData;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  notify(event, data) {
    if (!this.listeners.has(event)) return;
    
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`Error in listener for ${event}:`, e);
      }
    });
  }
}

export default new BluetoothService();
