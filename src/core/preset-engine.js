/**
 * Sonicake Preset Engine
 * Manages active preset state, 100 hardware slots, A/B comparison,
 * Undo/Redo stack, dirty tracking, and bidirectional hardware SysEx sync.
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
  buildSignatureToFxIdMaps,
  buildSavePresetCommand,
  decodePresetStateAndOrder,
  decodeSelectedEffects,
  decodeParameterValues,
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
    this.debounceTimer = null;

    // SysEx Dump Sync State
    this.isSyncingNames = false;
    this.isWaitingForPresetDump = false;
    this.isWaitingForPresetNumber = false;
    this.dumpPackets = [];
    this.nameSyncResolve = null;

    // Event listeners
    this.listeners = {
      stateChange: new Set(),
      presetListChange: new Set(),
      dirtyChange: new Set(),
      slotChange: new Set(),
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

    // 1. Preset Names Sync
    if (this.isSyncingNames) {
      if (cleanHex === TERMINATOR_PACKET || cleanHex.endsWith('0200000000F7')) {
        this.processNamesDump();
        return;
      }
      // Accumulate name packet
      this.dumpPackets.push(cleanHex);
      this.emit('syncProgress', { type: 'names', count: this.dumpPackets.length });
      return;
    }

    // 2. Preset State Sync (Multi-packet dump 1 to 5)
    if (this.isWaitingForPresetDump) {
      this.dumpPackets.push(cleanHex);
      if (this.dumpPackets.length >= 5 || cleanHex.endsWith('F7')) {
        // If we collected 5 packets (or 1 large USB SysEx packet)
        this.processPresetDump(this.dumpPackets);
        this.dumpPackets = [];
        this.isWaitingForPresetDump = false;
      }
      return;
    }

    // 3. Preset Number Response (e.g. 8080F0000700010000000201020403...)
    if (this.isWaitingForPresetNumber) {
      this.parseActivePresetSlotResponse(cleanHex);
      this.isWaitingForPresetNumber = false;
    }
  }

  parseActivePresetSlotResponse(hexString) {
    try {
      const bytes = hexString.match(/.{1,2}/g);
      if (bytes && bytes.length >= 8) {
        // Preset index is at byte offset in response
        const slot = parseInt(bytes[bytes.length - 2], 16) + 1;
        if (slot >= 1 && slot <= 100) {
          this.currentSlot = slot;
          this.emit('slotChange', this.currentSlot);
          connection.log(`Hardware active slot: ${this.getSlotCode(slot)}`, 'info');
          // Automatically sync active preset state
          this.syncCurrentPresetState();
        }
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
      connection.log(`Successfully synced ${allNames.length} preset names from hardware!`, 'success');
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
      connection.log('Parsing hardware preset dump...', 'info');
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
      connection.log(`Preset "${this.activePreset.name}" synced from Smart Box!`, 'success');
    } catch (err) {
      connection.log(`Error parsing preset dump: ${err.message}`, 'error');
    }
  }

  // --- Hardware Sync Requests ---

  async syncPresetNames() {
    if (!connection.isConnected) {
      connection.log('Cannot sync: Hardware not connected', 'warning');
      return;
    }
    this.isSyncingNames = true;
    this.dumpPackets = [];
    connection.log('Requesting all 100 preset names from hardware...', 'info');
    await connection.writeCommand(REQUEST_PRESET_NAMES_CMD);
  }

  async syncCurrentPresetState() {
    if (!connection.isConnected) return;
    this.isWaitingForPresetDump = true;
    this.dumpPackets = [];
    connection.log('Requesting current preset parameters from hardware...', 'info');
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
        // Fetch preset parameters after switching
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
    // Set default parameters for newly chosen effect
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
    // Preset volume is also synced as global or module param when supported
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
      } else {
        connection.log(`Chain combination '${key}' not in lookup table.`, 'warning');
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
    // Sync to hardware if connected
    if (connection.isConnected) {
      // Sync bypass states
      for (const [modId, isOn] of Object.entries(this.activePreset.states)) {
        const cmd = COMMAND_LIBRARY_DATA.moduleStates?.[modId]?.[isOn ? 'on' : 'off'];
        if (cmd) connection.writeCommand(cmd);
      }
      // Sync effect types
      for (const [modId, fxId] of Object.entries(this.activePreset.selectedEffects)) {
        const cmd = COMMAND_LIBRARY_DATA.effectTypes?.[modId]?.[fxId];
        if (cmd) connection.writeCommand(cmd);
      }
      // Sync parameters
      for (const [modId, params] of Object.entries(this.activePreset.parameters)) {
        for (const [algId, val] of Object.entries(params)) {
          const cmd = COMMAND_LIBRARY_DATA.parameters?.[modId]?.[algId]?.[val];
          if (cmd) connection.writeCommand(cmd);
        }
      }
    }
  }

  setABSnapshot(slot) {
    if (slot === 'A') {
      this.abState.snapshotA = this.takeSnapshot();
      this.abState.active = 'A';
      connection.log('Saved State A for comparison', 'info');
    } else if (slot === 'B') {
      this.abState.snapshotB = this.takeSnapshot();
      this.abState.active = 'B';
      connection.log('Saved State B for comparison', 'info');
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
    this.redoStack = []; // Clear redo
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
      activePreset: this.activePreset
    }, null, 2);
  }

  importBackupJson(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.presetList) {
      this.presetList = data.presetList;
      this.emit('presetListChange', this.presetList);
    }
    if (data.activePreset) {
      this.pushUndoSnapshot();
      this.activePreset = data.activePreset;
      this.markDirty();
      this.emit('stateChange', this.activePreset);
    }
    connection.log('Preset backup imported successfully!', 'success');
  }

  // --- Tone3000 Cloud Integration ---

  applyTone3000(tone) {
    this.pushUndoSnapshot();
    connection.log(`Applying Tone3000 capture: "${tone.title}"...`, 'info');

    // Switch amp mode to Clone/NAM
    this.setAmpMode('clone', true);

    // Set Clone Amp profile slot 1 (ID 901)
    this.setEffectType(9, 901, true);

    // Set preset name to match tone title
    this.activePreset.name = tone.title.slice(0, 10);
    this.markDirty();
    this.emit('stateChange', this.activePreset);

    connection.log(`Tone3000 "${tone.title}" loaded into Clone/NAM slot!`, 'success');
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
