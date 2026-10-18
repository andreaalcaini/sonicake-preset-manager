/**
 * Sonicake Pedaliera Hardware Protocol (all Sonicake multi-effects)
 * Implements SysEx packet parsing, parameter decoding/encoding,
 * EQ lookup tables, and SMBus PEC CRC8 calculations.
 */

import { COMMAND_LIBRARY_DATA } from '../data/command-library.js';
import { MODULE_LIBRARY_DATA } from '../data/module-library.js';
import { EQ_REVERSE_LOOKUP } from '../data/eq-lookup.js';

export const TERMINATOR_PACKET = '8080F0030601050104000200000000F7';
export const REQUEST_PRESET_NAMES_CMD = '8080F0000E00010000000201020400F7';
export const REQUEST_CURRENT_PRESET_NUM_CMD = '8080F0000700010000000201020403F7';
export const REQUEST_PRESET_STATE_CMD = '8080F0000900010000000201020401F7';
export const REQUEST_USER_IR_NAMES_CMD = '8080F0020900010000000201020200F7';
export const REQUEST_CLONE_AMP_NAMES_CMD = '8080F0030500010000000201020204F7';

export const MODULE_NAMES = {
  0: 'NR',
  1: 'FX1',
  2: 'DRV',
  3: 'AMP',
  4: 'IR',
  5: 'EQ',
  6: 'FX2',
  7: 'DLY',
  8: 'RVB',
  9: 'Clone'
};

/**
 * Pedal routing rule (matches SonicLink and the 720 = 6! entries of chainOrderCommands):
 * DRV-AMP-IR-EQ is a fixed block that never splits or reorders; only NR, FX1, FX2, DLY and RVB
 * move, and they hop over the whole block as a single unit.
 */
export const FIXED_CHAIN_BLOCK = [2, 3, 4, 5];

export function isFixedChainModule(modId) {
  return FIXED_CHAIN_BLOCK.includes(modId);
}

/** Order -> movable units, with the fixed block collapsed into the marker 'B' */
export function toChainUnits(order) {
  const units = [];
  for (const modId of order) {
    if (isFixedChainModule(modId)) {
      if (!units.includes('B')) units.push('B');
    } else {
      units.push(modId);
    }
  }
  return units;
}

export function fromChainUnits(units) {
  return units.flatMap(u => (u === 'B' ? FIXED_CHAIN_BLOCK : [u]));
}

/** Move a free module one unit earlier (dir = -1) or later (+1). Returns the new order or null. */
export function moveChainModule(order, modId, dir) {
  if (isFixedChainModule(modId)) return null;
  const units = toChainUnits(order);
  const idx = units.indexOf(modId);
  const target = idx + dir;
  if (idx < 0 || target < 0 || target >= units.length) return null;
  [units[idx], units[target]] = [units[target], units[idx]];
  return fromChainUnits(units);
}

export const CHARACTER_MAP = {
  "0000": null, "0200": " ", "0201": "!", "0203": "#", "0205": "%", "0206": "&", "0207": "'",
  "0208": "(", "0209": ")", "020A": "*", "020B": "+", "020C": ",", "020D": "-", "020E": ".", "020F": "/",
  "0300": "0", "0301": "1", "0302": "2", "0303": "3", "0304": "4", "0305": "5", "0306": "6",
  "0307": "7", "0308": "8", "0309": "9", "030A": ":", "030B": ";", "030C": "<", "030D": "=", "030E": ">",
  "0400": "@", "0401": "A", "0402": "B", "0403": "C", "0404": "D", "0405": "E", "0406": "F",
  "0407": "G", "0408": "H", "0409": "I", "040A": "J", "040B": "K", "040C": "L", "040D": "M",
  "040E": "N", "040F": "O", "0500": "P", "0501": "Q", "0502": "R", "0503": "S", "0504": "T",
  "0505": "U", "0506": "V", "0507": "W", "0508": "X", "0509": "Y", "050A": "Z", "050B": "[",
  "050C": "\\", "050D": "]", "050F": "_", "0601": "a", "0602": "b", "0603": "c", "0604": "d",
  "0605": "e", "0606": "f", "0607": "g", "0608": "h", "0609": "i", "060A": "j", "060B": "k",
  "060C": "l", "060D": "m", "060E": "n", "060F": "o", "0700": "p", "0701": "q", "0702": "r",
  "0703": "s", "0704": "t", "0705": "u", "0706": "v", "0707": "w", "0708": "x", "0709": "y",
  "070A": "z", "070B": "{", "070D": "}", "070E": "~"
};

// Reverse character map for name encoding
export const REVERSE_CHARACTER_MAP = {};
for (const [hex, char] of Object.entries(CHARACTER_MAP)) {
  if (char !== null) {
    REVERSE_CHARACTER_MAP[char] = hex;
  }
}

