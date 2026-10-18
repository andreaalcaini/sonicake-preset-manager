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
    this.multiFrameAnswers = {}; // multi-frame answers being collected (USB and BLE)
    
    // BLE
    this.bleDevice = null;
    this.bleServer = null;
    this.bleCharacteristic = null;
    this.bleBuffer = []; // bytes of the SysEx frame being received over BLE
    this.bleWatchedDevices = new WeakSet();
    this.SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
    this.CHARACTERISTIC_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

    // Callbacks
    this.messageHandlers = new Set();
    this.statusHandlers = new Set();
    this.logHandlers = new Set();
    this.programChangeHandlers = new Set();
  }

  onMessage(callback) {
    this.messageHandlers.add(callback);
    return () => this.messageHandlers.delete(callback);
  }

  onProgramChange(callback) {
    this.programChangeHandlers.add(callback);
    return () => this.programChangeHandlers.delete(callback);
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
        throw new Error('No USB MIDI devices found. Make sure your Sonicake pedal is turned on and connected via USB.');
      }

      // Prioritize Sonicake hardware by its USB MIDI port name
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
      this.multiFrameAnswers = {}; // multi-frame answers being collected (USB and BLE)

      this.midiInput.onmidimessage = (event) => this.handleUsbMidiMessage(event);

      this.isConnected = true;
      this.rememberConnection({ type: 'usb', name: selected.name });
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
    let data = event.data;
    if (!data || data.length === 0) return;

    // Check for standard MIDI Program Change (0xC0 - 0xCF)
    if ((data[0] & 0xF0) === 0xC0 && data.length >= 2) {
      const pcSlot = data[1] + 1; // 1-based (1 to 100)
      this.log(`Received MIDI Program Change from hardware: slot ${pcSlot}`, 'info');
      this.programChangeHandlers.forEach(handler => handler(pcSlot));
      return;
    }

    // Ignore non-SysEx MIDI packets if not in the middle of reassembling a SysEx buffer
    if (this.usbMidiBuffer === null && data[0] !== 0xF0) {
      return;
    }

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
    this.deliverFrame(message);
  }

  /**
   * One transport frame (F0 crc crc total total idx idx len len payload-nibbles F7) from USB or
   * BLE. Multi-frame answers are collected by index and dispatched once complete, as a single
   * frame with total = 1, so every listener receives whole messages whatever the transport.
   */
  deliverFrame(frame) {
    const toHex = (bytes) => '8080' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    const total = (frame[3] << 4) | frame[4];
    if (total <= 1) {
      this.dispatchMessage(toHex(frame));
      return;
    }

    const idx = (frame[5] << 4) | frame[6];
    const len = (frame[7] << 4) | frame[8];
    const key = String(total);
    const now = Date.now();
    let answer = this.multiFrameAnswers[key];
    // Drop a stale partial answer after 2.5 s without frames (long answers, e.g. the 106-frame
    // preset names, can take longer than that in total)
    if (answer && now - answer.lastTime > 2500) {
      this.log(`Risposta incompleta scartata (${Object.keys(answer.frames).length}/${total} frame).`, 'warning');
      answer = null;
    }
    if (!answer) answer = this.multiFrameAnswers[key] = { frames: {}, lastTime: now };
    answer.lastTime = now;
    answer.frames[idx] = frame.slice(9, 9 + len * 2);
    if (Object.keys(answer.frames).length < total) return;
    for (let i = 0; i < total; i++) if (!answer.frames[i]) return;
    delete this.multiFrameAnswers[key];

    const nibbles = [];
    for (let i = 0; i < total; i++) nibbles.push(...answer.frames[i]);
    const size = Math.min(0xFF, nibbles.length / 2);
    const whole = new Uint8Array(nibbles.length + 10);
    whole.set([0xF0, 0, 0, 0x00, 0x01, 0x00, 0x00, size >> 4, size & 0x0F], 0);
    whole.set(nibbles, 9);
    whole[whole.length - 1] = 0xF7;
    this.dispatchMessage(toHex(whole));
  }

  /**
   * Connect via Web Bluetooth (BLE)
   */
  async connectBle() {
    if (!navigator.bluetooth) {
      if (!window.isSecureContext) {
        throw new Error('Web Bluetooth richiede HTTPS quando usato da smartphone/rete locale. Apri la pagina con https:// anziché http:// (es. https://' + (window.location.hostname || '192.168.1.218') + ':5173).');
      }
      throw new Error('Web Bluetooth API non è supportata da questo browser. Usa Google Chrome o Microsoft Edge.');
    }

    try {
      this.log('Searching for Sonicake Bluetooth devices...', 'info');
      try {
        this.bleDevice = await navigator.bluetooth.requestDevice({
          filters: [
            { name: 'Sonic Master BLE' },
            { namePrefix: 'Sonic' },
            { namePrefix: 'Smart' },
            { namePrefix: 'Pocket' },
            { namePrefix: 'QME' },
            { services: [this.SERVICE_UUID] }
          ],
          optionalServices: [this.SERVICE_UUID]
        });
      } catch (scanErr) {
        // If user cancelled, rethrow
        if (scanErr.name === 'NotFoundError' && scanErr.message?.toLowerCase().includes('user cancelled')) {
          throw scanErr;
        }
        // Fallback: broaden search with acceptAllDevices
        this.log('Riprovo scansione Bluetooth con tutti i dispositivi...', 'info');
        this.bleDevice = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [this.SERVICE_UUID]
        });
      }

      await this.connectBleDevice(this.bleDevice);
      return true;
    } catch (err) {
      this.log(`Bluetooth connection failed: ${err.message}`, 'error');
      throw err;
    }
  }

  /** Open GATT on an already chosen / previously authorized Bluetooth device */
  async connectBleDevice(device) {
    this.bleDevice = device;
    this.log(`Connecting to BLE device: ${device.name}...`, 'info');

    // One disconnect listener per device, even when it is reconnected several times
    if (!this.bleWatchedDevices.has(device)) {
      this.bleWatchedDevices.add(device);
      device.addEventListener('gattserverdisconnected', () => {
        if (this.bleDevice !== device || !this.isConnected) return;
        this.log('Bluetooth device disconnected', 'warning');
        this.disconnect();
      });
    }

    this.bleServer = await device.gatt.connect();
    const service = await this.bleServer.getPrimaryService(this.SERVICE_UUID);
    this.bleCharacteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);

    this.bleBuffer = [];
    this.multiFrameAnswers = {};
    await this.bleCharacteristic.startNotifications();
    this.bleCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
      const val = event.target.value;
      if (!val) return;
      this.handleBleNotification(new Uint8Array(val.buffer, val.byteOffset, val.byteLength));
    });

    this.connectionType = 'ble';
    this.deviceName = device.name || 'Sonicake BLE';
    this.isConnected = true;
    this.rememberConnection({ type: 'ble', name: this.deviceName, bleId: device.id });
    this.log(`Connected via Bluetooth: ${this.deviceName}`, 'success');
    this.notifyStatus();
    return true;
  }

  // --- Reconnect after a page reload ---
  // The last successful connection is remembered until the user presses "Disconnetti".

  rememberConnection(info) {
    try { localStorage.setItem('sonicake_last_connection', JSON.stringify(info)); } catch (_) {}
  }

  forgetConnection() {
    try { localStorage.removeItem('sonicake_last_connection'); } catch (_) {}
  }

  /**
   * Single, silent attempt to reconnect the pedal used before the reload. USB reconnects only
   * when MIDI permission is already granted (no prompt). Bluetooth needs getDevices() (devices
   * this site was allowed to use) and waits at most 10 s for the pedal to advertise.
   * Never loops or retries. Resolves true when connected.
   */
  async restoreLastConnection() {
    let last = null;
    try { last = JSON.parse(localStorage.getItem('sonicake_last_connection') || 'null'); } catch (_) {}
    if (!last || this.isConnected) return false;

    try {
      if (last.type === 'usb') {
        if (!navigator.requestMIDIAccess || !navigator.permissions?.query) return false;
        const permission = await navigator.permissions.query({ name: 'midi', sysex: true }).catch(() => null);
        if (permission?.state !== 'granted') return false;
        this.log('Riconnessione alla pedaliera USB usata prima del ricaricamento...', 'info');
        const pairs = await this.getAvailableUsbDevices();
        const match = pairs.find(p => p.name === last.name) || pairs.find(p => /smart box|sonicake|sonic|qme/i.test(p.name));
        if (!match) {
          this.log('Pedaliera USB non trovata: collegala e premi USB.', 'warning');
          return false;
        }
        return await this.connectUsb(match);
      }

      if (last.type === 'ble') {
        if (!navigator.bluetooth?.getDevices) {
          this.log('Il browser non permette di riconnettere il Bluetooth da solo: premi BLE per ricollegare la pedaliera.', 'info');
          return false;
        }
        const devices = await navigator.bluetooth.getDevices();
        const device = devices.find(d => d.id === last.bleId) || devices.find(d => d.name === last.name);
        if (!device) return false;
        this.log(`Riconnessione Bluetooth a ${device.name || last.name}...`, 'info');
        try {
          return await this.connectBleDevice(device);
        } catch (_) {
          if (!device.watchAdvertisements) throw new Error('pedaliera non raggiungibile');
          // Not in range yet: wait once for its advertisement, then connect
          const abort = new AbortController();
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { abort.abort(); reject(new Error('pedaliera non trovata entro 10 s')); }, 10000);
            device.addEventListener('advertisementreceived', () => { clearTimeout(timer); abort.abort(); resolve(); }, { once: true });
            device.watchAdvertisements({ signal: abort.signal }).catch((err) => { clearTimeout(timer); reject(err); });
          });
          return await this.connectBleDevice(device);
        }
      }
    } catch (err) {
      this.log(`Riconnessione automatica non riuscita (${err.message}): premi USB o BLE.`, 'warning');
    }
    return false;
  }

  /**
   * Dispatch raw incoming hex message to registered handlers
   */
  /**
   * BLE notifications carry SysEx frames split across notifications, or several frames in one,
   * with BLE-MIDI header/timestamp bytes (>= 0x80) around them. Frame bodies are nibbles only,
   * so every byte >= 0x80 other than F0/F7 is transport overhead. Each complete F0..F7 frame goes
   * through the same reassembly as USB (deliverFrame).
   */
  handleBleNotification(data) {
    if (!data || data.length === 0) return;
    for (const b of data) {
      if (b === 0xF0) {
        this.bleBuffer = [b];
      } else if (this.bleBuffer.length === 0) {
        continue; // header / timestamp before a frame
      } else if (b === 0xF7) {
        this.bleBuffer.push(b);
        const frame = Uint8Array.from(this.bleBuffer);
        this.bleBuffer = [];
        this.deliverFrame(frame);
      } else if (b < 0x80) {
        this.bleBuffer.push(b);
      }
    }
  }

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
   * Send a raw Uint8Array packet directly to the pedal (Web MIDI or BLE)
   * Essential for high-speed streaming chunk uploads to flash memory.
   * @param {Uint8Array} bytes
   * @returns {Promise<boolean>}
   */
  async writeRawBytes(bytes) {
    if (!this.isConnected) return false;

    try {
      if (this.connectionType === 'usb' && this.midiOutput) {
        let payload = bytes;
        if (payload[0] === 0x80 && payload[1] === 0x80) {
          payload = payload.slice(2);
        }
        this.midiOutput.send(payload);
        return true;
      } else if (this.connectionType === 'ble' && this.bleCharacteristic) {
        let payload = bytes;
        if (payload[0] !== 0x80 || payload[1] !== 0x80) {
          const blePacket = new Uint8Array(bytes.length + 2);
          blePacket[0] = 0x80;
          blePacket[1] = 0x80;
          blePacket.set(bytes, 2);
          payload = blePacket;
        }
        await this.bleCharacteristic.writeValueWithoutResponse(payload);
        return true;
      }
    } catch (err) {
      this.log(`writeRawBytes failed: ${err.message}`, 'error');
    }
    return false;
  }

  /**
   * Disconnect current active device.
   * `forget: true` (the "Disconnetti" buttons) also stops the automatic reconnect after a
   * reload; page unload and a pedal switched off keep it.
   */
  disconnect({ forget = false } = {}) {
    if (forget) this.forgetConnection();
    if (this.connectionType === 'usb' && this.midiInput) {
      this.midiInput.onmidimessage = null;
      try { this.midiInput.close?.(); } catch (e) {}
      try { this.midiOutput?.close?.(); } catch (e) {}
      this.midiInput = null;
      this.midiOutput = null;
    } else if (this.connectionType === 'ble' && this.bleDevice) {
      if (this.bleDevice.gatt && this.bleDevice.gatt.connected) {
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
