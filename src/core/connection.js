/**
 * Sonicake Connection Manager
 * Supports Web MIDI (USB) and Web Bluetooth (BLE) with unified SysEx transport.
 */

export class SonicakeConnection {
  constructor() {
    this.connectionType = null; // 'usb', 'ble', or null
    this.isConnected = false;
    this.deviceName = 'Disconnected';
    
    // USB MIDI
    this.midiAccess = null;
    this.midiInput = null;
    this.midiOutput = null;
    this.usbMidiBuffer = null;
    this.usbMultiPacketResponses = {};
    
    // BLE
    this.bleDevice = null;
    this.bleServer = null;
    this.bleCharacteristic = null;
    this.SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
    this.CHARACTERISTIC_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

    // Callbacks
    this.messageHandlers = new Set();
    this.statusHandlers = new Set();
    this.logHandlers = new Set();
  }

  onMessage(callback) {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }

  onStatusChange(callback) {
    this.statusHandlers.add(callback);
    return () => this.statusHandlers.delete(callback);
  }

  onLog(callback) {
    this.logHandlers.add(callback);
    return () => this.logHandlers.delete(callback);
  }

  log(message, type = 'info') {
    this.logHandlers.forEach(handler => handler({ message, type, time: new Date() }));
  }

  notifyStatus() {
    const status = {
      isConnected: this.isConnected,
      type: this.connectionType,
      deviceName: this.deviceName
    };
    this.statusHandlers.forEach(handler => handler(status));
  }

  /**
   * Check for connected USB MIDI devices
   */
  async getAvailableUsbDevices() {
    if (!navigator.requestMIDIAccess) {
      this.log('Web MIDI API is not supported in this browser. Please use Chrome or Edge.', 'warning');
      return [];
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      const inputs = Array.from(this.midiAccess.inputs.values());
      const outputs = Array.from(this.midiAccess.outputs.values());

      const pairs = [];
      inputs.forEach(input => {
        const matchingOutput = outputs.find(output => 
          output.name === input.name || 
          output.name.includes(input.name) || 
          input.name.includes(output.name)
        );
        pairs.push({
          name: input.name || 'MIDI Device',
          input,
          output: matchingOutput || outputs[0] || null
        });
      });

      return pairs;
    } catch (err) {
      this.log(`Error checking MIDI devices: ${err.message}`, 'error');
      return [];
    }
  }

  /**
   * Connect via USB MIDI
   */
  async connectUsb(devicePair = null) {
    try {
      this.log('Scanning for USB MIDI devices...', 'info');
      const pairs = await this.getAvailableUsbDevices();

      if (pairs.length === 0) {
        throw new Error('No USB MIDI devices found. Make sure your Smart Box is turned on and connected via USB.');
      }

      // Prioritize devices named 'Smart Box', 'Sonicake', 'Sonic', or 'QME'
      let selected = devicePair;
      if (!selected) {
        selected = pairs.find(p => /smart box|sonicake|sonic|qme/i.test(p.name)) || pairs[0];
      }

      if (!selected.output) {
        throw new Error(`Device "${selected.name}" has no corresponding MIDI Output port.`);
      }

      this.midiInput = selected.input;
      this.midiOutput = selected.output;
      this.connectionType = 'usb';
      this.deviceName = selected.name;

      this.usbMidiBuffer = null;
      this.usbMultiPacketResponses = {};

      this.midiInput.onmidimessage = (event) => this.handleUsbMidiMessage(event);

      this.isConnected = true;
      this.log(`Connected via USB MIDI: ${selected.name}`, 'success');
      this.notifyStatus();
      return true;
    } catch (err) {
      this.log(`USB connection failed: ${err.message}`, 'error');
      throw err;
    }
  }

  /**
   * Handle incoming USB MIDI messages (reassemble SysEx packets)
   */
  handleUsbMidiMessage(event) {
    const data = event.data;
    if (!data || data.length === 0) return;

    // Check for SysEx (starts with F0, ends with F7)
    if (data.length < 4 || data[0] !== 0xF0 || data[data.length - 1] !== 0xF7) {
      // Chunked / partial SysEx packet
      if (this.usbMidiBuffer === null) {
        this.usbMidiBuffer = new Uint8Array(data);
      } else {
        const combined = new Uint8Array(this.usbMidiBuffer.length + data.length);
        combined.set(this.usbMidiBuffer);
        combined.set(data, this.usbMidiBuffer.length);
        this.usbMidiBuffer = combined;
      }

      // Check if complete now
      if (this.usbMidiBuffer[0] === 0xF0 && this.usbMidiBuffer[this.usbMidiBuffer.length - 1] === 0xF7) {
        data = this.usbMidiBuffer;
        this.usbMidiBuffer = null;
      } else {
        return;
      }
    }

    let message = data;
    if (this.usbMidiBuffer !== null) {
      const combined = new Uint8Array(this.usbMidiBuffer.length + data.length);
      combined.set(this.usbMidiBuffer);
      combined.set(data, this.usbMidiBuffer.length);
      message = combined;
      this.usbMidiBuffer = null;
    }

    // Packet counting
    const totalPackets = (message[3] << 4) | message[4];
    const currentPacket = (message[5] << 4) | message[6];

    if (totalPackets > 1) {
      const responseId = `${message[3]}_${message[4]}`;
      if (!this.usbMultiPacketResponses[responseId]) {
        this.usbMultiPacketResponses[responseId] = {
          totalPackets,
          packets: {},
          startTime: Date.now()
        };
      }

      const response = this.usbMultiPacketResponses[responseId];
      response.packets[currentPacket] = message;

      let allPacketsReceived = true;
      for (let i = 0; i < totalPackets; i++) {
        if (!(i in response.packets)) {
          allPacketsReceived = false;
          break;
        }
      }

      if (allPacketsReceived) {
        const reassembledPayload = [];
        for (let i = 0; i < totalPackets; i++) {
          const pkt = response.packets[i];
          const payloadStart = 9;
          const payloadEnd = pkt.length - 1;
          for (let j = payloadStart; j < payloadEnd; j++) {
            reassembledPayload.push(pkt[j]);
          }
        }

        const singlePacketMessage = new Uint8Array(reassembledPayload.length + 10);
        singlePacketMessage[0] = 0xF0;
        singlePacketMessage[1] = message[1];
        singlePacketMessage[2] = message[2];
        singlePacketMessage[3] = 0x00;
        singlePacketMessage[4] = 0x01;
        singlePacketMessage[5] = 0x00;
        singlePacketMessage[6] = 0x00;
        singlePacketMessage[7] = message[7];
        singlePacketMessage[8] = message[8];
        singlePacketMessage.set(reassembledPayload, 9);
        singlePacketMessage[singlePacketMessage.length - 1] = 0xF7;

        delete this.usbMultiPacketResponses[responseId];

        // Format as BLE-equivalent hex starting with 8080F0 for unified handlers
        const hex = '8080' + Array.from(singlePacketMessage).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        this.dispatchMessage(hex);
      }
    } else {
      // Single packet message
      const hex = '8080' + Array.from(message).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      this.dispatchMessage(hex);
    }
  }