// Effect signature to name mapping
export const EFFECT_SIGNATURE_TO_NAME_MAP = {
  1: { // FX1
    offset: 19, length: 8,
    signatures: {
      '0000000000000000': 'COMP 1', '0001000000000000': 'COMP 2', '0001000000000001': 'AC G',
      '000F000000000001': 'Touch Wah', '0105000000000001': 'Auto Wah', '010A000000000000': 'Boost',
      '0000000000000004': 'A-Chorus', '0008000000000004': 'B-Chorus', '0101000000000004': 'Flanger',
      '0109000000000004': 'Phaser', '010F000000000004': 'Vibe', '0105000000000004': 'Vibrato',
      '0201000000000004': 'Tremolo', '0206000000000004': 'Sine Trem', '0208000000000004': 'Bias Trem'
    }
  },
  2: { // DRV
    offset: 27, length: 2,
    signatures: {
      '0000': 'Scream', '0400': 'Bass Drive', '0002': 'Butter OD', '020A': 'JP Dist',
      '0300': 'Shark', '020B': 'Dark Mouse', '0202': 'Grey Fuzz', '0204': 'Red Fuzz'
    }
  },
  3: { // AMP
    offset: 34, length: 3,
    signatures: {
      '030001': 'TWD Deluxe', '030003': 'B-Man N', '030004': 'Dark Twin', '030101': 'Voks 30N',
      '030104': 'Jazz 120', '03020A': 'Brit 45', '03020F': 'Brit 50JP', '030305': 'Brit 800',
      '030204': 'B-Man B', '030207': 'Voks 30TB', '030407': 'Sol 100 OD', '030605': 'Dizzy VH',
      '03050F': 'Eng 120', '03050A': 'Halen 51', '030509': 'Sol 100 LD', '030608': 'Calif DualV',
      '030609': 'Calif DualM', '030603': 'Eng Power', '03050D': 'Flyman B1+', '03060D': 'Bog XT',
      '030703': 'A BassVT', '030705': 'Voks Bass'
    }
  },
  4: { // IR
    offset: 42, length: 6,
    signatures: {
      '070001000000': 'TWD 1x8', '070002000000': 'TWD-P 1x10', '070004000000': 'Viblux 1x12',
      '070008000000': 'Voks 1x12', '07010B000000': 'TWD 2x12', '070102000000': 'Double 2x12',
      '070109000000': 'Star 2x12', '070101000000': 'Jazz 2x12', '070103000000': 'BritGN 2x12',
      '070202000000': 'BritGN 4x12', '070207000000': 'Bog 4x12', '07020E000000': 'Dizzy 4x12',
      '070200000000': 'Halen 4x12', '070208000000': 'Sol 4x12', '070204000000': 'Dual 4x12',
      '070000000001': 'User IR 1', '070001000001': 'User IR 2', '070002000001': 'User IR 3',
      '070003000001': 'User IR 4', '070004000001': 'User IR 5'
    }
  },
  5: { // EQ
    offset: 50, length: 3,
    signatures: { '0A0305': 'GT EQ 1', '0A0306': 'GT EQ 2', '0A030A': 'Bass EQ' }
  },
  6: { // FX2
    offset: 59, length: 8,
    signatures: {
      '0000000000000000': 'COMP 1', '0001000000000000': 'COMP 2', '000F000000000001': 'Touch Wah',
      '0105000000000001': 'Auto Wah', '010A000000000000': 'Boost', '0203000000000001': 'Pitch',
      '0201000000000001': 'Octave', '0209000000000001': 'Detune', '0000000000000004': 'A-Chorus',
      '0008000000000004': 'B-Chorus', '0101000000000004': 'Flanger', '0109000000000004': 'Phaser',
      '010F000000000004': 'Vibe', '0105000000000004': 'Vibrato', '0201000000000004': 'Tremolo',
      '0206000000000004': 'Sine Trem', '0208000000000004': 'Bias Trem'
    }
  },
  7: { // DLY
    offset: 67, length: 2,
    signatures: {
      '0000': 'Pure', '0005': 'Slap', '000D': 'Warm', '0002': 'Mag',
      '000B': 'Tube', '0103': 'Reverse', '0104': 'Analog', '0006': 'Sweep', '0004': 'Ping Pong'
    }
  },
  8: { // RVB
    offset: 75, length: 2,
    signatures: {
      '000B': 'Air', '0000': 'Room', '0001': 'Hall', '0002': 'Church',
      '0100': 'Plate 1', '000F': 'Plate 2', '0004': 'Spring', '0006': 'Light', '0007': 'Ocean', '0105': 'Dream'
    }
  },
  9: { // Clone Amp
    offset: 84, length: 1,
    signatures: {
      '00': 'User Profile 1', '01': 'User Profile 2', '02': 'User Profile 3',
      '03': 'User Profile 4', '04': 'User Profile 5'
    }
  }
};

export const ALGID_LOCATION_MAP = {
  '0_0': { p: 1, o: 101 },  // NR THRE
  '1_0': { p: 1, o: 165 }, '1_1': { p: 1, o: 173 }, '1_2': { p: 1, o: 181 },
  '1_3': { p: 1, o: 189 }, '1_4': { p: 1, o: 197 }, '1_5': { p: 1, o: 205 },
  '2_0': { p: 2, o: 29 }, '2_1': { p: 2, o: 37 }, '2_2': { p: 2, o: 45 },
  '2_3': { p: 2, o: 53 }, '2_4': { p: 2, o: 61 },
  '3_0': { p: 2, o: 93 }, '3_1': { p: 2, o: 101 }, '3_2': { p: 2, o: 109 },
  '3_3': { p: 2, o: 117 }, '3_4': { p: 2, o: 125 }, '3_5': { p: 2, o: 133 }, '3_6': { p: 2, o: 141 },
  '4_0': { p: 2, o: 157 },
  '5_0': { p: 3, o: 21 }, '5_1': { p: 3, o: 29 }, '5_2': { p: 3, o: 37 },
  '5_3': { p: 3, o: 45 }, '5_4': { p: 3, o: 53 }, '5_5': { p: 3, o: 61 },
  '6_0': { p: 3, o: 85 }, '6_1': { p: 3, o: 93 }, '6_2': { p: 3, o: 101 },
  '6_3': { p: 3, o: 109 }, '6_4': { p: 3, o: 117 },
  '7_0': { p: 3, o: 149 }, '7_1': { p: 3, o: 157 }, '7_2': { p: 3, o: 165 },
  '7_3': { p: 3, o: 173 }, '7_4': { p: 3, o: 181 },
  '8_0': { p: 4, o: 13 }, '8_1': { p: 4, o: 21 }, '8_2': { p: 4, o: 29 },
  '8_4': { p: 4, o: 45 }, '8_5': { p: 4, o: 53 },
  '9_0': { p: 4, o: 77 }, '9_1': { p: 4, o: 85 }, '9_2': { p: 4, o: 93 },
  '9_3': { p: 4, o: 101 }, '9_4': { p: 4, o: 109 }
};

