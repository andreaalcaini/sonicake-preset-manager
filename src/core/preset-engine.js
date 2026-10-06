/**
 * Sonicake Preset Engine
 * Manages active preset state, 100 hardware slots, User IRs (1-5),
 * Clone Amp / NAM profiles (1-5), A/B comparison, Undo/Redo stack,
 * dirty tracking, and bidirectional hardware SysEx sync.
 */

import { connection } from './connection.js';
import { COMMAND_LIBRARY_DATA } from '../data/command-library.js';
import { MODULE_LIBRARY_DATA } from '../data/module-library.js';
import {
  MODULE_NAMES,
  TERMINATOR_PACKET,
  REQUEST_PRESET_NAMES_CMD,
  REQUEST_CURRENT_PRESET_NUM_CMD,
  REQUEST_PRESET_STATE_CMD,
  REQUEST_USER_IR_NAMES_CMD,
  REQUEST_CLONE_AMP_NAMES_CMD,
  buildSignatureToFxIdMaps,
  buildSavePresetCommand,
  decodePresetStateAndOrder,
  decodeSelectedEffects,
  decodeParameterValues,
  decodeName,
  parsePacketForNames
} from './protocol.js';
import { PrstParser } from './prst-parser.js';

export class PresetEngine {
  constructor() {
    this.signatureToFxIdMaps = buildSignatureToFxIdMaps();

    // 100 preset slots (1-50 User, 51-100 Factory)
    this.presetList = this.initializeDefaultPresets();
    this.currentSlot = 1; // 1-based index (1 to 100)
    this.isDirty = false;
    this.clipboard = null;

    // User IR & Clone Amp Profile Names
    this.irSlotNames = ['User IR 1', 'User IR 2', 'User IR 3', 'User IR 4', 'User IR 5'];
    this.cloneSlotNames = ['User Profile 1', 'User Profile 2', 'User Profile 3', 'User Profile 4', 'User Profile 5'];

    // Active Preset State
    this.activePreset = this.createDefaultPreset('U01: Init Tone');

    // A/B Comparison States
    this.abState = {
      active: null, // 'A', 'B', or null
      snapshotA: null,
      snapshotB: null
    };

    // Undo / Redo Stacks
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;

    // SysEx Dump Sync State
    this.isSyncingNames = false;
    this.isWaitingForPresetDump = false;
    this.isWaitingForPresetNumber = false;
    this.dumpPackets = [];
    this.nameSyncResolve = null;
    this.cloneNameResolve = null;
    this.irNameResolve = null;
    this.nameSyncTimeoutId = null;
    this.syncTimeoutId = null;

    // Event listeners
    this.listeners = {
      stateChange: new Set(),
      presetListChange: new Set(),
      dirtyChange: new Set(),
      slotChange: new Set(),
      userSlotsChange: new Set(),
      syncProgress: new Set()
    };

    // Attach connection message listener
    this.setupHardwareListeners();
  }

  // --- Event Subscriptions ---

