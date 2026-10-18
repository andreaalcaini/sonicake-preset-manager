/**
 * Virtual Sonicake pedal for the automated tests.
 *
 * It answers like the real hardware (formats taken from captured USB traffic and pedal logs):
 * answers split in 19-byte transport frames, ACK [14 08 00] for every frame of a stream and
 * every [11 ..] command, slot names that only change ~2.5 s after a flash (the pedal is still
 * committing, and ignores commands meanwhile). It checks what the site sends: SysEx framing,
 * nibble bytes, CRC8 PEC and the >= 8 ms pause between flash packets.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const fixture = (name) => new Uint8Array(readFileSync(path.join(ROOT, 'tests', 'fixtures', name)));

/** Minimal browser globals the engine modules expect */
export function installBrowserStubs() {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  globalThis.window = globalThis.window || { isSecureContext: true, location: { hostname: 'localhost' }, addEventListener() {} };
}

/** Import the site modules (after installBrowserStubs) */
export async function loadSite() {
  const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
  return {
    P: await imp('src/core/protocol.js'),
    connection: (await imp('src/core/connection.js')).connection,
    engine: (await imp('src/core/preset-engine.js')).presetEngine,
    PrstParser: (await imp('src/core/prst-parser.js')).PrstParser,
    C: (await imp('src/data/command-library.js')).COMMAND_LIBRARY_DATA,
    bundle: await imp('src/utils/bundle-encoder.js')
  };
}

const enc = (s, n) => { const b = new Uint8Array(n); for (let i = 0; i < Math.min(n, s.length); i++) b[i] = s.charCodeAt(i); return b; };
export const ascii = (b) => { let s = ''; for (const x of b) { if (x === 0) break; s += String.fromCharCode(x); } return s; };

export class VirtualPedal {
  /**
   * @param {object} site       modules returned by loadSite()
   * @param {'usb'|'ble'|'ble5'} transport  usb = Web MIDI messages; ble = frames split in 20-byte
   *        notifications; ble5 = up to 5 frames per notification (large MTU)
   * @param {object} [options]
   * @param {number} [options.commitMs]  time the pedal needs to commit a flashed slot
   * @param {'all'|'none'|number} [options.flashAck]  ACK every flash packet, none, or only the first N
   */
  constructor(site, transport = 'usb', { commitMs = 2500, flashAck = 'all' } = {}) {
    this.site = site;
    this.transport = transport;
    this.commitMs = commitMs;
    this.flashAck = flashAck;
    this.flashPacketsReceived = 0;
    this.rawFrames = []; // every frame received, as uppercase hex (to compare with captures)
    this.renames = [];
    const userNames = ['APP TEST', 'Creamy OD', 'Pure Clean', 'Creamy OD', 'Dark Wave', 'Pure Clean', 'Metal Riff'];
    this.presets = Array.from({ length: 100 }, (_, i) => {
      const name = i < 50 ? (userNames[i] || `User${i + 1}`) : `Fact${i - 49}`;
      const raw = new Uint8Array(502);
      raw.set(enc(name, 16), 0);
      for (let k = 16; k < 502; k++) raw[k] = (i * 7 + k) & 0xFF;
      return { name, raw };
    });
    this.clone = [{ name: 'Marshall 1959BJA', used: 1 }, { name: 'Audio Assault Sl', used: 1 }, { name: '', used: 0 }, { name: '', used: 0 }, { name: '', used: 0 }];
    this.ir = [{ name: 'Marshall V30 4x12', used: 1 }, { name: '', used: 0 }, { name: '', used: 0 }, { name: '', used: 0 }, { name: '', used: 0 }];
    this.current = 0;
    this.activeClone = 0;
    this.ampMode = 0;
    this.committingUntil = 0;
    this.pendingCommit = null;
    this.stream = null;
    this.errors = [];
    this.commands = [];
    this.ignoredWhileBusy = [];
    this.flashes = [];
    this.imports = [];
    this.lastFrameAt = 0;
    this.minGap = Infinity;
  }

  /** Plug the pedal into the site's connection object */
  attach() {
    const { connection } = this.site;
    connection.isConnected = true;
    connection.connectionType = this.transport === 'usb' ? 'usb' : 'ble';
    if (this.transport === 'usb') {
      connection.midiOutput = { send: (b) => this.receive(Uint8Array.from(b)) };
    } else {
      connection.bleCharacteristic = {
        writeValueWithoutResponse: async (b) => this.receive(b[0] === 0x80 && b[1] === 0x80 ? b.slice(2) : b)
      };
    }
  }

  respond(payload, delay = 1) {
    const { P, connection } = this.site;
    const frames = P.buildStreamingFlashPackets(payload);
    setTimeout(() => {
      if (this.transport === 'usb') {
        for (const f of frames) connection.handleUsbMidiMessage({ data: f });
      } else if (this.transport === 'ble5') {
        for (let i = 0; i < frames.length; i += 5) {
          const bytes = [0x80];
          for (const f of frames.slice(i, i + 5)) bytes.push(0x80, ...f);
          connection.handleBleNotification(Uint8Array.from(bytes));
        }
      } else {
        for (const f of frames) {
          for (let o = 0; o < f.length; o += 18) {
            const head = o === 0 ? [0x80, 0x80] : [0x80];
            connection.handleBleNotification(Uint8Array.from([...head, ...f.slice(o, o + 18)]));
          }
        }
      }
    }, delay);
  }

  ack() { this.respond(Uint8Array.from([0x14, 0x08, 0x00])); }

  commitIfDue() {
    if (this.pendingCommit && Date.now() >= this.committingUntil) {
      const { kind, slot, name } = this.pendingCommit;
      (kind === 'clone' ? this.clone : this.ir)[slot] = { name, used: 1 };
      this.pendingCommit = null;
    }
  }