/**
 * SMBus PEC CRC8 calculation for Sonicake save preset command
 * Polynomial: x^8 + x^2 + x^1 + 1 (0x07)
 */
export function calculateSMBusPEC(hexString) {
  const bytes = hexString.match(/[0-9a-fA-F]{2}/g).map(byte => parseInt(byte, 16));
  let crc = 0;
  const polynomial = 0x07;

  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc <<= 1;
      }
      crc &= 0xFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Build dynamic signature-to-fxId lookup maps
 */
export function buildSignatureToFxIdMaps() {
  const nameToFxId = {};
  for (const fxId in MODULE_LIBRARY_DATA.effectLibrary) {
    nameToFxId[MODULE_LIBRARY_DATA.effectLibrary[fxId].name.trim()] = parseInt(fxId, 10);
  }

  const signatureToFxIdMaps = {};
  for (const moduleId in EFFECT_SIGNATURE_TO_NAME_MAP) {
    signatureToFxIdMaps[moduleId] = {};
    const moduleMap = EFFECT_SIGNATURE_TO_NAME_MAP[moduleId];

    for (const signature in moduleMap.signatures) {
      const fxName = moduleMap.signatures[signature].trim();
      const fxId = nameToFxId[fxName];
      if (fxId !== undefined) {
        signatureToFxIdMaps[moduleId][signature] = fxId;
      }
    }
  }
  return signatureToFxIdMaps;
}

/**
 * Decode preset name block (20 bytes / 40 hex chars)
 */
export function decodeNameBlock(hexString) {
  if (hexString.length !== 40) return null;
  let name = '';
  for (let i = 0; i < 10; i++) {
    const chunk = hexString.substring(i * 4, i * 4 + 4).toUpperCase();
    const char = CHARACTER_MAP[chunk];
    if (char === null) break;
    if (char !== undefined) {
      name += char;
    }
  }
  return name.trim();
}

/**
 * Encode string (up to 10 chars) into 40-character hex block for saving to pedal
 */
export function encodeNameForSave(name) {
  const cleanName = (name || '').slice(0, 10);
  let hex = '';
  for (let i = 0; i < cleanName.length; i++) {
    const char = cleanName[i];
    const encodedChar = REVERSE_CHARACTER_MAP[char] || '0200'; // Default to space if unknown
    hex += encodedChar;
  }
  while (hex.length < 40) {
    hex += '0000'; // Pad with null
  }
  return hex;
}

/**
 * Build SysEx Save Preset Command
 * @param {number} slotNumber Slot 1 to 50
 * @param {string} presetName Name up to 10 characters
 */
export function buildSavePresetCommand(slotNumber, presetName) {
  if (slotNumber < 1 || slotNumber > 50) {
    throw new Error('Invalid slot number. Must be between 1 and 50.');
  }

  const presetValue = slotNumber - 1;
  const presetValueHex = presetValue.toString(16).padStart(2, '0');
  const upperNibble = presetValueHex[0];
  const lowerNibble = presetValueHex[1];
  const presetBytesHex = `0${upperNibble}0${lowerNibble}`;

  const encodedNameHex = encodeNameForSave(presetName);
  const payloadTemplate = "0001000001030101040a{PRESET_BYTES}000000000000{ENCODED_NAME}000000000000";
  let finalPayload = payloadTemplate
    .replace('{ENCODED_NAME}', encodedNameHex)
    .replace('{PRESET_BYTES}', presetBytesHex);

  const inputHex = finalPayload.replace(/0(.)/g, '$1');
  const crc8 = calculateSMBusPEC(inputHex);
  const expandedCRC = crc8.split('').map(n => '0' + n).join('');

  return '8080f0' + expandedCRC + finalPayload + 'f7';
}

/**
 * Decode module bypass states, order, amp mode, and volume from packet 1
 */
export function decodePresetStateAndOrder(hexString) {
  const bytes = hexString.match(/.{1,2}/g);
  if (!bytes) throw new Error('Invalid hex string');

  const payload = bytes.slice(5, -1);
  const payloadString = payload.join('');

  // Preset volume
  let presetVolume = 75;
  try {
    const volumeMarker = "01020000040000";
    const markerIndex = payloadString.indexOf(volumeMarker);
    if (markerIndex !== -1) {
      const tensIndex = (markerIndex + volumeMarker.length) / 2;
      const onesIndex = tensIndex + 1;
      const tens = payload[tensIndex];
      const ones = payload[onesIndex];
      presetVolume = parseInt(parseInt(tens, 16).toString(16) + parseInt(ones, 16).toString(16), 16);
    }
  } catch (e) {
    presetVolume = 75;
  }

  const chainMarker = "0A000000";
  const chainStartIndex = payloadString.lastIndexOf(chainMarker);
  if (chainStartIndex === -1) {
    return { presetVolume, states: {}, order: [0, 1, 2, 3, 4, 5, 6, 7, 8], ampMode: 'factory' };
  }

  const chainByteIndex = chainStartIndex / 2;
  const globalStateByteIndex = chainByteIndex - 10;
  const nibble1Index = chainByteIndex - 13;
  const nibble2Index = chainByteIndex - 12;

  const nibble1 = payload[nibble1Index] || '00';
  const nibble2 = payload[nibble2Index] || '00';
  const globalStateByte = parseInt(payload[globalStateByteIndex] || '00', 16);

  const isCloneMode = (globalStateByte & 2) !== 0;
  const isRvbOn = (globalStateByte & 1) !== 0;

  const mainBitmask = parseInt(nibble1[1] + nibble2[1], 16);
  const moduleStates = {};
  for (let i = 0; i < 9; i++) {
    const isOn = (i === 8) ? isRvbOn : (mainBitmask & (1 << i)) !== 0;
    moduleStates[i] = (isCloneMode && i === 4) ? true : isOn;
  }

  const chainDataStartIndex = chainByteIndex + (chainMarker.length / 2);
  const chainData = payload.slice(chainDataStartIndex);
  const chainIds = [];
  const uniqueIds = new Set();
  let nrFound = false;

  for (let i = 0; i < chainData.length - 1; i++) {
    if (chainIds.length >= 9) break;
    const id = parseInt(chainData[i], 16);
    if (MODULE_NAMES[id] !== undefined && chainData[i + 1] === '00' && !uniqueIds.has(id)) {
      chainIds.push(id);
      uniqueIds.add(id);
      if (id === 0) nrFound = true;
      i++;
    }
  }

  if (!nrFound && chainIds.length < 9) {
    chainIds.unshift(0);
  }

  // Ensure all 9 modules exist in order
  for (let i = 0; i < 9; i++) {
    if (!uniqueIds.has(i)) {
      chainIds.push(i);
    }
  }

  return {
    presetVolume,
    states: moduleStates,
    order: chainIds,
    ampMode: isCloneMode ? 'clone' : 'factory'
  };
}

