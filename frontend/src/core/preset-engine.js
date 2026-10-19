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
  buildStreamingFlashPackets,
  buildIRPayload,
  buildClonePayload,
  buildSlotRenamePayload,
  decodePresetStateAndOrder,
  decodeSelectedEffects,
  decodeParameterValues,
  decodeName,
  decodeNativeHardwareDump,
  decodeNativePresetNames
} from './protocol.js';
import { PrstParser } from './prst-parser.js';

/** Longest name the official apps allow when renaming a Clone AMP / User IR slot */
export const SLOT_RENAME_MAX = 10;

/** TONE3000 origin of a slot (shown with the TONE3000 mark in the memory view) */
const slotSourceFields = (tone) => (tone && tone.source === 'tone3000' ? {
  source: 'tone3000',
  image: tone.image || null,
  format: tone.format || null,
  gearLabel: tone.gearLabel || null,
  creator: tone.creator || null
} : {});

export class PresetEngine {
  constructor() {
    this.signatureToFxIdMaps = buildSignatureToFxIdMaps();

    // 100 preset slots (1-50 User, 51-100 Factory)
    this.presetList = this.initializeDefaultPresets();
    this.currentSlot = 1; // 1-based index (1 to 100)
    this.isDirty = false;
    this.followPedalPresetChanges = (() => {
      try { return localStorage.getItem('sonicake_follow_pedal') !== '0'; } catch (_) { return true; }
    })();
    this.masterVolume = (() => {
      try {
        const v = parseInt(localStorage.getItem('sonicake_master_volume'), 10);
        return Number.isFinite(v) ? v : null;
      } catch (_) { return null; }
    })();
    this.clipboard = null;

    // User IR & Clone Amp Profile Names & Tone3000 Metadata
    this.irSlotNames = ['BlendOfAll', 'User IR 2', 'User IR 3', 'User IR 4', 'User IR 5'];
    this.cloneSlotNames = ['Petersburg Thunder', 'Audio Assault Slow30', 'Slot 3 (Libero)', 'Slot 4 (Libero)', 'Slot 5 (Libero)'];
    this.cloneSlotMetadata = [
      { type: 'amp', toneTitle: 'Petersburg Thunder', variationName: 'Petersburg' },
      { type: 'amp', toneTitle: 'Audio Assault Slow30', variationName: 'Audio Assa' },
      null, null, null
    ];
    this.irSlotMetadata = [
      { type: 'cab', toneTitle: 'BlendOfAll', variationName: 'BlendOfAll' },
      null, null, null, null
    ];

    try {
      const savedCloneMeta = localStorage.getItem('sonicake_clone_metadata');
      if (savedCloneMeta) this.cloneSlotMetadata = JSON.parse(savedCloneMeta);
      const savedIrMeta = localStorage.getItem('sonicake_ir_metadata');
      if (savedIrMeta) this.irSlotMetadata = JSON.parse(savedIrMeta);
      const savedCloneNames = localStorage.getItem('sonicake_clone_names');
      if (savedCloneNames) this.cloneSlotNames = JSON.parse(savedCloneNames);
      const savedIrNames = localStorage.getItem('sonicake_ir_names');
      if (savedIrNames) this.irSlotNames = JSON.parse(savedIrNames);
    } catch (e) {
      console.warn('Could not restore slot metadata from localStorage:', e);
    }

    // Apply to module library definitions immediately
    this.cloneSlotNames.forEach((n, i) => {
      if (n && MODULE_LIBRARY_DATA.effectLibrary[901 + i]) {
        MODULE_LIBRARY_DATA.effectLibrary[901 + i].name = n;
      }
    });
    this.irSlotNames.forEach((n, i) => {
      if (n && MODULE_LIBRARY_DATA.effectLibrary[416 + i]) {
        MODULE_LIBRARY_DATA.effectLibrary[416 + i].name = n;
      }
    });

    // Active Preset State
    this.activePreset = this.createDefaultPreset('U01: Init Tone');
    this.presetCache = new Map();
    this.presetCache.set(1, JSON.parse(JSON.stringify(this.activePreset)));

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
    this.namesAnswer = null; // payload of the [12 40] preset names answer
    this.hardwareSlotNames = { Clone: [], IR: [] }; // last slot names reported by the pedal
    this.pendingSlotWrite = null; // { type, idx, name } while a flashed slot is being committed
    this.pedalWrites = 0; // Clone AMP / IR writes in progress (see isBusyWithPedal)
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

  createDefaultPresetForSlot(slotNumber, name) {
    const slotCode = this.getSlotCode(slotNumber);
    const cleanName = (name || `Preset ${slotCode}`).slice(0, 10);

    const ampCycle = [
      301, 308, 303, 304, 311, 315, 305, 306, 312, 317, 307, 318, 302, 319, 320, 314
    ];
    const cabCycle = [
      405, 410, 406, 404, 411, 414, 408, 409, 412, 415, 407, 413, 402, 414, 415, 410
    ];
    const drvCycle = [
      201, 202, 203, 204, 205, 206, 207, 208
    ];
    const modCycle = [
      609, 611, 612, 615, 601, 607, 610, 614
    ];

    const idx = (slotNumber - 1);
    const ampId = ampCycle[idx % ampCycle.length];
    const cabId = cabCycle[idx % cabCycle.length];
    const drvId = drvCycle[idx % drvCycle.length];
    const modId = modCycle[idx % modCycle.length];

    const isLeadOrCrunch = (idx % 2 === 1);
    const hasMod = (idx % 3 === 0);
    const hasDelay = (idx % 2 === 0);

    const preset = {
      name: cleanName,
      volume: 75,
      states: {
        0: true,                  // NR on
        1: false,                 // FX1
        2: isLeadOrCrunch,        // DRV on for crunch/lead
        3: true,                  // AMP on
        4: true,                  // IR on
        5: (idx % 4 === 2),       // EQ on sometimes
        6: hasMod,                // MOD on sometimes
        7: hasDelay,              // DLY on
        8: true                   // RVB on
      },
      order: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      ampMode: 'factory',
      selectedEffects: {
        0: 1,                     // Gate
        1: 101,                   // COMP 1
        2: drvId,                 // Varied Overdrive / Distortion
        3: ampId,                 // Varied Amp
        4: cabId,                 // Varied Cabinet
        5: 501,                   // GT EQ 1
        6: modId,                 // Varied Modulation
        7: 701 + (idx % 8),       // Varied Delay
        8: 801 + (idx % 10),      // Varied Reverb
        9: 901                    // Clone Profile 1
      },
      parameters: {}
    };

    for (const [mod, fxId] of Object.entries(preset.selectedEffects)) {
      preset.parameters[mod] = this.getDefaultParametersForFx(fxId);
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
    connection.onProgramChange((slot) => {
      if (!this.followPedalPresetChanges) return;
      this.selectPreset(slot, false);
    });
  }

  /** When on, switching preset on the pedal (footswitch / knob) switches the site too */
  setFollowPedalPresetChanges(enabled) {
    this.followPedalPresetChanges = !!enabled;
    try { localStorage.setItem('sonicake_follow_pedal', this.followPedalPresetChanges ? '1' : '0'); } catch (_) {}
    connection.log(`Cambio preset dalla pedaliera: ${enabled ? 'il sito segue la pedaliera' : 'il sito resta sul preset scelto'}.`, 'info');
  }

  handleIncomingSysEx(hexString) {
    // Raw preset transfers carry arbitrary bytes that could match the signature checks below
    if (this.rawTransferActive) return;
    const cleanHex = hexString.replace(/\s+/g, '').toUpperCase();

    // connection.js delivers whole messages: multi-frame answers are already reassembled
    const message = this.decodeTransportFrame(cleanHex);
    if (message) {
      const shown = Array.from(message.payload.slice(0, 16), b => b.toString(16).padStart(2, '0')).join(' ');
      connection.log(`Ricevuto: ${shown}${message.payload.length > 16 ? ` … (${message.payload.length} byte)` : ''}`, 'info');
    }

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

    // 3. Preset names answer [12 40] + 100 records (a late BLE terminator is just dropped)
    if (cleanHex === TERMINATOR_PACKET) return;
    if (this.isSyncingNames && message?.payload[0] === 0x12 && message.payload[1] === 0x40) {
      this.namesAnswer = message.payload;
      this.processNamesDump();
      return;
    }

    // 4. Preset State Sync (native reassembled packet or multi-packet dump)
    const isSysEx = (cleanHex.startsWith('8080F0') || cleanHex.startsWith('F0')) && cleanHex.endsWith('F7');
    if (this.isWaitingForPresetDump && isSysEx && cleanHex.length > 50) {
      const normalizedHex = cleanHex.startsWith('8080') ? cleanHex : ('8080' + cleanHex);

      // A. Case 1: Reassembled SysEx (from USB or BLE multi-packet transport)
      if (normalizedHex.length > 200) {
        clearTimeout(this.syncTimeoutId);
        this.syncTimeoutId = null;
        this.isWaitingForPresetDump = false;

        this.processPresetDump([normalizedHex]);
        this.dumpPackets = [];
        return;
      }

      // B. Case 2: Individual dump sub-packets received sequentially
      this.dumpPackets.push(normalizedHex);

      // Extend timeout each time a valid packet arrives to prevent premature timeout on BLE
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = setTimeout(() => {
        if (this.isWaitingForPresetDump) {
          if (this.dumpPackets.length > 0) {
            connection.log(`Processing received dump packets (${this.dumpPackets.length})...`, 'info');
            this.processPresetDump(this.dumpPackets);
          } else {
            connection.log('Preset state sync timed out.', 'warning');
          }
          this.isWaitingForPresetDump = false;
        }
      }, 3500);

      if (this.dumpPackets.length >= 5) {
        clearTimeout(this.syncTimeoutId);
        this.syncTimeoutId = null;
        this.isWaitingForPresetDump = false;

        this.processPresetDump(this.dumpPackets);
        this.dumpPackets = [];
      }
      return;
    }

    // 5a. Active preset message [12 43 <index> ...]: answer to our request or pushed by the pedal
    //     when the preset is changed from its footswitches / knob
    if (message && message.payload.length >= 3 && message.payload[0] === 0x12 && message.payload[1] === 0x43) {
      if (this.isWaitingForPresetNumber || this.followPedalPresetChanges) {
        this.applyHardwareActiveSlot(message.payload[2] + 1);
      }
      this.isWaitingForPresetNumber = false;
      return;
    }

    // 5b. Legacy preset number response (extract 2 nibbles at chars 30..34)
    if (this.isWaitingForPresetNumber || (cleanHex.indexOf('0201020403') >= 0 && cleanHex.length >= 34)) {
      // Unsolicited = preset changed on the pedal itself; requested answers are always applied
      if (this.isWaitingForPresetNumber || this.followPedalPresetChanges) {
        this.parseActivePresetSlotResponse(cleanHex);
      }
      this.isWaitingForPresetNumber = false;
      return;
    }
  }

  decodeAndApplyUserNames(packet, type) {
    const sig = type === 'Clone' ? '01020204' : '01020200';
    const sigIndex = packet.indexOf(sig);
    if (sigIndex < 0) return;

    // Answer = [12 24|20] + 5 occupancy bytes + 5 x 16-byte name records, nibble-encoded
    // (4 hex chars per byte): slot 0 starts 28 hex chars after the signature
    const slotStart = sigIndex + 28;
    const stride = 64; // 16 bytes = 64 hex chars per slot
    const namesArray = type === 'Clone' ? this.cloneSlotNames : this.irSlotNames;
    const baseFxId = type === 'Clone' ? 901 : 416;
    const logName = type === 'Clone' ? 'Clone Amp (NAM)' : 'User IR';

    const decodedNames = [];
    for (let s = 0; s < 5; s++) {
      const start = slotStart + s * stride;
      if (packet.length >= start + 40) {
        const slotHex = packet.substring(start, start + stride);
        let name = decodeName(slotHex, 16).trim();
        if (name === 'Empty' || !name) {
          name = type === 'Clone' ? `Slot ${s + 1} (Libero)` : `User IR ${s + 1}`;
        } else if (name.startsWith('Audio Assa')) {
          name = 'Audio Assault Slow30';
        } else if (name.startsWith('Petersburg')) {
          name = 'Petersburg Thunder';
        }
        decodedNames.push(name);
      }
    }

    if (decodedNames.length > 0) {
      this.hardwareSlotNames[type] = decodedNames.slice();
      // Right after a flash the pedal can still answer with the previous names: keep the
      // name just written until the pedal reports it (see waitForSlotCommit)
      const pending = this.pendingSlotWrite;
      decodedNames.forEach((name, i) => {
        if (pending && pending.type === type && pending.idx === i) return;
        namesArray[i] = name;
        const fxId = baseFxId + i;
        if (MODULE_LIBRARY_DATA.effectLibrary[fxId]) {
          MODULE_LIBRARY_DATA.effectLibrary[fxId].name = name;
        }
      });

      try {
        localStorage.setItem(type === 'Clone' ? 'sonicake_clone_names' : 'sonicake_ir_names', JSON.stringify(namesArray));
      } catch (e) {}

      connection.log(`Decoded ${decodedNames.length} ${logName} names from hardware: ${namesArray.join(', ')}`, 'success');
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
      this.applyHardwareActiveSlot(presetIndex + 1);
    } catch (e) {
      console.warn('Failed to parse preset number response:', e);
    }
  }

  /** The pedal reports `slot` (1-100) as its active preset: switch the site to it and read its settings */
  applyHardwareActiveSlot(slot) {
    try {
      if (slot >= 1 && slot <= 100) {
        if (slot !== this.currentSlot) {
          // 1. Cache previous preset if valid
          if (this.currentSlot >= 1 && this.currentSlot <= 100 && this.activePreset) {
            this.presetCache.set(this.currentSlot, JSON.parse(JSON.stringify(this.activePreset)));
          }

          this.currentSlot = slot;
          const presetItem = this.presetList[slot - 1];
          const targetName = presetItem ? presetItem.name : this.getSlotCode(slot);

          if (this.presetCache.has(slot)) {
            this.activePreset = JSON.parse(JSON.stringify(this.presetCache.get(slot)));
            if (presetItem && presetItem.name) {
              this.activePreset.name = presetItem.name;
            }
          } else {
            this.activePreset = this.createDefaultPresetForSlot(slot, targetName);
            this.presetCache.set(slot, JSON.parse(JSON.stringify(this.activePreset)));
          }

          this.isDirty = false;
          this.undoStack = [];
          this.redoStack = [];

          this.emit('slotChange', this.currentSlot);
          this.emit('dirtyChange', false);
          this.emit('stateChange', this.activePreset);
        } else {
          const presetItem = this.presetList[slot - 1];
          if (presetItem) {
            this.activePreset.name = presetItem.name;
          }
          this.emit('slotChange', this.currentSlot);
        }

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
    clearTimeout(this.nameSyncTimeoutId);
    this.nameSyncTimeoutId = null;

    let allNames = [];
    if (this.namesAnswer) {
      allNames = decodeNativePresetNames(this.namesAnswer);
    } else {
      // No (complete) answer in time: keep the current names, never guess them
      connection.log('Nessuna risposta completa con i nomi dei preset: nomi non aggiornati.', 'warning');
    }
    this.namesAnswer = null;

    if (allNames.length > 0) {
      connection.log(`Successfully synced ${allNames.length} preset names from pedal flash!`, 'success');
      for (let i = 0; i < allNames.length && i < this.presetList.length; i++) {
        if (allNames[i] && allNames[i].trim()) {
          this.presetList[i].name = allNames[i].trim();
        }
      }
      if (this.currentSlot >= 1 && this.currentSlot <= this.presetList.length) {
        this.activePreset.name = this.presetList[this.currentSlot - 1].name;
      }
      this.emit('presetListChange', this.presetList);
      this.emit('stateChange', this.activePreset);
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

      // 1. Try native hardware 476-byte TLV decoder
      if (packet1 && packet1.length > 200) {
        try {
          const nativeData = decodeNativeHardwareDump(packet1);
          if (nativeData) {
            this.activePreset.states = nativeData.states;
            this.activePreset.order = nativeData.order;
            this.activePreset.ampMode = nativeData.ampMode;
            this.activePreset.selectedEffects = {
              ...this.activePreset.selectedEffects,
              ...nativeData.selectedEffects
            };
            this.presetCache.set(this.currentSlot, JSON.parse(JSON.stringify(this.activePreset)));
            this.isDirty = false;
            this.emit('dirtyChange', false);
            this.emit('stateChange', this.activePreset);
            this.reportPresetToServer();
            connection.log(`Preset "${this.activePreset.name}" caricato dalla pedaliera!`, 'success');
            return;
          }
        } catch (e) {
          console.warn('Native hardware dump decode fallback:', e);
        }
      }

      // 2. Legacy fallback
      const packet2 = packets[1] || packet1;

      // Decode module states, chain order, amp mode, preset volume
      const stateOrder = decodePresetStateAndOrder(packet1);

      // Decode selected effects
      const effects = decodeSelectedEffects(packet2, this.signatureToFxIdMaps);

      // Decode parameter values from all packets
      const parameters = decodeParameterValues(packets, effects.selectedEffects);

      // Update active preset
      this.activePreset.volume = stateOrder.presetVolume || 75;
      if (stateOrder.states && Object.keys(stateOrder.states).length > 0) {
        this.activePreset.states = stateOrder.states;
      }
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

      // Update presetCache with the genuine hardware settings
      this.presetCache.set(this.currentSlot, JSON.parse(JSON.stringify(this.activePreset)));

      this.isDirty = false;
      this.emit('dirtyChange', false);
      this.emit('stateChange', this.activePreset);
      this.reportPresetToServer();
      connection.log(`Preset "${this.activePreset.name}" caricato dalla pedaliera!`, 'success');
    } catch (err) {
      connection.log(`Error parsing preset dump: ${err.message}`, 'error');
    }
  }

  reportPresetToServer() {
    // Local debugging aid only (server.py on the developer PC); never on the published site
    if (!import.meta.env?.DEV) return; // (undefined outside Vite, e.g. in the Node tests)
    try {
      const slot = this.currentSlot;
      const name = this.activePreset?.name || '';
      const ampMode = this.activePreset?.ampMode || 'factory';
      let ampName = 'Unknown';
      
      if (ampMode === 'clone') {
        const cloneFxId = this.activePreset?.selectedEffects?.[9];
        const cloneIdx = (cloneFxId ? cloneFxId - 901 : 0);
        ampName = `Tone3000 NAM: ${this.cloneSlotNames[cloneIdx] || `User Profile ${cloneIdx + 1}`}`;
      } else {
        const ampFxId = this.activePreset?.selectedEffects?.[3];
        const ampDef = MODULE_LIBRARY_DATA.effectLibrary[ampFxId];
        ampName = ampDef?.name || `Amp ${ampFxId}`;
      }

      fetch('http://localhost:8080/api/active-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          slotCode: this.getSlotCode(slot),
          name,
          ampMode,
          ampName,
          selectedEffects: this.activePreset?.selectedEffects,
          parameters: this.activePreset?.parameters,
          states: this.activePreset?.states
        })
      }).catch(() => {});
    } catch (e) {
      // Background report ignored
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
      this.namesAnswer = null;
      this.nameSyncResolve = resolve;

      clearTimeout(this.nameSyncTimeoutId);
      this.nameSyncTimeoutId = setTimeout(() => {
        if (this.isSyncingNames) {
          connection.log('Preset names sync timeout reached (10s). Processing what was received...', 'warning');
          this.processNamesDump();
        }
      }, 10000);

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
    }, 8000);

    connection.log('Requesting active preset parameters...', 'info');
    await connection.writeCommand(REQUEST_PRESET_STATE_CMD);
  }