  /**
   * Connect via Web Bluetooth (BLE)
   */
  async connectBle() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API is not supported in this browser. Please use Chrome or Edge.');
    }

    try {
      this.log('Searching for Sonicake Bluetooth devices...', 'info');
      this.bleDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { name: 'Sonic Master BLE' },
          { namePrefix: 'Sonic' },
          { namePrefix: 'Smart' },
          { services: [this.SERVICE_UUID] }
        ],
        optionalServices: [this.SERVICE_UUID]
      });

      this.log(`Connecting to BLE device: ${this.bleDevice.name}...`, 'info');

      this.bleDevice.addEventListener('gattserverdisconnected', () => {
        this.log('Bluetooth device disconnected', 'warning');
        this.disconnect();
      });

      this.bleServer = await this.bleDevice.gatt.connect();
      const service = await this.bleServer.getPrimaryService(this.SERVICE_UUID);
      this.bleCharacteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);

      await this.bleCharacteristic.startNotifications();
      this.bleCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
        const data = new Uint8Array(event.target.value.buffer);
        const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        this.dispatchMessage(hex);
      });

      this.connectionType = 'ble';
      this.deviceName = this.bleDevice.name || 'Sonicake BLE';
      this.isConnected = true;
      this.log(`Connected via Bluetooth: ${this.deviceName}`, 'success');
      this.notifyStatus();
      return true;
    } catch (err) {
      this.log(`Bluetooth connection failed: ${err.message}`, 'error');
      throw err;
    }
  }

  /**
   * Dispatch raw incoming hex message to registered handlers
   */
  dispatchMessage(hexString) {
    this.messageHandlers.forEach(handler => handler(hexString));
  }

  /**
   * Send a SysEx hex command string to the pedal
   * @param {string} commandString Hex string, with or without 8080 prefix
   */
  async writeCommand(commandString) {
    if (!this.isConnected) {
      this.log('Cannot send: Device is not connected', 'error');
      return false;
    }

    try {
      const cleanHex = commandString.replace(/\s+/g, '');
      const hexBytes = cleanHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16));
      const commandBytes = new Uint8Array(hexBytes);

      if (this.connectionType === 'usb' && this.midiOutput) {
        // For USB MIDI, strip the 8080 prefix if present
        let payload = commandBytes;
        if (payload[0] === 0x80 && payload[1] === 0x80) {
          payload = payload.slice(2);
        }
        this.midiOutput.send(payload);
        this.log(`Sent USB MIDI: ${cleanHex.slice(4)}`, 'sent');
      } else if (this.connectionType === 'ble' && this.bleCharacteristic) {
        // For BLE, keep or prepend 8080
        let payload = commandBytes;
        if (payload[0] !== 0x80 || payload[1] !== 0x80) {
          const blePacket = new Uint8Array(commandBytes.length + 2);
          blePacket[0] = 0x80;
          blePacket[1] = 0x80;
          blePacket.set(commandBytes, 2);
          payload = blePacket;
        }
        await this.bleCharacteristic.writeValueWithoutResponse(payload);
        this.log(`Sent BLE: ${cleanHex}`, 'sent');
      }
      return true;
    } catch (err) {
      this.log(`Send command failed: ${err.message}`, 'error');
      return false;
    }
  }

  /**
   * Disconnect current active device
   */
  disconnect() {
    if (this.connectionType === 'usb' && this.midiInput) {
      this.midiInput.onmidimessage = null;
      this.midiInput = null;
      this.midiOutput = null;
    } else if (this.connectionType === 'ble' && this.bleDevice) {
      if (this.bleDevice.gatt.connected) {
        this.bleDevice.gatt.disconnect();
      }
      this.bleDevice = null;
      this.bleCharacteristic = null;
    }

    this.isConnected = false;
    this.connectionType = null;
    this.deviceName = 'Disconnected';
    this.notifyStatus();
    this.log('Disconnected from device', 'info');
  }
}

export const connection = new SonicakeConnection();