/**
 * Decode selected effect models from packet 2
 */
export function decodeSelectedEffects(hexString, signatureToFxIdMaps) {
  const bytes = hexString.match(/.{1,2}/g);
  if (!bytes) return { selectedEffects: {} };

  const selectedEffects = { 0: 27 }; // NR always has Gate (ID 27)
  for (const moduleIdStr in EFFECT_SIGNATURE_TO_NAME_MAP) {
    const moduleId = parseInt(moduleIdStr, 10);
    const { offset, length } = EFFECT_SIGNATURE_TO_NAME_MAP[moduleId];

    if (bytes.length >= offset + length) {
      const signature = bytes.slice(offset, offset + length).join('').toUpperCase();
      const fxId = signatureToFxIdMaps[moduleId]?.[signature];
      if (fxId !== undefined) {
        selectedEffects[moduleId] = fxId;
      }
    }
  }
  return { selectedEffects };
}

/**
 * Decode a 6-byte parameter hex code using EQ_REVERSE_LOOKUP
 */
export function decodeParameterValue(hexCode) {
  const value = EQ_REVERSE_LOOKUP[hexCode.toUpperCase()];
  return value !== undefined ? value : null;
}

/**
 * Decode all parameter values from dump packets (packets 1 to 5)
 */
export function decodeParameterValues(dumpPackets, selectedEffects) {
  const decodedParams = {};
  const activeEffects = { ...selectedEffects, 0: 1 }; // NR module always has Gate (ID 1)

  for (const moduleIdStr in activeEffects) {
    const moduleId = parseInt(moduleIdStr, 10);
    const fxId = activeEffects[moduleId];
    const effectDef = MODULE_LIBRARY_DATA.effectLibrary[fxId];

    if (!effectDef || !effectDef.alg) continue;

    decodedParams[moduleId] = {};

    effectDef.alg.forEach(param => {
      const algId = param.algId;
      const mapKey = `${moduleId}_${algId}`;
      const location = ALGID_LOCATION_MAP[mapKey];

      if (location) {
        const packet = dumpPackets[location.p];
        const bytes = packet ? packet.match(/.{1,2}/g) : null;

        if (bytes && bytes.length >= location.o + 6) {
          const hexBlock = bytes.slice(location.o, location.o + 6).join('').toUpperCase();
          const finalValue = decodeParameterValue(hexBlock);

          if (finalValue !== null) {
            decodedParams[moduleId][algId] = finalValue;
          }
        }
      }
    });
  }
  return decodedParams;
}

/**
 * Check if a 40-character hex string is a valid preset name block
 */
export function isValidNameBlock(hexString) {
  if (hexString.length !== 40) return false;
  let hasFoundPadding = false;
  let hasFoundValidChar = false;

  for (let i = 0; i < 10; i++) {
    const chunk = hexString.substring(i * 4, (i * 4) + 4).toUpperCase();
    if (hasFoundPadding) {
      if (chunk !== '0000') return false;
    } else {
      const char = CHARACTER_MAP[chunk];
      if (char === undefined) return false;
      if (char === null) {
        hasFoundPadding = true;
      } else {
        hasFoundValidChar = true;
      }
    }
  }
  return hasFoundValidChar;
}

/**
 * Decode a nibble-encoded hex string (4 hex chars per character) to a human-readable name.
 * Preset names use 10 characters; Clone AMP / User IR slot names use 16.
 */
export function decodeName(hexString, maxChars = 10) {
  let name = '';
  for (let i = 0; i < maxChars; i++) {
    const chunk = hexString.substring(i * 4, (i * 4) + 4).toUpperCase();
    const char = CHARACTER_MAP[chunk];
    if (char === null) break;
    if (char !== undefined) {
      name += char;
    }
  }
  return name.trim();
}

/**
 * Parse a full SysEx packet hex string and extract all valid preset names found inside
 */
export function parsePacketForNames(packetHex) {
  if (!packetHex) return [];
  let cleanPayload = packetHex;
  // If packet includes SysEx framing (8080F0 ... F7 or F0 ... F7), strip it to ensure 2-byte character alignment
  if (cleanPayload.startsWith('8080F0') && cleanPayload.endsWith('F7')) {
    cleanPayload = cleanPayload.slice(6, -2);
  } else if (cleanPayload.startsWith('F0') && cleanPayload.endsWith('F7')) {
    cleanPayload = cleanPayload.slice(2, -2);
  }

  const foundNames = [];
  const NAME_HEX_LENGTH = 40; // 20 bytes (10 characters, each character is 4 hex chars / 2 bytes)

  let offset = 0;
  while ((offset + NAME_HEX_LENGTH) <= cleanPayload.length) {
    const windowHex = cleanPayload.substring(offset, offset + NAME_HEX_LENGTH);
    if (isValidNameBlock(windowHex)) {
      const decoded = decodeName(windowHex);
      if (decoded && decoded.trim().length > 0) {
        foundNames.push(decoded.trim());
      }
      offset += NAME_HEX_LENGTH;
    } else {
      offset += 4; // Move by 2 bytes (one character code)
    }
  }
  return foundNames;
}

