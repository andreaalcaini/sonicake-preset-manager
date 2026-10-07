/**
 * Sonicake Smart Box & Pocket Master Hardware Protocol
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
 * Decode a 40-char hex string to a human-readable preset name
 */
export function decodeName(hexString) {
  let name = '';
  for (let i = 0; i < 10; i++) {
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