  onStateChange(cb) { this.listeners.stateChange.add(cb); return () => this.listeners.stateChange.delete(cb); }
  onPresetListChange(cb) { this.listeners.presetListChange.add(cb); return () => this.listeners.presetListChange.delete(cb); }
  onDirtyChange(cb) { this.listeners.dirtyChange.add(cb); return () => this.listeners.dirtyChange.delete(cb); }
  onSlotChange(cb) { this.listeners.slotChange.add(cb); return () => this.listeners.slotChange.delete(cb); }
  onUserSlotsChange(cb) { this.listeners.userSlotsChange.add(cb); return () => this.listeners.userSlotsChange.delete(cb); }
  onSyncProgress(cb) { this.listeners.syncProgress.add(cb); return () => this.listeners.syncProgress.delete(cb); }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(`Error in listener for ${event}:`, e); }
      });
    }
  }

  // --- Defaults Initialization ---

  initializeDefaultPresets() {
    const list = [];
    // User presets (1 to 50)
    for (let i = 1; i <= 50; i++) {
      const idStr = i < 10 ? `U0${i}` : `U${i}`;
      list.push({
        slot: i,
        type: 'user',
        code: idStr,
        name: `User ${i}`
      });
    }
    // Factory presets (51 to 100)
    const factoryNames = [
      'Pure Clean', 'Twin Crunch', 'Brit Lead', 'Modern High', 'Acoustic Sim',
      'Bass Warm', 'Stereo Dly', 'Vintage Hall', 'Solo Hero', 'Metal Edge',
      'Funk Groove', 'Bluesman', 'Dream Echo', '80s Rock', 'Jazz Chorus',
      'Ambient Pad', 'Heavy Drop', 'Fusion Lead', 'Country Pick', 'Texas Blues'
    ];
    for (let i = 51; i <= 100; i++) {
      const idx = i - 50;
      const idStr = idx < 10 ? `F0${idx}` : `F${idx}`;
      const name = factoryNames[idx - 1] || `Factory ${idx}`;
      list.push({
        slot: i,
        type: 'factory',
        code: idStr,
        name
      });
    }
    return list;
  }

  createDefaultPreset(name = 'New Preset') {
    const preset = {
      name: name.slice(0, 10),
      volume: 75,
      states: {
        0: true,  // NR on
        1: false, // FX1 off
        2: false, // DRV off
        3: true,  // AMP on
        4: true,  // IR on
        5: false, // EQ off
        6: false, // FX2 off
        7: false, // DLY off
        8: true   // RVB on
      },
      order: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      ampMode: 'factory',
      selectedEffects: {
        0: 1,   // Gate
        1: 101, // COMP 1
        2: 201, // Scream
        3: 301, // TWD Deluxe
        4: 401, // TWD 1x8
        5: 501, // GT EQ 1
        6: 601, // COMP 1
        7: 701, // Pure
        8: 801, // Room
        9: 901  // Clone Profile 1
      },
      parameters: {}
    };

    // Populate default parameter values for each selected effect
    for (const [modId, fxId] of Object.entries(preset.selectedEffects)) {
      preset.parameters[modId] = this.getDefaultParametersForFx(fxId);
    }
    return preset;
  }

  getDefaultParametersForFx(fxId) {
    const params = {};
    const effectDef = MODULE_LIBRARY_DATA.effectLibrary[fxId];
    if (effectDef && effectDef.alg) {
      effectDef.alg.forEach(p => {
        params[p.algId] = p.defaultValue !== undefined ? p.defaultValue : 50;
      });
    }
    return params;
  }

  // --- Hardware SysEx Listener ---

  setupHardwareListeners() {
    connection.onMessage((hexString) => {
      this.handleIncomingSysEx(hexString);
    });
  }

  handleIncomingSysEx(hexString) {
    const cleanHex = hexString.replace(/\s+/g, '').toUpperCase();

    // 1. Clone Amp / NAM Names Response (signature: 01020204)
    if (cleanHex.indexOf('01020204') >= 0 && cleanHex.length >= 80) {
      connection.log('Received Clone Amp (NAM) profile names data from hardware.', 'info');
      this.decodeAndApplyUserNames(cleanHex, 'Clone');
      if (this.cloneNameResolve) {
        this.cloneNameResolve();
        this.cloneNameResolve = null;
      }
      return;
    }

    // 2. User IR Names Response (signature: 01020200)
    if (cleanHex.indexOf('01020200') >= 0 && cleanHex.length >= 80) {
      connection.log('Received User IR names data from hardware.', 'info');
      this.decodeAndApplyUserNames(cleanHex, 'IR');
      if (this.irNameResolve) {
        this.irNameResolve();
        this.irNameResolve = null;
      }
      return;
    }

    // 3. Preset Names Sync
    if (this.isSyncingNames && cleanHex.startsWith('8080F0') && cleanHex.endsWith('F7')) {
      clearTimeout(this.nameSyncTimeoutId);

      if (connection.connectionType === 'usb') {
        connection.log('Received complete USB preset names packet. Decoding...', 'info');
        this.dumpPackets.push(cleanHex);
        this.processNamesDump();
      } else if (cleanHex === TERMINATOR_PACKET || cleanHex.endsWith('0200000000F7')) {
        connection.log(`Terminator packet received. Decoding ${this.dumpPackets.length} name packets...`, 'info');
        this.processNamesDump();
      } else {
        this.dumpPackets.push(cleanHex);
        this.nameSyncTimeoutId = setTimeout(() => {
          if (this.isSyncingNames) {
            this.processNamesDump();
          }
        }, 1200);
      }
      return;
    }

    // 4. Preset State Sync (5-packet dump)
    if (this.isWaitingForPresetDump && cleanHex.startsWith('8080F0') && cleanHex.endsWith('F7') && cleanHex.length > 50) {
      this.dumpPackets.push(cleanHex);

      if (this.dumpPackets.length === 5 || connection.connectionType === 'usb') {
        let packets = this.dumpPackets;

        // On USB MIDI, re-create the expected 5 sub-packets if delivered as 1 reassembled SysEx
        if (connection.connectionType === 'usb') {
          const hdr = "8080F00706000100000000";
          const p1 = hdr + cleanHex.slice(22, 422) + "F7";
          const p2 = hdr + cleanHex.slice(422, 822) + "F7";
          const p3 = hdr + cleanHex.slice(822, 1222) + "F7";
          const p4 = hdr + cleanHex.slice(1222, 1622) + "F7";
          const p5 = hdr + cleanHex.slice(1622);
          packets = [p1, p2, p3, p4, p5];
        }

        clearTimeout(this.syncTimeoutId);
        this.syncTimeoutId = null;
        this.isWaitingForPresetDump = false;

        this.processPresetDump(packets);
        this.dumpPackets = [];
      }
      return;
    }

    // 5. Preset Number Response (extract 2 nibbles at chars 30..34)
    if (this.isWaitingForPresetNumber) {
      this.parseActivePresetSlotResponse(cleanHex);
      this.isWaitingForPresetNumber = false;
    }
  }

  decodeAndApplyUserNames(packet, type) {
    const PAYLOAD_START_OFFSET = 50; // 25 bytes * 2
    if (packet.length < PAYLOAD_START_OFFSET) return;
    const hexPayload = packet.substring(PAYLOAD_START_OFFSET);

    const namesArray = type === 'Clone' ? this.cloneSlotNames : this.irSlotNames;
    const baseFxId = type === 'Clone' ? 901 : 416;
    const logName = type === 'Clone' ? 'Clone Amp (NAM)' : 'User IR';

    const foundNames = [];
    const BLOCK_STRIDE = 64; // 32 bytes
    const NAME_DATA_LENGTH = 40; // 20 bytes

    for (let i = 0; i < 5; i++) {
      const blockStart = i * BLOCK_STRIDE;
      if (hexPayload.length >= blockStart + NAME_DATA_LENGTH) {
        const nameHex = hexPayload.substring(blockStart, blockStart + NAME_DATA_LENGTH);
        const decoded = decodeName(nameHex).trim();
        foundNames.push(decoded || `${type} ${i + 1}`);
      }
    }

    if (foundNames.length === 5) {
      connection.log(`Decoded 5 ${logName} names: ${foundNames.join(', ')}`, 'success');
      foundNames.forEach((name, i) => {
        namesArray[i] = name;
        const fxId = baseFxId + i;
        if (MODULE_LIBRARY_DATA.effectLibrary[fxId]) {
          MODULE_LIBRARY_DATA.effectLibrary[fxId].name = name;
        }
      });
      this.emit('userSlotsChange', { type, names: namesArray });
      this.emit('stateChange', this.activePreset);
    }
  }

  parseActivePresetSlotResponse(hexString) {
    try {
      const hexDigit1AsByte = hexString.substring(30, 32);
      const hexDigit2AsByte = hexString.substring(32, 34);
      const digit1 = parseInt(hexDigit1AsByte, 16);
      const digit2 = parseInt(hexDigit2AsByte, 16);
      const finalHexString = digit1.toString(16) + digit2.toString(16);
      const presetIndex = parseInt(finalHexString, 16); // 0-based
      const slot = presetIndex + 1; // 1 to 100

      if (slot >= 1 && slot <= 100) {
        this.currentSlot = slot;
        const presetItem = this.presetList[slot - 1];
        if (presetItem) {
          this.activePreset.name = presetItem.name;
        }
        this.emit('slotChange', this.currentSlot);
        connection.log(`Active Hardware Preset: ${this.getSlotCode(slot)} - ${this.activePreset.name}`, 'success');
        // Fetch preset parameters for this active slot
        setTimeout(() => this.syncCurrentPresetState(), 100);
      }
    } catch (e) {
      console.warn('Failed to parse preset number response:', e);
    }
  }

  processNamesDump() {
    this.isSyncingNames = false;
    const allNames = this.dumpPackets.flatMap(pkt => parsePacketForNames(pkt));
    this.dumpPackets = [];

    if (allNames.length > 0) {
      connection.log(`Successfully synced ${allNames.length} preset names from pedal flash!`, 'success');
      for (let i = 0; i < allNames.length && i < this.presetList.length; i++) {
        if (allNames[i].trim()) {
          this.presetList[i].name = allNames[i].trim();
        }
      }
      this.emit('presetListChange', this.presetList);
    }

    // Request currently active slot number
    this.isWaitingForPresetNumber = true;
    connection.writeCommand(REQUEST_CURRENT_PRESET_NUM_CMD);

    if (this.nameSyncResolve) {
      this.nameSyncResolve(allNames);
      this.nameSyncResolve = null;
    }
  }

  processPresetDump(packets) {
    try {
      connection.log('Parsing preset parameters dump...', 'info');
      const packet1 = packets[0];
      const packet2 = packets[1] || packet1;

      // Decode module states, chain order, amp mode, preset volume
      const stateOrder = decodePresetStateAndOrder(packet1);

      // Decode selected effects
      const effects = decodeSelectedEffects(packet2, this.signatureToFxIdMaps);

      // Decode parameter values from all packets
      const parameters = decodeParameterValues(packets, effects.selectedEffects);

      // Update active preset
      this.activePreset.volume = stateOrder.presetVolume || 75;
      this.activePreset.states = { ...this.activePreset.states, ...stateOrder.states };
      this.activePreset.order = stateOrder.order || [0, 1, 2, 3, 4, 5, 6, 7, 8];
      this.activePreset.ampMode = stateOrder.ampMode || 'factory';
      this.activePreset.selectedEffects = { ...this.activePreset.selectedEffects, ...effects.selectedEffects };

      for (const modId in parameters) {
        if (!this.activePreset.parameters[modId]) {
          this.activePreset.parameters[modId] = {};
        }
        this.activePreset.parameters[modId] = {
          ...this.activePreset.parameters[modId],
          ...parameters[modId]
        };
      }

      this.isDirty = false;
      this.emit('dirtyChange', false);
      this.emit('stateChange', this.activePreset);
      connection.log(`Preset "${this.activePreset.name}" fully loaded from Smart Box!`, 'success');
    } catch (err) {
      connection.log(`Error parsing preset dump: ${err.message}`, 'error');
    }
  }

  // --- Hardware Sync Requests ---

  async runInitialSyncSequence() {
    if (!connection.isConnected) return;
    connection.log('Starting full hardware synchronization sequence...', 'info');

    try {
      // 1. Sync Clone Amp (NAM) names
      connection.log('Step 1/3: Reading Clone Amp (NAM) profiles...', 'info');
      await this.syncCloneAmpNames();

      // 2. Sync User IR names
      connection.log('Step 2/3: Reading User IR profiles...', 'info');
      await this.syncUserIRNames();

      // 3. Sync Preset names (which also triggers active slot & current state)
      connection.log('Step 3/3: Reading all 100 preset names from flash...', 'info');
      await this.syncPresetNames();
    } catch (err) {
      connection.log(`Sync sequence warning: ${err.message}`, 'warning');
    }
  }

  syncCloneAmpNames() {
    return new Promise(async (resolve) => {
      if (!connection.isConnected) return resolve();
      const timeout = setTimeout(() => {
        this.cloneNameResolve = null;
        resolve();
      }, 3000);

      this.cloneNameResolve = () => {
        clearTimeout(timeout);
        this.cloneNameResolve = null;
        resolve();
      };
      await connection.writeCommand(REQUEST_CLONE_AMP_NAMES_CMD);
    });
  }

  syncUserIRNames() {
    return new Promise(async (resolve) => {
      if (!connection.isConnected) return resolve();
      const timeout = setTimeout(() => {
        this.irNameResolve = null;
        resolve();
      }, 3000);

      this.irNameResolve = () => {
        clearTimeout(timeout);
        this.irNameResolve = null;
        resolve();
      };
      await connection.writeCommand(REQUEST_USER_IR_NAMES_CMD);
    });
  }

  syncPresetNames() {
    return new Promise(async (resolve) => {
      if (!connection.isConnected) {
        connection.log('Cannot sync: Hardware not connected', 'warning');
        return resolve();
      }
      this.isSyncingNames = true;
      this.dumpPackets = [];
      this.nameSyncResolve = resolve;

      clearTimeout(this.nameSyncTimeoutId);
      this.nameSyncTimeoutId = setTimeout(() => {
        if (this.isSyncingNames) {
          this.processNamesDump();
        }
      }, 5000);

      await connection.writeCommand(REQUEST_PRESET_NAMES_CMD);
    });
  }

  async syncCurrentPresetState() {
    if (!connection.isConnected) return;
    this.isWaitingForPresetDump = true;
    this.dumpPackets = [];

    clearTimeout(this.syncTimeoutId);
    this.syncTimeoutId = setTimeout(() => {
      if (this.isWaitingForPresetDump) {
        this.isWaitingForPresetDump = false;
        connection.log('Preset state sync timed out.', 'warning');
      }
    }, 4000);

    connection.log('Requesting active preset parameters...', 'info');
    await connection.writeCommand(REQUEST_PRESET_STATE_CMD);
  }

  // --- Preset Manipulation & Commands ---

  async selectPreset(slotNumber, syncHardware = true) {
    if (slotNumber < 1 || slotNumber > 100) return;
    this.currentSlot = slotNumber;
    const presetItem = this.presetList[slotNumber - 1];
    if (presetItem) {
      this.activePreset.name = presetItem.name;
    }
    this.isDirty = false;
    this.undoStack = [];
    this.redoStack = [];

    this.emit('slotChange', this.currentSlot);
    this.emit('dirtyChange', false);
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      const commandIndex = slotNumber - 1;
      const cmd = COMMAND_LIBRARY_DATA.presetCommands?.[commandIndex];
      if (cmd) {
        await connection.writeCommand(cmd);
        connection.log(`Switched to preset ${this.getSlotCode(slotNumber)}: ${this.activePreset.name}`, 'info');
        setTimeout(() => this.syncCurrentPresetState(), 100);
      }
    }
  }

  async setModuleBypass(moduleId, isOn, syncHardware = true) {
    this.pushUndoSnapshot();
    this.activePreset.states[moduleId] = !!isOn;
    this.markDirty();
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      const cmd = COMMAND_LIBRARY_DATA.moduleStates?.[moduleId]?.[isOn ? 'on' : 'off'];
      if (cmd) {
        await connection.writeCommand(cmd);
      }
    }
  }

  async setAmpMode(mode, syncHardware = true) {
    if (mode !== 'factory' && mode !== 'clone') return;
    this.pushUndoSnapshot();
    this.activePreset.ampMode = mode;
    this.markDirty();
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      const cmd = COMMAND_LIBRARY_DATA.ampModes?.[mode];
      if (cmd) {
        await connection.writeCommand(cmd);
      }
    }
  }

  async setEffectType(moduleId, fxId, syncHardware = true) {
    this.pushUndoSnapshot();
    this.activePreset.selectedEffects[moduleId] = fxId;
    this.activePreset.parameters[moduleId] = this.getDefaultParametersForFx(fxId);
    this.markDirty();
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      const cmd = COMMAND_LIBRARY_DATA.effectTypes?.[moduleId]?.[fxId];
      if (cmd) {
        await connection.writeCommand(cmd);
      }
    }
  }

  async setParameter(moduleId, algId, value, syncHardware = true) {
    if (!this.activePreset.parameters[moduleId]) {
      this.activePreset.parameters[moduleId] = {};
    }
    const numVal = Math.round(Number(value));
    this.activePreset.parameters[moduleId][algId] = numVal;
    this.markDirty();
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      const cmd = COMMAND_LIBRARY_DATA.parameters?.[moduleId]?.[algId]?.[numVal];
      if (cmd) {
        await connection.writeCommand(cmd);
      }
    }
  }

  async setPresetVolume(volume, syncHardware = true) {
    this.activePreset.volume = Math.max(0, Math.min(100, Math.round(volume)));
    this.markDirty();
    this.emit('stateChange', this.activePreset);
  }

  async setChainOrder(newOrder, syncHardware = true) {
    if (!Array.isArray(newOrder) || newOrder.length !== 9) return;
    this.pushUndoSnapshot();
    this.activePreset.order = [...newOrder];
    this.markDirty();
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      const key = newOrder.map(id => MODULE_NAMES[id]).join('-');
      const cmd = COMMAND_LIBRARY_DATA.chainOrderCommands?.[key];
      if (cmd) {
        await connection.writeCommand(cmd);
        connection.log(`Updated signal chain: ${key}`, 'info');
      }
    }
  }

  async savePreset(slotNumber, name) {
    const slot = slotNumber || this.currentSlot;
    if (slot < 1 || slot > 50) {
      throw new Error('Only User presets (1 to 50) can be saved to hardware memory.');
    }
    const cleanName = (name || this.activePreset.name).slice(0, 10);
    this.activePreset.name = cleanName;
    this.presetList[slot - 1].name = cleanName;

    if (connection.isConnected) {
      const cmd = buildSavePresetCommand(slot, cleanName);
      connection.log(`Saving preset "${cleanName}" to slot ${this.getSlotCode(slot)}...`, 'info');
      const success = await connection.writeCommand(cmd);
      if (success) {
        connection.log(`Saved preset "${cleanName}" to ${this.getSlotCode(slot)}!`, 'success');
      }
    }

    this.isDirty = false;
    this.emit('dirtyChange', false);
    this.emit('presetListChange', this.presetList);
    this.emit('stateChange', this.activePreset);
  }

  // --- A/B Comparison ---

  takeSnapshot() {
    return JSON.parse(JSON.stringify(this.activePreset));
  }

  applySnapshot(snapshot) {
    this.activePreset = JSON.parse(JSON.stringify(snapshot));
    this.emit('stateChange', this.activePreset);
    if (connection.isConnected) {
      for (const [modId, isOn] of Object.entries(this.activePreset.states)) {
        const cmd = COMMAND_LIBRARY_DATA.moduleStates?.[modId]?.[isOn ? 'on' : 'off'];
        if (cmd) connection.writeCommand(cmd);
      }
      for (const [modId, fxId] of Object.entries(this.activePreset.selectedEffects)) {
        const cmd = COMMAND_LIBRARY_DATA.effectTypes?.[modId]?.[fxId];
        if (cmd) connection.writeCommand(cmd);
      }
      for (const [modId, params] of Object.entries(this.activePreset.parameters)) {
        for (const [algId, val] of Object.entries(params)) {
          const cmd = COMMAND_LIBRARY_DATA.parameters?.[modId]?.[algId]?.[val];
          if (cmd) connection.writeCommand(cmd);
        }
      }
    }
  }

  toggleAB() {
    if (!this.abState.snapshotA) {
      this.abState.snapshotA = this.takeSnapshot();
    }
    if (!this.abState.snapshotB) {
      this.abState.snapshotB = this.takeSnapshot();
    }

    if (this.abState.active === 'A') {
      this.abState.active = 'B';
      this.applySnapshot(this.abState.snapshotB);
      connection.log('Switched to Tone B', 'info');
    } else {
      this.abState.active = 'A';
      this.applySnapshot(this.abState.snapshotA);
      connection.log('Switched to Tone A', 'info');
    }
  }

  // --- Undo / Redo ---

  pushUndoSnapshot() {
    this.undoStack.push(this.takeSnapshot());
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.takeSnapshot());
    const prev = this.undoStack.pop();
    this.applySnapshot(prev);
    this.markDirty();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this.takeSnapshot());
    const next = this.redoStack.pop();
    this.applySnapshot(next);
    this.markDirty();
  }

  // --- Copy / Paste Presets ---

  copyPreset() {
    this.clipboard = this.takeSnapshot();
    connection.log(`Copied "${this.clipboard.name}" to clipboard`, 'info');
  }

  pastePreset() {
    if (!this.clipboard) return;
    this.pushUndoSnapshot();
    const pasted = JSON.parse(JSON.stringify(this.clipboard));
    this.activePreset = pasted;
    this.markDirty();
    this.applySnapshot(pasted);
    connection.log(`Pasted "${pasted.name}" into slot ${this.getSlotCode(this.currentSlot)}`, 'info');
  }

  // --- Import / Export (.prst & .json) ---

  exportPresetPrst() {
    return PrstParser.serialize(this.activePreset);
  }

  importPresetPrst(buffer) {
    this.pushUndoSnapshot();
    const parsed = PrstParser.parse(buffer);
    this.activePreset.name = parsed.name || 'Imported';
    if (parsed.order && parsed.order.length === 9) {
      this.activePreset.order = parsed.order;
    }
    this.markDirty();
    this.emit('stateChange', this.activePreset);
    connection.log(`Imported .prst preset "${this.activePreset.name}"`, 'success');
  }

  exportBackupJson() {
    return JSON.stringify({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      currentSlot: this.currentSlot,
      presetList: this.presetList,
      cloneSlotNames: this.cloneSlotNames,
      irSlotNames: this.irSlotNames,
      activePreset: this.activePreset
    }, null, 2);
  }

  importBackupJson(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.presetList) {
      this.presetList = data.presetList;
      this.emit('presetListChange', this.presetList);
    }
    if (data.cloneSlotNames) {
      this.cloneSlotNames = data.cloneSlotNames;
      this.cloneSlotNames.forEach((n, i) => {
        if (MODULE_LIBRARY_DATA.effectLibrary[901 + i]) {
          MODULE_LIBRARY_DATA.effectLibrary[901 + i].name = n;
        }
      });
    }
    if (data.irSlotNames) {
      this.irSlotNames = data.irSlotNames;
      this.irSlotNames.forEach((n, i) => {
        if (MODULE_LIBRARY_DATA.effectLibrary[416 + i]) {
          MODULE_LIBRARY_DATA.effectLibrary[416 + i].name = n;
        }
      });
    }
    if (data.activePreset) {
      this.pushUndoSnapshot();
      this.activePreset = data.activePreset;
      this.markDirty();
      this.emit('stateChange', this.activePreset);
    }
    connection.log('Preset backup imported successfully!', 'success');
  }

  // --- Tone3000 Slot Replacement ---

  replaceCloneProfile(slotIndex, tone) {
    const idx = Math.max(0, Math.min(4, slotIndex));
    const fxId = 901 + idx;
    const cleanName = tone.title.slice(0, 10);

    this.cloneSlotNames[idx] = cleanName;
    if (MODULE_LIBRARY_DATA.effectLibrary[fxId]) {
      MODULE_LIBRARY_DATA.effectLibrary[fxId].name = cleanName;
      MODULE_LIBRARY_DATA.effectLibrary[fxId].descriptionEn = tone.description || `Tone3000 capture: ${tone.title}`;
    }

    // Switch amp mode to Clone/NAM & select this profile
    this.setAmpMode('clone', true);
    this.setEffectType(9, fxId, true);

    this.emit('userSlotsChange', { type: 'Clone', names: this.cloneSlotNames });
    this.emit('stateChange', this.activePreset);
    connection.log(`Replaced Clone Profile ${idx + 1} with "${cleanName}" from Tone3000!`, 'success');
  }

  replaceUserIR(slotIndex, tone) {
    const idx = Math.max(0, Math.min(4, slotIndex));
    const fxId = 416 + idx;
    const cleanName = tone.title.slice(0, 10);

    this.irSlotNames[idx] = cleanName;
    if (MODULE_LIBRARY_DATA.effectLibrary[fxId]) {
      MODULE_LIBRARY_DATA.effectLibrary[fxId].name = cleanName;
      MODULE_LIBRARY_DATA.effectLibrary[fxId].descriptionEn = tone.description || `Tone3000 IR: ${tone.title}`;
    }

    // Select this User IR in IR module (module 4)
    this.setEffectType(4, fxId, true);

    this.emit('userSlotsChange', { type: 'IR', names: this.irSlotNames });
    this.emit('stateChange', this.activePreset);
    connection.log(`Replaced User IR ${idx + 1} with "${cleanName}" from Tone3000!`, 'success');
  }

  applyTone3000(tone) {
    this.replaceCloneProfile(0, tone);
  }

  // --- Utilities ---

  markDirty() {
    if (!this.isDirty) {
      this.isDirty = true;
      this.emit('dirtyChange', true);
    }
  }

  getSlotCode(slot) {
    if (slot <= 50) {
      return slot < 10 ? `U0${slot}` : `U${slot}`;
    } else {
      const idx = slot - 50;
      return idx < 10 ? `F0${idx}` : `F${idx}`;
    }
  }
}

export const presetEngine = new PresetEngine();