  slotNamesPayload(kind) {
    this.commitIfDue();
    const list = kind === 'clone' ? this.clone : this.ir;
    const out = new Uint8Array(87);
    out.set([0x12, kind === 'clone' ? 0x24 : 0x20], 0);
    list.forEach((s, i) => { out[2 + i] = s.used ? 0 : 1; out.set(enc(s.name || 'Empty', 16), 7 + i * 16); });
    return out;
  }

  receive(bytes) {
    const { P } = this.site;
    if (bytes[0] === 0xC0) return; // optional MIDI Program Change
    this.rawFrames.push(Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase());
    if (bytes[0] !== 0xF0 || bytes[bytes.length - 1] !== 0xF7) { this.errors.push('frame senza F0/F7'); return; }
    const n = bytes.slice(1, -1);
    if (n.some(x => x > 0x0F)) { this.errors.push('byte non-nibble nel frame'); return; }
    const by = k => (n[k] << 4) | n[k + 1];
    const total = by(2), idx = by(4), len = by(6);
    const payload = [];
    for (let k = 8; k + 1 < n.length; k += 2) payload.push(by(k));
    if (payload.length !== len) this.errors.push(`lunghezza ${payload.length} != ${len}`);
    if (P.calculateCRC8(Uint8Array.from([total, idx, len, ...payload.slice(0, len)])) !== by(0)) {
      this.errors.push(`CRC errato (frame ${idx}/${total})`);
    }

    if (total > 1) {
      const now = performance.now();
      if (idx > 0) this.minGap = Math.min(this.minGap, now - this.lastFrameAt);
      this.lastFrameAt = now;
      if (idx === 0) this.stream = { total, chunks: [], flash: payload[0] === 0x11 && (payload[1] === 0x25 || payload[1] === 0x21) };
      if (!this.stream) { this.errors.push('frame di stream senza intestazione'); return; }
      this.stream.chunks[idx] = payload.slice(0, len);
      if (this.stream.flash) this.flashPacketsReceived++;
      const ackThis = !this.stream.flash || this.flashAck === 'all' || (typeof this.flashAck === 'number' && idx < this.flashAck);
      if (ackThis) this.ack();
      if (this.stream.chunks.filter(Boolean).length === total) {
        const data = Uint8Array.from(this.stream.chunks.flat());
        this.stream = null;
        this.onStream(data, total);
      }
      return;
    }

    const p = payload.slice(0, len);
    this.commitIfDue();
    const busy = Date.now() < this.committingUntil;
    this.commands.push({ p, busy });
    if (p[0] === 0x12) {
      if (p[1] === 0x24) return this.respond(this.slotNamesPayload('clone'));
      if (p[1] === 0x20) return this.respond(this.slotNamesPayload('ir'));
      if (p[1] === 0x40) {
        const out = new Uint8Array(2002);
        out.set([0x12, 0x40]);
        this.presets.forEach((pr, i) => { out[2 + i * 20] = i; out.set(enc(pr.name, 16), 2 + i * 20 + 4); });
        return this.respond(out);
      }
      if (p[1] === 0x43) return this.respond(Uint8Array.from([0x12, 0x43, this.current, 0]));
      if (p[1] === 0x41) return this.respond(fixture('preset4_dump.bin'));
      if (p[1] === 0x4F) {
        const out = new Uint8Array(508);
        out.set([0x12, 0x4F, 0xFF, 0xFF, 0xFF, 0xFF]);
        out.set(this.presets[p[2]].raw, 6);
        return this.respond(out);
      }
      return;
    }
    if (p[0] === 0x11) {
      if (busy) this.ignoredWhileBusy.push(p);
      if (p[1] === 0x43 && !busy) { this.current = p[2]; this.respond(Uint8Array.from([0x12, 0x1B, 0x01, 0, 0, 0])); }
      if (p[1] === 0x49 && p[2] === 0x09 && !busy) this.ampMode = p[6];
      if (p[1] === 0x47 && p[2] === 0x09 && !busy) { this.activeClone = p[10]; this.respond(Uint8Array.from([0x12, 0x45, 0x01])); }
      if (p[1] === 0x4A) this.presets[p[2]].name = ascii(Uint8Array.from(p.slice(6, 16)));
      this.ack();
    }
  }

  onStream(data, total) {
    if (data[0] === 0x11 && (data[1] === 0x25 || data[1] === 0x21)) {
      const kind = data[1] === 0x25 ? 'clone' : 'ir';
      this.flashes.push({ kind, slot: data[6], len: data.length, total, data });
      this.pendingCommit = { kind, slot: data[6], name: ascii(data.subarray(10, 26)) };
      this.committingUntil = Date.now() + this.commitMs;
    } else if (data[0] === 0x11 && (data[1] === 0x26 || data[1] === 0x22) && data.length === 22) {
      // Native slot rename (captured from Sonicake Manager): only the name changes, immediately
      const kind = data[1] === 0x26 ? 'clone' : 'ir';
      const name = ascii(data.subarray(6, 22));
      this.renames.push({ kind, slot: data[2], name });
      (kind === 'clone' ? this.clone : this.ir)[data[2]] = { name, used: 1 };
    } else if (data[0] === 0x11 && data[1] === 0x4F) {
      this.imports.push({ slot: data[2], len: data.length });
      this.presets[data[2]] = { name: ascii(data.subarray(6, 22)), raw: data.slice(6) };
    } else {
      this.errors.push(`stream sconosciuto ${data[0].toString(16)} ${data[1].toString(16)}`);
    }
  }
}