  getPresetSwitchCommand(slotNumber) {
    if (slotNumber < 1 || slotNumber > 100) return null;
    if (slotNumber <= 50) {
      const pCode = `P${String(slotNumber).padStart(2, '0')}`;
      return COMMAND_LIBRARY_DATA.presetCommands?.user?.[pCode] || null;
    } else {
      const fCode = `F${String(slotNumber - 50).padStart(2, '0')}`;
      return COMMAND_LIBRARY_DATA.presetCommands?.factory?.[fCode] || null;
    }
  }

  async selectPreset(slotNumber, syncHardware = true) {
    if (slotNumber < 1 || slotNumber > 100) return;

    // 1. Save currently edited preset into cache before switching away
    if (this.currentSlot >= 1 && this.currentSlot <= 100 && this.activePreset) {
      this.presetCache.set(this.currentSlot, JSON.parse(JSON.stringify(this.activePreset)));
    }

    // 2. Set active slot index
    this.currentSlot = slotNumber;
    const presetItem = this.presetList[slotNumber - 1];
    const targetName = presetItem ? presetItem.name : this.getSlotCode(slotNumber);

    // 3. Load target preset from cache or generate preset template
    if (this.presetCache.has(slotNumber)) {
      this.activePreset = JSON.parse(JSON.stringify(this.presetCache.get(slotNumber)));
      if (presetItem && presetItem.name) {
        this.activePreset.name = presetItem.name;
      }
    } else {
      this.activePreset = this.createDefaultPresetForSlot(slotNumber, targetName);
      this.presetCache.set(slotNumber, JSON.parse(JSON.stringify(this.activePreset)));
    }

    this.isDirty = false;
    this.undoStack = [];
    this.redoStack = [];

    // 4. Immediately notify UI listeners (Header, SignalChain, ModuleEditor)
    this.emit('slotChange', this.currentSlot);
    this.emit('dirtyChange', false);
    this.emit('stateChange', this.activePreset);
    this.reportPresetToServer();

    // 5. Hardware Synchronization: Transmit preset change to physical pedalboard
    if (syncHardware && connection.isConnected) {
      const cmd = this.getPresetSwitchCommand(slotNumber);
      if (cmd) {
        await connection.writeCommand(cmd);
        connection.log(`Switched to preset ${this.getSlotCode(slotNumber)}: ${this.activePreset.name}`, 'info');

        // Optional standard MIDI Program Change on USB
        if (connection.connectionType === 'usb' && connection.midiOutput) {
          try {
            connection.midiOutput.send([0xC0, (slotNumber - 1) & 0x7F]);
          } catch (e) {
            // Ignore optional PC error
          }
        }

        // Give the DSP 100ms to switch to the new patch, then fetch its real parameters
        setTimeout(() => this.syncCurrentPresetState(), 100);
      } else {
        connection.log(`No hardware command mapped for slot ${slotNumber}`, 'warning');
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
    if (mode === 'clone' && (!this.activePreset.selectedEffects[9] || this.activePreset.selectedEffects[9] < 901)) {
      this.activePreset.selectedEffects[9] = 901;
      this.activePreset.parameters[9] = this.getDefaultParametersForFx(901);
    } else if (mode === 'factory' && (!this.activePreset.selectedEffects[3] || this.activePreset.selectedEffects[3] > 399)) {
      this.activePreset.selectedEffects[3] = 301;
      this.activePreset.parameters[3] = this.getDefaultParametersForFx(301);
    }
    this.markDirty();
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      const cmd = COMMAND_LIBRARY_DATA.ampModes?.[mode];
      if (cmd) {
        await connection.writeCommand(cmd);
      }
      const activeFx = mode === 'clone' 
        ? (this.activePreset.selectedEffects[9] || 901) 
        : (this.activePreset.selectedEffects[3] || 301);
      const fxCmd = COMMAND_LIBRARY_DATA.effectTypes?.[3]?.[activeFx];
      if (fxCmd) {
        await connection.writeCommand(fxCmd);
      }
    }
  }

  async setEffectType(moduleId, fxId, syncHardware = true) {
    this.pushUndoSnapshot();
    const numFxId = parseInt(fxId, 10);
    const numModId = parseInt(moduleId, 10);

    // If setting clone profile (901-905)
    if (numFxId >= 901 && numFxId <= 905) {
      this.activePreset.ampMode = 'clone';
      this.activePreset.selectedEffects[9] = numFxId;
      this.activePreset.selectedEffects[3] = numFxId;
      this.activePreset.parameters[9] = this.getDefaultParametersForFx(numFxId);
    } else if (numFxId >= 301 && numFxId <= 322) {
      this.activePreset.ampMode = 'factory';
      this.activePreset.selectedEffects[3] = numFxId;
      this.activePreset.parameters[3] = this.getDefaultParametersForFx(numFxId);
    } else {
      this.activePreset.selectedEffects[numModId] = numFxId;
      this.activePreset.parameters[numModId] = this.getDefaultParametersForFx(numFxId);
    }

    this.markDirty();
    this.emit('stateChange', this.activePreset);

    if (syncHardware && connection.isConnected) {
      // If amp change, ensure hardware amp mode is synchronized
      if (numFxId >= 901 && numFxId <= 905) {
        const modeCmd = COMMAND_LIBRARY_DATA.ampModes?.['clone'];
        if (modeCmd) await connection.writeCommand(modeCmd);
      } else if (numFxId >= 301 && numFxId <= 322) {
        const modeCmd = COMMAND_LIBRARY_DATA.ampModes?.['factory'];
        if (modeCmd) await connection.writeCommand(modeCmd);
      }

      const cmd = COMMAND_LIBRARY_DATA.effectTypes?.[numModId]?.[numFxId] || 
                  (numModId === 9 || numFxId >= 901 ? COMMAND_LIBRARY_DATA.effectTypes?.[3]?.[numFxId] : null) ||
                  (numModId === 3 ? COMMAND_LIBRARY_DATA.effectTypes?.[3]?.[numFxId] : null);
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
    if (syncHardware) {
      this.sendThrottled('presetVolume', COMMAND_LIBRARY_DATA.globalCommands?.presetVolume?.[this.activePreset.volume]);
    }
  }

  /**
   * Pedal master volume (global, not stored in presets). The pedal does not report it back,
   * so the last value set from this app is remembered locally.
   */
  setMasterVolume(volume, syncHardware = true) {
    this.masterVolume = Math.max(0, Math.min(100, Math.round(volume)));
    try { localStorage.setItem('sonicake_master_volume', String(this.masterVolume)); } catch (_) {}
    if (syncHardware) {
      this.sendThrottled('masterVolume', COMMAND_LIBRARY_DATA.globalCommands?.globalVolume?.[this.masterVolume]);
    }
  }

  /** Slider-friendly sender: first value immediately, then at most one command every 40ms, always the latest */
  sendThrottled(key, cmd) {
    if (!cmd || !connection.isConnected) return;
    this.throttle = this.throttle || {};
    const slot = this.throttle[key] || (this.throttle[key] = { timer: null, pending: null });
    if (slot.timer) {
      slot.pending = cmd;
      return;
    }
    connection.writeCommand(cmd);
    slot.timer = setTimeout(function flush() {
      if (slot.pending) {
        const next = slot.pending;
        slot.pending = null;
        connection.writeCommand(next);
        slot.timer = setTimeout(flush, 40);
      } else {
        slot.timer = null;
      }
    }, 40);
  }

  async setChainOrder(newOrder, syncHardware = true) {
    if (!Array.isArray(newOrder) || newOrder.length !== 9) return;
    // Only the 720 routings the pedal supports (DRV-AMP-IR-EQ fixed block) are accepted
    const routingKey = newOrder.map(id => MODULE_NAMES[id]).join('-');
    if (!COMMAND_LIBRARY_DATA.chainOrderCommands?.[routingKey]) {
      connection.log(`Ordine catena non supportato dalla pedaliera: ${routingKey}`, 'warning');
      return;
    }
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
    return this.savePresetToSlot(slotNumber || this.currentSlot, name, { switchSlot: true });
  }

  async savePresetToSlot(slotNumber, name, options = { switchSlot: true }) {
    const targetSlot = Math.min(50, Math.max(1, parseInt(slotNumber, 10)));
    const cleanName = (name || this.activePreset.name || 'Preset').trim().slice(0, 10);

    if (connection.isConnected) {
      const cmd = buildSavePresetCommand(targetSlot, cleanName);
      connection.log(`Salvataggio nello slot ${this.getSlotCode(targetSlot)} ("${cleanName}")...`, 'info');
      const success = await connection.writeCommand(cmd);
      if (success) {
        connection.log(`Preset salvato con successo nello slot ${this.getSlotCode(targetSlot)}!`, 'success');
      }
    }

    if (this.presetList[targetSlot - 1]) {
      this.presetList[targetSlot - 1].name = cleanName;
    }

    // Cache the saved preset for this slot
    const savedPresetData = JSON.parse(JSON.stringify(this.activePreset));
    savedPresetData.name = cleanName;
    this.presetCache.set(targetSlot, savedPresetData);

    if (targetSlot === this.currentSlot || options.switchSlot) {
      this.currentSlot = targetSlot;
      this.activePreset.name = cleanName;
      this.isDirty = false;
      this.emit('dirtyChange', false);
      this.emit('slotChange', this.currentSlot);
      this.emit('stateChange', this.activePreset);
    } else {
      connection.log(`Rimani sullo slot attivo di lavoro: ${this.getSlotCode(this.currentSlot)} (${this.activePreset.name})`, 'info');
    }

    this.emit('presetListChange', this.presetList);
  }

  async writePresetDataToSlot(slotNumber, name, presetData, options = { switchSlot: true }) {
    const targetSlot = Math.min(50, Math.max(1, parseInt(slotNumber, 10)));
    const cleanName = (name || presetData.name || 'Preset').trim().slice(0, 10);

    // Save previous edit state if user wants to stay on current working slot
    const previousSnapshot = options.switchSlot ? null : this.takeSnapshot();
    const previousSlot = this.currentSlot;

    // Apply preset data to engine
    this.applySnapshot(presetData);
    this.activePreset.name = cleanName;

    // Cache the written preset for targetSlot
    this.presetCache.set(targetSlot, JSON.parse(JSON.stringify(this.activePreset)));

    if (connection.isConnected) {
      await new Promise(r => setTimeout(r, 120));
      const cmd = buildSavePresetCommand(targetSlot, cleanName);
      connection.log(`Scrittura del preset nello slot ${this.getSlotCode(targetSlot)} ("${cleanName}")...`, 'info');
      await connection.writeCommand(cmd);
      connection.log(`Preset scritto con successo nello slot ${this.getSlotCode(targetSlot)}!`, 'success');
    }

    if (this.presetList[targetSlot - 1]) {
      this.presetList[targetSlot - 1].name = cleanName;
    }
    this.emit('presetListChange', this.presetList);

    if (options.switchSlot) {
      this.currentSlot = targetSlot;
      this.isDirty = false;
      this.emit('dirtyChange', false);
      this.emit('slotChange', this.currentSlot);
      this.emit('stateChange', this.activePreset);
    } else if (previousSnapshot) {
      this.applySnapshot(previousSnapshot);
      this.currentSlot = previousSlot;
      this.emit('slotChange', this.currentSlot);
      this.emit('stateChange', this.activePreset);
      connection.log(`Ripristinato lo slot attivo di lavoro: ${this.getSlotCode(this.currentSlot)}`, 'info');
    }
  }

  exportActivePresetJson() {
    const p = this.activePreset;
    return {
      version: "1.0",
      presetName: p.name,
      description: "Exported from Sonicake Pedaliera Preset Manager",
      ampMode: p.ampMode === 'clone' ? 'Clone' : 'Normal',
      presetVolume: p.volume !== undefined ? p.volume : 75,
      states: p.states,
      selectedEffects: p.selectedEffects,
      parameters: p.parameters,
      order: p.order,
      metadata: {
        createdDate: new Date().toISOString(),
        author: "Sonicake Preset Manager"
      }
    };
  }

  exportAllPresetsBackupJson() {
    return {
      version: "1.0",
      backupType: "user_presets_50",
      exportDate: new Date().toISOString(),
      presets: this.presetList.slice(0, 50).map((item, idx) => ({
        slot: idx + 1,
        code: this.getSlotCode(idx + 1),
        name: item.name
      }))
    };
  }

  // --- A/B Comparison ---

  takeSnapshot() {
    return JSON.parse(JSON.stringify(this.activePreset));
  }

  applySnapshot(snapshot) {
    this.activePreset = JSON.parse(JSON.stringify(snapshot));
    this.emit('stateChange', this.activePreset);
    if (connection.isConnected) {
      if (this.activePreset.ampMode) {
        const modeCmd = COMMAND_LIBRARY_DATA.ampModes?.[this.activePreset.ampMode];
        if (modeCmd) connection.writeCommand(modeCmd);
      }
      if (this.activePreset.volume !== undefined) {
        const volCmd = COMMAND_LIBRARY_DATA.globalCommands?.presetVolume?.[this.activePreset.volume];
        if (volCmd) connection.writeCommand(volCmd);
      }
      if (Array.isArray(this.activePreset.order) && this.activePreset.order.length === 9) {
        const key = this.activePreset.order.map(id => MODULE_NAMES[id]).join('-');
        const chainCmd = COMMAND_LIBRARY_DATA.chainOrderCommands?.[key];
        if (chainCmd) connection.writeCommand(chainCmd);
      }
      for (const [modId, isOn] of Object.entries(this.activePreset.states || {})) {
        const cmd = COMMAND_LIBRARY_DATA.moduleStates?.[modId]?.[isOn ? 'on' : 'off'];
        if (cmd) connection.writeCommand(cmd);
      }
      for (const [modId, fxId] of Object.entries(this.activePreset.selectedEffects || {})) {
        const numMod = parseInt(modId, 10);
        const cmd = COMMAND_LIBRARY_DATA.effectTypes?.[modId]?.[fxId] ||
                    (numMod === 9 || fxId >= 901 ? COMMAND_LIBRARY_DATA.effectTypes?.[3]?.[fxId] : null);
        if (cmd) connection.writeCommand(cmd);
      }
      for (const [modId, params] of Object.entries(this.activePreset.parameters || {})) {
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

  /** Read a user preset (1-50) from the pedal as a Sonicake Manager compatible .prst file */
  async exportPrstFromSlot(slot) {
    if (!(slot >= 1 && slot <= 50)) throw new Error('Si possono esportare solo i preset utente (U01-U50).');
    this.rawTransferActive = true;
    try {
      const raw = await this.exportPresetRaw(slot);
      return { bytes: PrstParser.build(raw), name: PrstParser.readName(raw.subarray(6)) || this.getSlotCode(slot) };
    } finally {
      this.rawTransferActive = false;
    }
  }

  /**
   * Write a .prst file into a user slot (1-50) on the pedal. The 502 preset bytes are sent untouched
   * (only the name is replaced when `newName` is given), exactly like Sonicake Manager's import.
   */
  async importPrstToSlot(buffer, slot, { newName = null, onProgress = () => {} } = {}) {
    if (!(slot >= 1 && slot <= 50)) throw new Error('Si può importare solo nei preset utente (U01-U50).');
    if (!connection.isConnected) throw new Error('Pedaliera non connessa.');
    const parsed = PrstParser.parse(buffer);
    const raw = newName ? PrstParser.withName(parsed.raw, newName) : parsed.raw;

    this.rawTransferActive = true;
    try {
      await this.importPresetRaw(slot, raw, onProgress);
    } finally {
      this.rawTransferActive = false;
    }
    this.presetCache.delete(slot);
    await this.syncPresetNames();
    await this.selectPreset(slot);
    connection.log(`File "${parsed.name}" importato nel preset ${this.getSlotCode(slot)}.`, 'success');
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

  // --- Tone3000 & Internal File Memory Slot Replacement ---

  replaceCloneProfile(slotIndex, tone, updateActivePreset = false) {
    const idx = Math.max(0, Math.min(4, parseInt(slotIndex, 10) || 0));
    const fxId = 901 + idx;
    const cleanName = (typeof tone === 'string' 
      ? tone 
      : (tone.variationName || tone.title || 'Profile')).trim().slice(0, 14);

    this.cloneSlotNames[idx] = cleanName;
    
    // Store metadata
    if (typeof tone === 'object' && tone !== null) {
      this.cloneSlotMetadata[idx] = {
        type: 'amp',
        toneId: tone.toneId || tone.id || null,
        toneTitle: tone.toneTitle || tone.title || cleanName,
        variationName: tone.variationName || cleanName,
        modelId: tone.modelId || null,
        modelUrl: tone.modelUrl || tone.url || null,
        pageUrl: tone.pageUrl || tone.url || null,
        gear: tone.gear || 'amp',
        description: tone.description || '',
        ...slotSourceFields(tone)
      };
    } else {
      this.cloneSlotMetadata[idx] = {
        type: 'amp',
        toneTitle: cleanName,
        variationName: cleanName
      };
    }

    if (MODULE_LIBRARY_DATA.effectLibrary[fxId]) {
      MODULE_LIBRARY_DATA.effectLibrary[fxId].name = cleanName;
      MODULE_LIBRARY_DATA.effectLibrary[fxId].descriptionEn = (typeof tone === 'object' && tone.description) 
        ? tone.description 
        : `NAM Profile in Slot ${idx + 1}: ${cleanName}`;
    }

    // Only touch active preset if explicitly requested by user!
    if (updateActivePreset) {
      this.setAmpMode('clone', true);
      this.setEffectType(9, fxId, true);
      this.activePreset.tone3000Model = this.cloneSlotMetadata[idx];
      this.emit('stateChange', this.activePreset);
    }

    try {
      localStorage.setItem('sonicake_clone_metadata', JSON.stringify(this.cloneSlotMetadata));
      localStorage.setItem('sonicake_clone_names', JSON.stringify(this.cloneSlotNames));
    } catch (e) {}

    this.emit('userSlotsChange', { type: 'Clone', names: this.cloneSlotNames });
    connection.log(`Aggiornato slot memoria Clone Profile ${idx + 1}: "${cleanName}" (Preset invariati)`, 'success');
  }

  replaceUserIR(slotIndex, tone, updateActivePreset = false) {
    const idx = Math.max(0, Math.min(4, parseInt(slotIndex, 10) || 0));
    const fxId = 416 + idx;
    const cleanName = (typeof tone === 'string' 
      ? tone 
      : (tone.variationName || tone.title || 'User IR')).trim().slice(0, 14);

    this.irSlotNames[idx] = cleanName;

    // Store metadata
    if (typeof tone === 'object' && tone !== null) {
      this.irSlotMetadata[idx] = {
        type: 'cab',
        toneId: tone.toneId || tone.id || null,
        toneTitle: tone.toneTitle || tone.title || cleanName,
        variationName: tone.variationName || cleanName,
        modelId: tone.modelId || null,
        modelUrl: tone.modelUrl || tone.url || null,
        pageUrl: tone.pageUrl || tone.url || null,
        gear: tone.gear || 'cab',
        description: tone.description || '',
        ...slotSourceFields(tone)
      };
    } else {
      this.irSlotMetadata[idx] = {
        type: 'cab',
        toneTitle: cleanName,
        variationName: cleanName
      };
    }

    if (MODULE_LIBRARY_DATA.effectLibrary[fxId]) {
      MODULE_LIBRARY_DATA.effectLibrary[fxId].name = cleanName;
      MODULE_LIBRARY_DATA.effectLibrary[fxId].descriptionEn = (typeof tone === 'object' && tone.description)
        ? tone.description
        : `User IR in Slot ${idx + 1}: ${cleanName}`;
    }

    // Only touch active preset if explicitly requested by user!
    if (updateActivePreset) {
      this.setEffectType(4, fxId, true);
      this.activePreset.tone3000Model = this.irSlotMetadata[idx];
      this.emit('stateChange', this.activePreset);
    }

    try {
      localStorage.setItem('sonicake_ir_metadata', JSON.stringify(this.irSlotMetadata));
      localStorage.setItem('sonicake_ir_names', JSON.stringify(this.irSlotNames));
    } catch (e) {}

    this.emit('userSlotsChange', { type: 'IR', names: this.irSlotNames });
    connection.log(`Aggiornato slot memoria User IR ${idx + 1}: "${cleanName}" (Preset invariati)`, 'success');
  }

  async activateCloneSlot(slotIndex, syncHardware = true) {
    const idx = Math.max(0, Math.min(4, parseInt(slotIndex, 10) || 0));
    const fxId = 901 + idx;
    // setEffectType already switches the amp to clone mode: calling setAmpMode first would
    // re-send the previously selected clone slot before the new one
    await this.setEffectType(9, fxId, syncHardware);
    this.activePreset.tone3000Model = this.cloneSlotMetadata[idx];
    this.emit('stateChange', this.activePreset);
    connection.log(`Sintonizzata pedaliera su Slot Clone NAM ${idx + 1}: "${this.cloneSlotNames[idx]}"`, 'info');
  }

  async activateIRSlot(slotIndex, syncHardware = true) {
    const idx = Math.max(0, Math.min(4, parseInt(slotIndex, 10) || 0));
    const fxId = 416 + idx;
    await this.setEffectType(4, fxId, syncHardware);
    this.activePreset.tone3000Model = this.irSlotMetadata[idx];
    this.emit('stateChange', this.activePreset);
    connection.log(`Sintonizzata pedaliera su Slot User IR ${idx + 1}: "${this.irSlotNames[idx]}"`, 'info');
  }

  applyTone3000(tone, targetSlot = 0, updateActivePreset = false) {
    const isCab = tone && (tone.gear === 'cab' || tone.gear === 'ir');
    if (isCab) {
      this.replaceUserIR(targetSlot, tone, updateActivePreset);
    } else {
      this.replaceCloneProfile(targetSlot, tone, updateActivePreset);
    }
  }

  getPresetBundle() {
    const p = this.activePreset;
    const bundle = {
      format: 'sonicake-bundle',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      preset: JSON.parse(JSON.stringify(p)),
      tone3000Model: null
    };

    // Check if preset uses a Clone Profile (Slot 901-905)
    const isClone = p.ampMode === 'clone' || (p.selectedEffects && p.selectedEffects[9] >= 901 && p.selectedEffects[9] <= 905);
    if (isClone) {
      const slotIdx = (p.selectedEffects && p.selectedEffects[9] ? p.selectedEffects[9] - 901 : 0);
      const meta = this.cloneSlotMetadata[slotIdx];
      const slotName = this.cloneSlotNames[slotIdx] || `Clone ${slotIdx + 1}`;
      bundle.tone3000Model = {
        type: 'amp',
        originalSlot: slotIdx,
        slotName: slotName,
        toneTitle: (meta && meta.toneTitle) || slotName,
        variationName: (meta && meta.variationName) || slotName,
        toneId: (meta && meta.toneId) || null,
        modelId: (meta && meta.modelId) || null,
        modelUrl: (meta && meta.modelUrl) || null,
        pageUrl: (meta && meta.pageUrl) || null,
        gear: 'amp'
      };
    } else if (p.selectedEffects && p.selectedEffects[4] >= 416 && p.selectedEffects[4] <= 420) {
      // Check if preset uses a User IR (Slot 416-420)
      const slotIdx = p.selectedEffects[4] - 416;
      const meta = this.irSlotMetadata[slotIdx];
      const slotName = this.irSlotNames[slotIdx] || `User IR ${slotIdx + 1}`;
      bundle.tone3000Model = {
        type: 'cab',
        originalSlot: slotIdx,
        slotName: slotName,
        toneTitle: (meta && meta.toneTitle) || slotName,
        variationName: (meta && meta.variationName) || slotName,
        toneId: (meta && meta.toneId) || null,
        modelId: (meta && meta.modelId) || null,
        modelUrl: (meta && meta.modelUrl) || null,
        pageUrl: (meta && meta.pageUrl) || null,
        gear: 'cab'
      };
    }

    return bundle;
  }

  applyPresetBundle(bundle, slotChoice = {}) {
    if (!bundle || !bundle.preset) {
      throw new Error('Invalid preset bundle structure');
    }

    this.pushUndoSnapshot();

    // 1. If embedded Tone3000/Clone model exists and user picked a slot
    if (bundle.tone3000Model) {
      const model = bundle.tone3000Model;
      if (model.type === 'amp') {
        const targetSlot = (slotChoice.ampSlot !== undefined) ? parseInt(slotChoice.ampSlot, 10) : 0;
        this.replaceCloneProfile(targetSlot, {
          toneTitle: model.toneTitle,
          title: model.toneTitle,
          variationName: model.variationName,
          id: model.toneId,
          modelId: model.modelId,
          url: model.modelUrl || model.pageUrl,
          gear: 'amp'
        }, false);
        // Map preset's Clone effect ID to chosen slot
        bundle.preset.ampMode = 'clone';
        bundle.preset.selectedEffects[9] = 901 + targetSlot;
      } else if (model.type === 'cab') {
        const targetSlot = (slotChoice.cabSlot !== undefined) ? parseInt(slotChoice.cabSlot, 10) : 0;
        this.replaceUserIR(targetSlot, {
          toneTitle: model.toneTitle,
          title: model.toneTitle,
          variationName: model.variationName,
          id: model.toneId,
          modelId: model.modelId,
          url: model.modelUrl || model.pageUrl,
          gear: 'cab'
        }, false);
        // Map preset's IR effect ID to chosen slot
        bundle.preset.selectedEffects[4] = 416 + targetSlot;
      }
    }

    // 2. Apply snapshot to active preset and sync
    this.applySnapshot(bundle.preset);
    this.markDirty();
    connection.log(`Preset bundle "${bundle.preset.name}" applicato con successo!`, 'success');
  }

  // --- Hardware Flash Memory Streaming ---

  /**
   * Flash a User IR (.wav) directly into pedalboard persistent flash memory (Slot 1 to 5)
   * Streams 112 chunked SysEx packets with CRC8 directly over Web MIDI / BLE.
   * @param {number} slotIndex 0 to 4 (representing User IR 1 to 5)
   * @param {Uint8Array|Float32Array} irData 2122-byte payload or 512-sample float array
   * @param {string} name Slot name (up to 14 chars)
   * @param {Function} [onProgress] Progress callback (current, total, percent)
   */
  async flashIRToPedal(slotIndex, irData, name, onProgress = () => {}) {
    if (!connection.isConnected) {
      throw new Error('Pedaliera non connessa. Collega il cavo USB o Bluetooth.');
    }
    if (slotIndex < 0 || slotIndex > 4) {
      throw new Error('Indice slot IR non valido (deve essere tra 1 e 5).');
    }

    let binaryPayload;
    if (irData instanceof Uint8Array && irData.length === 2122) {
      binaryPayload = irData;
    } else {
      binaryPayload = buildIRPayload(slotIndex, name, irData);
    }

    const packets = buildStreamingFlashPackets(binaryPayload);
    const total = packets.length;

    connection.log(`Inizio scrittura Flash: User IR ${slotIndex + 1} ("${name}") - ${total} pacchetti SysEx...`, 'info');

    // Busy from the first packet to the commit check: an app update must not reload meanwhile
    this.pedalWrites = (this.pedalWrites || 0) + 1;
    try {
      await this.streamFlashPackets(packets, onProgress);

      // Wait for flash sector write completion (as observed in hardware capture: ~1.2s)
      await new Promise(r => setTimeout(r, 1200));

      // Update local name and persist metadata
      this.replaceUserIR(slotIndex, name, false);

      // The pedal keeps committing for a while: wait until it reports the new slot name
      const committed = await this.waitForSlotCommit('IR', slotIndex, name);
      connection.log(committed
        ? `Scrittura completata con successo! User IR ${slotIndex + 1} aggiornato in Flash.`
        : `User IR ${slotIndex + 1} scritto, ma la pedaliera non ha ancora confermato il nome: verifica con una sincronizzazione.`,
        committed ? 'success' : 'warning');
    } finally {
      this.pedalWrites--;
    }
    return true;
  }

  /**
   * Send the packets of a Clone AMP / User IR flash. The pedal ACKs every packet with [14 08 00]
   * (captured on USB): each packet waits for its ACK (max 1 s), at least 9 ms apart (8 ms + margin)
   * (DMA FIFO limit). A missing ACK mid-stream stops the write with an error instead of reporting
   * a false success. A pedal that does not ACK even the first packet gets a fixed 9 ms pacing.
   */
  async streamFlashPackets(packets, onProgress = () => {}) {
    // 8 ms hardware minimum + 1 ms margin: timers and the USB / BLE stack add jitter, so the gap
    // seen by the pedal can be shorter than the one between our sends
    const MIN_GAP_MS = 9;
    const total = packets.length;
    let waitAck = true;
    let lastSent = -Infinity;
    for (let i = 0; i < total; i++) {
      // Never closer than MIN_GAP_MS: re-check after the timer, which can fire slightly early
      let elapsed;
      while ((elapsed = performance.now() - lastSent) < MIN_GAP_MS) {
        await new Promise(r => setTimeout(r, Math.ceil(MIN_GAP_MS - elapsed)));
      }
      const ack = waitAck
        ? this.waitForFrame((f) => (f.payload[0] === 0x14 && f.payload[1] === 0x08 ? true : null), 1000, `conferma pacchetto ${i + 1}`).catch(() => false)
        : null;
      lastSent = performance.now();
      await connection.writeRawBytes(packets[i]);
      if (waitAck && !(await ack)) {
        if (i > 0) {
          throw new Error(`La pedaliera non ha confermato il pacchetto ${i + 1}/${total}: scrittura interrotta. Riprova.`);
        }
        waitAck = false;
        connection.log('La pedaliera non conferma i pacchetti: invio a ritmo fisso (9 ms).', 'warning');
      }
      onProgress(i + 1, total, Math.round(((i + 1) / total) * 100));
    }
  }

  // --- Renaming Clone AMP / User IR slots ---

  /**
   * Rename a Clone AMP / User IR slot on the pedal with the native rename message (captured from
   * Sonicake Manager, see buildSlotRenamePayload): only the name changes, any slot can be renamed
   * (also captures written by SonicLink). 2 frames paced on the pedal ACKs, then the slot names
   * are read again until the pedal reports the new one.
   * @returns {Promise<boolean>} true when the pedal confirmed the new name
   */
  async renameSlotOnPedal(type, idx, newName) {
    if (!connection.isConnected) throw new Error('Collega la pedaliera per rinominare lo slot.');
    // At most 10 characters, like the rename of Sonicake Manager / SonicLink
    const name = String(newName || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, SLOT_RENAME_MAX);
    if (!name) throw new Error('Nome non valido.');
    const label = type === 'Clone' ? `Clone AMP ${idx + 1}` : `User IR ${idx + 1}`;
    connection.log(`Rinomina ${label} in "${name}"...`, 'info');
    this.pedalWrites = (this.pedalWrites || 0) + 1;
    try {
      await this.streamFlashPackets(buildStreamingFlashPackets(buildSlotRenamePayload(type, idx, name)));
      // Same capture, new name: a TONE3000 origin stays with the slot
      const meta = (type === 'Clone' ? this.cloneSlotMetadata : this.irSlotMetadata)[idx];
      const renamed = meta && meta.source === 'tone3000' ? { ...meta, variationName: name } : name;
      if (type === 'Clone') this.replaceCloneProfile(idx, renamed, false);
      else this.replaceUserIR(idx, renamed, false);
      const confirmed = await this.waitForSlotCommit(type, idx, name);
      connection.log(confirmed
        ? `${label} rinominato in "${name}".`
        : `${label}: la pedaliera non ha ancora confermato il nuovo nome, verifica con una sincronizzazione.`,
        confirmed ? 'success' : 'warning');
      return confirmed;
    } finally {
      this.pedalWrites--;
    }
  }

  /** True while the pedal is being written (Clone AMP / IR flash, preset import / swap / export) */
  isBusyWithPedal() {
    return (this.pedalWrites || 0) > 0 || !!this.rawTransferActive;
  }

  /**
   * After a flash, poll the slot names until the pedal reports `name` in slot `idx` (it answers
   * with the previous names for a few seconds while it commits). Returns true once confirmed.
   */
  async waitForSlotCommit(type, idx, name, timeoutMs = 6000) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    const expected = norm(name).slice(0, 16);
    const sync = type === 'Clone' ? () => this.syncCloneAmpNames() : () => this.syncUserIRNames();
    this.pendingSlotWrite = { type, idx, name };
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        await sync();
        const reported = norm(this.hardwareSlotNames[type][idx]);
        if (reported && (reported === expected || (reported.length >= 10 && expected.startsWith(reported)))) {
          return true;
        }
        await new Promise(r => setTimeout(r, 700));
      }
      return false;
    } finally {
      this.pendingSlotWrite = null;
    }
  }

  /**
   * Flash a Clone AMP (NAM / .namb / .clo) directly into pedalboard persistent flash memory (Slot 1 to 5)
   * Streams chunked SysEx packets with CRC8 directly over Web MIDI / BLE.
   * @param {number} slotIndex 0 to 4 (representing Clone 1 to 5)
   * @param {Uint8Array} binaryData Raw binary profile data (e.g. 2696-byte or converted payload)
   * @param {string} name Slot name (up to 14 chars)
   * @param {Function} [onProgress] Progress callback (current, total, percent)
   */
  async flashCloneToPedal(slotIndex, binaryData, name, onProgress = () => {}) {
    if (!connection.isConnected) {
      throw new Error('Pedaliera non connessa. Collega il cavo USB o Bluetooth.');
    }
    if (slotIndex < 0 || slotIndex > 4) {
      throw new Error('Indice slot Clone non valido (deve essere tra 1 e 5).');
    }

    // Build the verified 2,770-byte hardware payload (74-byte slot header + 2,696-byte Low Model)
    const payload = buildClonePayload(slotIndex, name, binaryData);
    const packets = buildStreamingFlashPackets(payload);
    const total = packets.length; // Exactly 146 packets

    connection.log(`Inizio scrittura Flash: Clone AMP ${slotIndex + 1} ("${name}") - ${total} pacchetti SysEx...`, 'info');

    // Send query command before stream (observed in hardware capture)
    try {
      await connection.writeCommand(REQUEST_CLONE_AMP_NAMES_CMD);
      await new Promise(r => setTimeout(r, 60));
    } catch (_) {}

    // Busy from the first packet to the commit check: an app update must not reload meanwhile
    this.pedalWrites = (this.pedalWrites || 0) + 1;
    try {
      await this.streamFlashPackets(packets, onProgress);

      // Wait for flash sector write completion (as observed in hardware capture: ~1.2s)
      await new Promise(r => setTimeout(r, 1200));

      // Update local name and persist metadata
      this.replaceCloneProfile(slotIndex, name, false);

      // The pedal keeps committing for a while: wait until it reports the new slot name
      const committed = await this.waitForSlotCommit('Clone', slotIndex, name);
      connection.log(committed
        ? `Scrittura completata con successo! Clone AMP ${slotIndex + 1} memorizzato in Flash (${total} pacchetti).`
        : `Clone AMP ${slotIndex + 1} scritto, ma la pedaliera non ha ancora confermato il nome: verifica con una sincronizzazione.`,
        committed ? 'success' : 'warning');
    } finally {
      this.pedalWrites--;
    }
    return true;
  }

  // --- Native preset export / import / swap ---
  // Same protocol as Sonicake Manager "Export/Import preset" (verified on captured USB traffic):
  //   export request : [12 4F slot 00 00 00]                    -> 27 x 19-byte frames
  //   export data    : [12 4F FF FF FF FF] + 502 preset bytes   (508 bytes)
  //   import data    : [11 4F slot 00 00 00] + same 502 bytes, ACK [14 08 00] after every frame
  // The 502 bytes are copied untouched, so a swap never loses any parameter.

  /** Decode a dispatched hex frame (8080 F0 crc crc total idx len payload-nibbles F7) */
  decodeTransportFrame(hex) {
    let h = hex.replace(/\s+/g, '').toUpperCase();
    if (h.startsWith('8080')) h = h.slice(4);
    if (!h.startsWith('F0') || !h.endsWith('F7') || h.length < 20) return null;
    const nib = h.slice(2, -2).match(/../g).map(x => parseInt(x, 16) & 0x0F);
    const byteAt = (k) => (nib[k] << 4) | nib[k + 1];
    const payloadNib = nib.slice(8);
    const payload = new Uint8Array(Math.floor(payloadNib.length / 2));
    for (let k = 0; k < payload.length; k++) payload[k] = (payloadNib[2 * k] << 4) | payloadNib[2 * k + 1];
    return { total: byteAt(2), idx: byteAt(4), len: byteAt(6), payload };
  }

  /** Resolve with the first frame accepted by `accept(frame)` (return value = result), or reject on timeout */
  waitForFrame(accept, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const off = connection.onMessage((hex) => {
        const frame = this.decodeTransportFrame(hex);
        if (!frame) return;
        const result = accept(frame);
        if (result !== undefined && result !== null) {
          clearTimeout(timer);
          off();
          resolve(result);
        }
      });
      const timer = setTimeout(() => { off(); reject(new Error(`Nessuna risposta dalla pedaliera (${label}).`)); }, timeoutMs);
    });
  }

  /** Read the full raw data of a user preset (slot 1-50) from the pedal */
  async exportPresetRaw(slot) {
    if (!connection.isConnected) throw new Error('Pedaliera non connessa.');
    const index = slot - 1;
    // The 27-frame answer arrives reassembled by connection.js (USB and BLE)
    const pending = this.waitForFrame((f) => (
      f.payload.length >= 508 && f.payload[0] === 0x12 && f.payload[1] === 0x4F ? f.payload.slice(0, 508) : null
    ), 4000, `lettura ${this.getSlotCode(slot)}`);
    await connection.writeRawBytes(buildStreamingFlashPackets(new Uint8Array([0x12, 0x4F, index, 0, 0, 0]))[0]);
    const data = await pending;
    if (data.length !== 508 || data[2] !== 0xFF || data[5] !== 0xFF) {
      throw new Error(`Dati del preset ${this.getSlotCode(slot)} non validi (${data.length} byte).`);
    }
    return data;
  }

  /** Write raw preset data (as returned by exportPresetRaw) into a user slot, ACK-paced like Sonicake Manager */
  async importPresetRaw(slot, rawData, onProgress = () => {}) {
    if (!connection.isConnected) throw new Error('Pedaliera non connessa.');
    if (!(rawData instanceof Uint8Array) || rawData.length !== 508 || rawData[1] !== 0x4F) {
      throw new Error('Dati preset non validi: scrittura annullata.');
    }
    const payload = new Uint8Array(rawData);
    payload.set([0x11, 0x4F, slot - 1, 0, 0, 0], 0);
    const packets = buildStreamingFlashPackets(payload);

    for (let i = 0; i < packets.length; i++) {
      let acked = false;
      for (let attempt = 0; attempt < 3 && !acked; attempt++) {
        const ack = this.waitForFrame(
          (f) => (f.payload[0] === 0x14 && f.payload[1] === 0x08 ? true : null), 1000, `conferma pacchetto ${i + 1}`
        ).catch(() => false);
        await connection.writeRawBytes(packets[i]);
        acked = await ack;
      }
      if (!acked) throw new Error(`La pedaliera non ha confermato il pacchetto ${i + 1}/${packets.length}.`);
      onProgress(i + 1, packets.length);
    }
    // Let the pedal commit the preset before the next command
    await new Promise(r => setTimeout(r, 400));
  }

  /** Swap two user presets (1-50) on the pedal without losing any setting */
  async swapPresets(slotA, slotB, onProgress = () => {}) {
    if (slotA === slotB) return;
    if (![slotA, slotB].every(s => Number.isInteger(s) && s >= 1 && s <= 50)) {
      throw new Error('Si possono scambiare solo i preset utente (U01-U50).');
    }
    if (!connection.isConnected) throw new Error('Pedaliera non connessa.');

    const codeA = this.getSlotCode(slotA);
    const codeB = this.getSlotCode(slotB);
    this.rawTransferActive = true;
    let dataA = null;
    let dataB = null;
    let wroteA = false;
    try {
      onProgress(`Lettura ${codeA}...`, 0);
      dataA = await this.exportPresetRaw(slotA);
      onProgress(`Lettura ${codeB}...`, 10);
      dataB = await this.exportPresetRaw(slotB);

      // Keep a copy of both originals in case something goes wrong mid-way
      try {
        localStorage.setItem('sonicake_last_swap_backup', JSON.stringify({
          time: new Date().toISOString(), slotA, slotB,
          dataA: Array.from(dataA), dataB: Array.from(dataB)
        }));
      } catch (_) {}

      await this.importPresetRaw(slotA, dataB, (i, n) => onProgress(`Scrittura ${codeA}...`, 20 + Math.round((i / n) * 40)));
      wroteA = true;
      await this.importPresetRaw(slotB, dataA, (i, n) => onProgress(`Scrittura ${codeB}...`, 60 + Math.round((i / n) * 40)));
    } catch (err) {
      if (wroteA && dataA) {
        // Second write failed: put the original preset back into slot A
        try {
          await this.importPresetRaw(slotA, dataA);
          err.message += ` ${codeA} è stato ripristinato com'era.`;
        } catch (_) {
          err.message += ` Attenzione: ripristino di ${codeA} non riuscito (copia salvata nel browser).`;
        }
      }
      throw err;
    } finally {
      this.rawTransferActive = false;
    }

    // Swap local caches and refresh names from the pedal
    const cacheA = this.presetCache.get(slotA);
    const cacheB = this.presetCache.get(slotB);
    if (cacheB) this.presetCache.set(slotA, cacheB); else this.presetCache.delete(slotA);
    if (cacheA) this.presetCache.set(slotB, cacheA); else this.presetCache.delete(slotB);
    onProgress('Aggiornamento elenco...', 100);
    await this.syncPresetNames();
    if (this.currentSlot === slotA || this.currentSlot === slotB) {
      await this.selectPreset(this.currentSlot);
    }
    connection.log(`Preset ${codeA} e ${codeB} scambiati sulla pedaliera.`, 'success');
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