/**
 * Calculate SMBus PEC CRC8 over byte array
 * Polynomial: x^8 + x^2 + x^1 + 1 (0x07)
 * @param {Uint8Array} dataBytes
 * @returns {number} 8-bit CRC value
 */
export function calculateCRC8(dataBytes) {
  let crc = 0;
  const poly = 0x07;
  for (let i = 0; i < dataBytes.length; i++) {
    crc ^= dataBytes[i];
    for (let b = 0; b < 8; b++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ poly) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }
  return crc;
}

/**
 * Build streaming SysEx packets for flashing binary data directly into pedalboard Flash memory
 * Verified 100% byte-for-byte identical against Sonicake Manager hardware stream.
 * @param {Uint8Array} binaryData Raw binary payload (e.g. 2122 bytes for IR, 2696 bytes for Clone)
 * @returns {Array<Uint8Array>} Array of SysEx packet byte arrays ready to send to MIDI out
 */
export function buildStreamingFlashPackets(binaryData) {
  const CHUNK_SIZE = 19; // 19 bytes per packet
  const totalPackets = Math.ceil(binaryData.length / CHUNK_SIZE);
  const packets = [];

  for (let i = 0; i < totalPackets; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, binaryData.length);
    const chunkBytes = binaryData.slice(start, end);
    const chunkLength = chunkBytes.length;

    // CRC8 calculated over unexpanded header + chunk: [totalPackets, packetIndex, chunkLength, ...chunkBytes]
    const unexpanded = new Uint8Array(3 + chunkLength);
    unexpanded[0] = totalPackets;
    unexpanded[1] = i;
    unexpanded[2] = chunkLength;
    unexpanded.set(chunkBytes, 3);

    const crc = calculateCRC8(unexpanded);

    // Packet structure:
    // F0 [crc_hi, crc_lo] [total_hi, total_lo] [idx_hi, idx_lo] [len_hi, len_lo] [payload_nibbles...] F7
    const packet = new Uint8Array(10 + chunkLength * 2);
    packet[0] = 0xF0;
    packet[1] = (crc >> 4) & 0x0F;
    packet[2] = crc & 0x0F;
    packet[3] = (totalPackets >> 4) & 0x0F;
    packet[4] = totalPackets & 0x0F;
    packet[5] = (i >> 4) & 0x0F;
    packet[6] = i & 0x0F;
    packet[7] = (chunkLength >> 4) & 0x0F;
    packet[8] = chunkLength & 0x0F;

    for (let j = 0; j < chunkLength; j++) {
      const b = chunkBytes[j];
      packet[9 + j * 2] = (b >> 4) & 0x0F;
      packet[9 + j * 2 + 1] = b & 0x0F;
    }

    packet[packet.length - 1] = 0xF7;
    packets.push(packet);
  }

  return packets;
}

/**
 * Build 2122-byte User IR payload with 74-byte header and 2048-byte normalized audio samples
 * @param {number|string} slotIndexOrName Slot index 0 to 4 (or name string for backward compatibility)
 * @param {string|Float32Array|Uint8Array} [nameOrData] Slot name (up to 14 chars) or sample data
 * @param {Float32Array|Uint8Array} [maybeData] Raw samples or 2048 sample bytes
 * @returns {Uint8Array} 2122-byte binary payload ready for buildStreamingFlashPackets
 */
export function buildIRPayload(slotIndexOrName, nameOrData, maybeData) {
  let slotIndex = 0;
  let name = 'User IR';
  let sampleData = null;

  if (typeof slotIndexOrName === 'number') {
    slotIndex = Math.max(0, Math.min(4, slotIndexOrName));
    name = typeof nameOrData === 'string' ? nameOrData : 'User IR';
    sampleData = maybeData;
  } else {
    name = typeof slotIndexOrName === 'string' ? slotIndexOrName : 'User IR';
    sampleData = nameOrData;
  }

  const payload = new Uint8Array(2122);
  
  // Header: 74 bytes (Sonicake Cabinet IR specification - verified against hardware capture)
  // Byte 0: 0x11 (Flash Write Prefix)
  // Byte 1: 0x21 (User IR Type Identifier)
  payload[0] = 0x11;
  payload[1] = 0x21;
  payload[2] = 0x00;
  payload[3] = 0x00;
  payload[4] = 0x00;
  payload[5] = 0x00;
  // Byte 6: 0-based Slot Index (0 = Slot 1, 1 = Slot 2, ..., 4 = Slot 5)
  payload[6] = slotIndex;
  payload[7] = 0x00;
  payload[8] = 0x10;
  payload[9] = 0x0A; // length marker

  // Name (32 bytes max, ascii null-padded)
  const cleanName = (name || 'User IR').slice(0, 14);
  for (let i = 0; i < cleanName.length; i++) {
    payload[10 + i] = cleanName.charCodeAt(i) & 0xFF;
  }

  // Sample data: 2048 bytes (from offset 74 to 2122)
  if (sampleData instanceof Uint8Array && sampleData.length === 2048) {
    payload.set(sampleData, 74);
  } else if (sampleData instanceof Float32Array) {
    // 512 float32 samples -> 2048 bytes
    const view = new DataView(payload.buffer, payload.byteOffset + 74, 2048);
    const count = Math.min(512, sampleData.length);
    for (let i = 0; i < count; i++) {
      view.setFloat32(i * 4, sampleData[i], true); // Little endian
    }
  }

  return payload;
}

// --- Sonicake CRC16 & Clone AMP Hardware Support ---

export const SONICAKE_CRC16_TABLE1 = new Uint8Array([
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
  0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
]);

