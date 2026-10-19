/**
 * Sonicake .prst preset files (Sonicake Manager "Export/Import preset").
 *
 * Layout (527 bytes), verified against files exported by Sonicake Manager and the USB traffic
 * of the same export:
 *   0..19   device header, ASCII null-padded (e.g. "Smart Box")
 *   20..24  file tag (byte 20 varies per file, then FF FF FF FF; not sent to the pedal)
 *   25..526 the 502 preset bytes exactly as streamed by the pedal (name = first 16 bytes)
 *
 * On the wire the pedal uses [12|11, 4F, slot..] + the same 502 bytes (see preset-engine).
 */

export const PRST_SIZE = 527;
export const PRST_HEADER_SIZE = 25;
export const PRESET_BODY_SIZE = 502;
export const PRESET_RAW_SIZE = 508;
const NAME_SIZE = 16;

export class PrstParser {
  /**
   * Parse a .prst file. Throws on anything that is not a genuine Sonicake preset file.
   * @returns {{ header: string, name: string, body: Uint8Array, raw: Uint8Array }}
   *   raw = 508-byte image in the pedal export format (header 12 4F FF FF FF FF + body)
   */
  static parse(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length !== PRST_SIZE) {
      throw new Error(`File .prst non valido: ${bytes.length} byte invece di ${PRST_SIZE}.`);
    }

    let header = '';
    for (let i = 0; i < 20 && bytes[i] !== 0; i++) {
      if (bytes[i] < 32 || bytes[i] > 126) throw new Error('File .prst non valido: intestazione sconosciuta.');
      header += String.fromCharCode(bytes[i]);
    }
    if (!header) throw new Error('File .prst non valido: intestazione mancante.');

    const body = bytes.slice(PRST_HEADER_SIZE);
    const raw = new Uint8Array(PRESET_RAW_SIZE);
    raw.set([0x12, 0x4F, 0xFF, 0xFF, 0xFF, 0xFF], 0);
    raw.set(body, 6);

    return { header, name: PrstParser.readName(body), body, raw };
  }

  /** Build a .prst file from a 508-byte pedal export image */
  static build(raw, header = 'Smart Box') {
    if (!(raw instanceof Uint8Array) || raw.length !== PRESET_RAW_SIZE) {
      throw new Error('Dati preset non validi per il file .prst.');
    }
    const out = new Uint8Array(PRST_SIZE);
    for (let i = 0; i < Math.min(20, header.length); i++) out[i] = header.charCodeAt(i) & 0x7F;
    out.set([0xFF, 0xFF, 0xFF, 0xFF, 0xFF], 20);
    out.set(raw.subarray(6), PRST_HEADER_SIZE);
    return out;
  }

  static readName(body) {
    let name = '';
    for (let i = 0; i < NAME_SIZE && body[i] !== 0; i++) {
      if (body[i] >= 32 && body[i] <= 126) name += String.fromCharCode(body[i]);
    }
    return name.trim();
  }

  /** Return a copy of a 508-byte image with a new preset name (ASCII, max 10 chars like the pedal UI) */
  static withName(raw, name) {
    const copy = new Uint8Array(raw);
    const clean = (name || '').replace(/[^\x20-\x7E]/g, '').slice(0, 10);
    copy.fill(0, 6, 6 + NAME_SIZE);
    for (let i = 0; i < clean.length; i++) copy[6 + i] = clean.charCodeAt(i);
    return copy;
  }
}
