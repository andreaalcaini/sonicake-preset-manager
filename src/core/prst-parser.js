/**
 * Sonicake .prst Binary Preset Parser & Serializer
 * Supports native 527-byte .prst files used by Sonicake Manager and Smart Box hardware.
 */

export class PrstParser {
  /**
   * Parse a native binary .prst file (ArrayBuffer or Uint8Array)
   */
  static parse(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 50) {
      throw new Error('Invalid .prst file: file too short');
    }

    // Header check (should be "Smart Box" or "Pocket Master")
    const headerBytes = bytes.slice(0, 16);
    let header = '';
    for (let i = 0; i < 16; i++) {
      if (headerBytes[i] === 0) break;
      header += String.fromCharCode(headerBytes[i]);
    }

    // Name at offset 0x19 (25)
    let name = '';
    for (let i = 25; i < 35; i++) {
      if (bytes[i] === 0) break;
      name += String.fromCharCode(bytes[i]);
    }
    name = name.trim() || 'Imported';

    // Module chain order at offset 0x7E (10 bytes)
    const order = [];
    if (bytes.length >= 0x88) {
      for (let i = 0; i < 9; i++) {
        order.push(bytes[0x7E + i]);
      }
    } else {
      order.push(0, 1, 2, 3, 4, 5, 6, 7, 8);
    }

    return {
      type: 'native_prst',
      header: header || 'Smart Box',
      name,
      order,
      rawBytes: Array.from(bytes),
      fileSize: bytes.length
    };
  }

  /**
   * Export preset as native binary .prst (527 bytes)
   */
  static serialize(preset) {
    const buffer = new Uint8Array(527);
    
    // Write header "Smart Box\0"
    const headerStr = "Smart Box";
    for (let i = 0; i < headerStr.length; i++) {
      buffer[i] = headerStr.charCodeAt(i);
    }

    // Default metadata markers
    buffer[0x14] = 0xB0;
    buffer[0x15] = 0xFF;
    buffer[0x16] = 0xFF;
    buffer[0x17] = 0xFF;
    buffer[0x18] = 0xFF;

    // Write name at offset 25
    const nameStr = (preset.name || 'Preset').slice(0, 10);
    for (let i = 0; i < nameStr.length; i++) {
      buffer[25 + i] = nameStr.charCodeAt(i);
    }

    // Module chain order at 0x7E
    const order = preset.order || [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = 0; i < 9; i++) {
      buffer[0x7E + i] = order[i] !== undefined ? order[i] : i;
    }
    buffer[0x7E + 9] = 9; // clone slot

    return buffer;
  }
}