export const SONICAKE_CRC16_TABLE2 = new Uint8Array([
  0x00, 0xC0, 0xC1, 0x01, 0xC3, 0x03, 0x02, 0xC2, 0xC6, 0x06, 0x07, 0xC7, 0x05, 0xC5, 0xC4, 0x04,
  0xCC, 0x0C, 0x0D, 0xCD, 0x0F, 0xCF, 0xCE, 0x0E, 0x0A, 0xCA, 0xCB, 0x0B, 0xC9, 0x09, 0x08, 0xC8,
  0xD8, 0x18, 0x19, 0xD9, 0x1B, 0xDB, 0xDA, 0x1A, 0x1E, 0xDE, 0xDF, 0x1F, 0xDD, 0x1D, 0x1C, 0xDC,
  0x14, 0xD4, 0xD5, 0x15, 0xD7, 0x17, 0x16, 0xD6, 0xD2, 0x12, 0x13, 0xD3, 0x11, 0xD1, 0xD0, 0x10,
  0xF0, 0x30, 0x31, 0xF1, 0x33, 0xF3, 0xF2, 0x32, 0x36, 0xF6, 0xF7, 0x37, 0xF5, 0x35, 0x34, 0xF4,
  0x3C, 0xFC, 0xFD, 0x3D, 0xFF, 0x3F, 0x3E, 0xFE, 0xFA, 0x3A, 0x3B, 0xFB, 0x39, 0xF9, 0xF8, 0x38,
  0x28, 0xE8, 0xE9, 0x29, 0xEB, 0x2B, 0x2A, 0xEA, 0xEE, 0x2E, 0x2F, 0xEF, 0x2D, 0xED, 0xEC, 0x2C,
  0xE4, 0x24, 0x25, 0xE5, 0x27, 0xE7, 0xE6, 0x26, 0x22, 0xE2, 0xE3, 0x23, 0xE1, 0x21, 0x20, 0xE0,
  0xA0, 0x60, 0x61, 0xA1, 0x63, 0xA3, 0xA2, 0x62, 0x66, 0xA6, 0xA7, 0x67, 0xA5, 0x65, 0x64, 0xA4,
  0x6C, 0xAC, 0xAD, 0x6D, 0xAF, 0x6F, 0x6E, 0xAE, 0xAA, 0x6A, 0x6B, 0xAB, 0x69, 0xA9, 0xA8, 0x68,
  0x78, 0xB8, 0xB9, 0x79, 0xBB, 0x7B, 0x7A, 0xBA, 0xBE, 0x7E, 0x7F, 0xBF, 0x7D, 0xBD, 0xBC, 0x7C,
  0xB4, 0x74, 0x75, 0xB5, 0x77, 0xB7, 0xB6, 0x76, 0x72, 0xB2, 0xB3, 0x73, 0xB1, 0x71, 0x70, 0xB0,
  0x50, 0x90, 0x91, 0x51, 0x93, 0x53, 0x52, 0x92, 0x96, 0x56, 0x57, 0x97, 0x55, 0x95, 0x94, 0x54,
  0x9C, 0x5C, 0x5D, 0x9D, 0x5F, 0x9F, 0x9E, 0x5E, 0x5A, 0x9A, 0x9B, 0x5B, 0x99, 0x59, 0x58, 0x98,
  0x88, 0x48, 0x49, 0x89, 0x4B, 0x8B, 0x8A, 0x4A, 0x4E, 0x8E, 0x8F, 0x4F, 0x8D, 0x4D, 0x4C, 0x8C,
  0x44, 0x84, 0x85, 0x45, 0x87, 0x47, 0x46, 0x86, 0x82, 0x42, 0x43, 0x83, 0x41, 0x81, 0x80, 0x40,
]);

/**
 * Sonicake CRC16 calculation (used for CLO neural network model headers)
 * Uses SMBus/Modbus-style high and low lookup tables, starting at byte 12 of the model.
 * Verified 100% byte-for-byte against official Sonicake Manager DLL and live hardware dumps.
 * @param {Uint8Array} dataBytes Slice from offset 12 to end of model data
 * @returns {number} 16-bit CRC value
 */
export function calculateSonicakeCRC16(dataBytes) {
  let cl = 0xFF;
  let r10 = 0xFF;
  for (let i = 0; i < dataBytes.length; i++) {
    const edx = dataBytes[i] ^ cl;
    cl = SONICAKE_CRC16_TABLE1[edx] ^ r10;
    r10 = SONICAKE_CRC16_TABLE2[edx];
  }
  return ((cl << 8) | r10) & 0xFFFF;
}

/**
 * Convert a standard 8,840-byte CLO neural model into a 2,696-byte Low Model accepted by the pedal hardware
 * Sets total length to 2696, extendSize to 2560, layer size to 512, copies first 2560 bytes of weights,
 * and calculates exact CRC16.
 * @param {Uint8Array} cloBytes 8840-byte or 2696-byte CLO data
 * @returns {Uint8Array} 2,696-byte Low Model binary
 */
export function convertCLOToLowModel(cloBytes) {
  if (cloBytes.length === 2696) {
    return cloBytes; // Already a low model
  }
  if (cloBytes.length !== 8840) {
    throw new Error(`Dimensione file CLO non valida (${cloBytes.length} byte). Attesi 8840 o 2696 byte.`);
  }

  const low = new Uint8Array(2696);
  low.set(cloBytes.subarray(0, 2696));

  // Magic 'VTSI' (0x56, 0x54, 0x53, 0x49)
  // Total size: 2696 (0x0A88)
  low[4] = 0x88; low[5] = 0x0A; low[6] = 0x00; low[7] = 0x00;

  // extendSize: 2560 (0x0A00)
  low[0x14] = 0x00; low[0x15] = 0x0A; low[0x16] = 0x00; low[0x17] = 0x00;

  // Layer size at offset 0x84: 512 (0x0200) instead of 2048 (0x0800)
  low[0x84] = 0x00; low[0x85] = 0x02; low[0x86] = 0x00; low[0x87] = 0x00;

  // Clear CRC bytes before calculating
  low[8] = 0x00; low[9] = 0x00;
  low[10] = 0x00; low[11] = 0x00;

  // Calculate CRC16 on data starting at offset 12
  const crc = calculateSonicakeCRC16(low.subarray(12));
  low[8] = crc & 0xFF;
  low[9] = (crc >> 8) & 0xFF;

  return low;
}

/**
 * Build 2,770-byte Clone AMP hardware payload for the pedal persistent Flash memory
 * Verified 100% byte-for-byte against Sonicake Manager hardware stream.
 * @param {number} slotIndex 0 to 4 (representing Clone AMP 1 to 5)
 * @param {string} name Slot name (up to 14 chars)
 * @param {Uint8Array} binaryData 8,840-byte CLO, 2,696-byte Low Model, or 2,770-byte payload
 * @returns {Uint8Array} 2,770-byte binary payload ready for buildStreamingFlashPackets
 */
export function buildClonePayload(slotIndex, name, binaryData) {
  const safeSlot = Math.max(0, Math.min(4, slotIndex));
  const cleanName = (name || `Clone ${safeSlot + 1}`).trim().slice(0, 14);

  // If already a complete 2,770-byte payload with 74-byte header
  if (binaryData.length === 2770 && binaryData[0] === 0x11) {
    const payload = new Uint8Array(binaryData);
    payload[1] = 0x25;
    payload[6] = safeSlot;
    // update name if provided
    for (let i = 0; i < 32; i++) payload[10 + i] = 0;
    for (let i = 0; i < cleanName.length; i++) {
      payload[10 + i] = cleanName.charCodeAt(i) & 0xFF;
    }
    return payload;
  }

  // Ensure we have a 2,696-byte Low Model
  let lowModel;
  if (binaryData.length === 8840) {
    lowModel = convertCLOToLowModel(binaryData);
  } else if (binaryData.length === 2696) {
    lowModel = binaryData;
  } else {
    throw new Error(`Dimensione binario Clone non supportata (${binaryData.length} byte). Attesi 2696, 8840 o 2770 byte.`);
  }

  const payload = new Uint8Array(2770);

  // 74-byte Clone AMP Header (Verified 100% byte-for-byte against official Sonicake Manager capture)
  // Byte 0: 0x11 (Flash Write Prefix)
  // Byte 1: 0x25 (Clone AMP Type Identifier - NOT 0x21 which is IR!)
  payload[0] = 0x11;
  payload[1] = 0x25;
  // Bytes 2-5: 0x00 (padding)
  payload[2] = 0x00;
  payload[3] = 0x00;
  payload[4] = 0x00;
  payload[5] = 0x00;
  // Byte 6: 0-based Slot Index (0 = Slot 1, 1 = Slot 2, ..., 4 = Slot 5)
  payload[6] = safeSlot;
  // Byte 7: 0x00
  payload[7] = 0x00;
  // Byte 8: 0x00 (Clone AMP marker)
  payload[8] = 0x00;
  // Byte 9: 0x0F (Clone AMP marker)
  payload[9] = 0x0F;

  // Name (32 bytes max, ascii null-padded)
  for (let i = 0; i < cleanName.length; i++) {
    payload[10 + i] = cleanName.charCodeAt(i) & 0xFF;
  }

  // Low Model binary: 2,696 bytes (from offset 74 to 2770)
  payload.set(lowModel, 74);

  return payload;
}

/**
 * Mapping table from native hardware 32-bit FXID (from qme20_module_data.json) to internal effect IDs
 */
export const HARDWARE_FXID_TO_INTERNAL_ID = {
  // NR
  27: 1, // Gate
  // FX1
  0: 101, // COMP 1
  1: 102, // COMP 2
  16777231: 103, // Touch Wah
  16777237: 104, // Auto Wah
  83886088: 105, // C-Wah
  26: 106, // Boost
  67108864: 107, // A-Chorus
  67108872: 108, // B-Chorus
  67108881: 109, // Flanger
  67108889: 110, // Phaser
  67108895: 111, // Vibe
  67108885: 112, // Vibrato
  67108897: 113, // Tremolo
  67108902: 114, // Sine Trem
  67108904: 115, // Bias Trem
  // DRV
  50331648: 201, // Scream
  50331650: 202, // Butter OD
  50331690: 203, // JP Dist
  50331696: 204, // Shark
  50331691: 205, // Dark Mouse
  50331682: 206, // Grey Fuzz
  50331684: 207, // Red Fuzz
  50331712: 208, // Bass Drive
  // AMP
  117440513: 301, // TWD Deluxe
  117440515: 302, // B-Man N
  117440516: 303, // Dark Twin
  117440529: 304, // Voks 30N
  117440532: 305, // Jazz 120
  117440554: 306, // Brit 45
  117440559: 307, // Brit 50JP
  117440565: 308, // Brit 800
  117440548: 309, // B-Man B
  117440551: 310, // Voks 30TB
  117440583: 311, // Sol 100 OD
  117440613: 312, // Dizzy VH
  117440607: 313, // Eng 120
  117440602: 314, // Halen 51
  117440601: 315, // Sol 100 LD
  117440616: 316, // Calif DualV
  117440617: 317, // Calif DualM
  117440611: 318, // Eng Power
  117440605: 319, // Flyman B1+
  117440621: 320, // Bog XT (Vintage)
  117440622: 320, // Bog XT (Modern)
  117440627: 321, // A BassVT
  117440629: 322, // Voks Bass
  // IR
  167772161: 401, // TWD 1x8
  167772164: 402, // Viblux 1x12
  167772168: 403, // Voks 1x12
  167772187: 404, // TWD 2x12
  167772178: 405, // Double 2x12
  167772185: 406, // Star 2x12
  167772177: 407, // Jazz 2x12
  167772179: 408, // BritGN 2x12
  167772194: 409, // BritGN 4x12
  167772199: 410, // Bog 4x12
  167772206: 411, // Dizzy 4x12
  167772192: 412, // Halen 4x12
  167772200: 413, // Sol 4x12
  167772196: 414, // Dual 4x12
  167772190: 415, // Bass 4x10
  // User IR (1 to 5)
  168820736: 416,
  168820737: 417,
  168820738: 418,
  168820739: 419,
  168820740: 420,
  // EQ
  16777269: 501, // GT EQ 1
  16777270: 502, // GT EQ 2
  16777274: 503, // Bass EQ
  // FX2
  16777249: 606, // Octave
  16777251: 607, // Pitch
  16777257: 608, // Detune
  // DLY
  184549376: 701, // Pure
  184549381: 702, // Slap
  184549389: 703, // Warm
  184549378: 704, // Mag
  184549387: 705, // Tube
  184549395: 706, // Reverse
  184549377: 707, // Analog
  184549382: 708, // Sweep
  184549380: 709, // Ping Pong
  184549384: 701, // DLY fallback
  // RVB
  201326603: 801, // Air
  201326592: 802, // Room
  201326593: 803, // Hall
  201326594: 804, // Church
  201326608: 805, // Plate 1
  201326607: 806, // Plate 2
  201326596: 807, // Spring
  201326598: 808, // Light
  201326599: 809, // Ocean
  201326613: 810, // Dream
  // Clone Profiles (Slot 1 to 5)
  251658240: 901,
  251658241: 902,
  251658242: 903,
  251658243: 904,
  251658244: 905
};

/**
 * Decode native hardware 476-byte preset dump returned by the pedal
 * @param {string|Uint8Array} payloadBytesOrHex
 * @returns {object} Decoded preset structure (states, order, ampMode, selectedEffects)
 */
export function decodeNativeHardwareDump(payloadBytesOrHex) {
  let bytes = payloadBytesOrHex;
  if (typeof payloadBytesOrHex === 'string') {
    const clean = payloadBytesOrHex.replace(/\s+/g, '');
    bytes = new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
  }

  // Strip 8080 prefix if present
  if (bytes[0] === 0x80 && bytes[1] === 0x80) bytes = bytes.slice(2);

  // If SysEx-framed (starts with F0), unpack nibbles from offset 9 to end-1
  if (bytes[0] === 0xF0) {
    const nibbles = bytes.slice(9, -1);
    const unpacked = new Uint8Array(Math.floor(nibbles.length / 2));
    for (let i = 0; i < unpacked.length; i++) {
      unpacked[i] = ((nibbles[i * 2] & 0x0F) << 4) | (nibbles[i * 2 + 1] & 0x0F);
    }
    bytes = unpacked;
  }

  if (bytes.length < 140) {
    throw new Error(`Buffer dump preset troppo corto (${bytes.length} byte).`);
  }

  // 1. Module bypass mask at offset 0x4E (uint16)
  const mask = bytes[0x4E] | (bytes[0x4F] << 8);
  const states = {};
  for (let i = 0; i < 9; i++) {
    states[i] = Boolean(mask & (1 << i));
  }

  // 2. Chain order at offset 0x56 (10 bytes)
  const order = [];
  for (let i = 0; i < 9; i++) {
    const modId = bytes[0x56 + i];
    order.push(modId < 9 ? modId : i);
  }

  // 3. Amp Mode (factory vs clone)
  const isCloneActive = (bytes[0x56 + 3] === 9) || Boolean(mask & (1 << 9));
  const ampMode = isCloneActive ? 'clone' : 'factory';

  // 4. Selected Effects at offset 100 (0x64), 10 x uint32 little endian
  const selectedEffects = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let mod = 0; mod < 10; mod++) {
    const rawFxId = view.getUint32(100 + mod * 4, true);
    const internalId = HARDWARE_FXID_TO_INTERNAL_ID[rawFxId];
    if (internalId !== undefined) {
      selectedEffects[mod] = internalId;
    } else {
      const defaults = [1, 101, 201, 301, 401, 501, 601, 701, 801, 901];
      selectedEffects[mod] = defaults[mod];
    }
  }

  return {
    states,
    order,
    ampMode,
    selectedEffects
  };
}

/**
 * Decode native hardware 50-preset names dump (20-byte stride)
 * @param {string|Uint8Array} payloadBytesOrHex
 * @returns {Array<string>} Array of up to 50 preset name strings
 */
export function decodeNativePresetNames(payloadBytesOrHex) {
  let bytes = payloadBytesOrHex;
  if (typeof payloadBytesOrHex === 'string') {
    const clean = payloadBytesOrHex.replace(/\s+/g, '');
    bytes = new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
  }

  if (bytes[0] === 0x80 && bytes[1] === 0x80) bytes = bytes.slice(2);

  if (bytes[0] === 0xF0) {
    const nibbles = bytes.slice(9, -1);
    const unpacked = new Uint8Array(Math.floor(nibbles.length / 2));
    for (let i = 0; i < unpacked.length; i++) {
      unpacked[i] = ((nibbles[i * 2] & 0x0F) << 4) | (nibbles[i * 2 + 1] & 0x0F);
    }
    bytes = unpacked;
  }

  const names = [];
  const maxSlots = Math.min(50, Math.floor((bytes.length - 2) / 20));

  for (let i = 0; i < maxSlots; i++) {
    const start = 2 + i * 20;
    let name = '';
    for (let j = 0; j < 16; j++) {
      const b = bytes[start + 4 + j];
      if (b === 0) break;
      if (b >= 32 && b <= 126) name += String.fromCharCode(b);
    }
    names.push(name.trim() || `User ${i + 1}`);
  }

  return names;
}



