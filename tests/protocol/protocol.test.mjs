/**
 * Protocol data and binary formats, checked against captured Sonicake Manager / pedal traffic.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs, loadSite, fixture, ascii } from '../support/virtual-pedal.mjs';

let P, C, PrstParser, bundle, engine;

before(async () => {
  installBrowserStubs();
  ({ P, C, PrstParser, bundle, engine } = await loadSite());
});

/** Decode a library command; returns null when the frame is malformed */
function decodeCommand(hex) {
  const b = hex.replace(/^8080/i, '').match(/../g).map(x => parseInt(x, 16));
  const n = b.slice(1, -1);
  if (b[0] !== 0xF0 || b.at(-1) !== 0xF7 || n.some(x => x > 0x0F)) return null;
  const by = k => (n[k] << 4) | n[k + 1];
  const payload = [];
  for (let k = 8; k + 1 < n.length; k += 2) payload.push(by(k));
  return { crc: by(0), total: by(2), idx: by(4), len: by(6), payload };
}

describe('libreria dei comandi', () => {
  it('ogni comando ha framing, lunghezza e CRC8 corretti', () => {
    const bad = [];
    const walk = (v, where) => {
      if (typeof v === 'string' && /^(8080)?F0[0-9A-F]+F7$/i.test(v)) {
        const f = decodeCommand(v);
        const ok = f && f.payload.length === f.len &&
          P.calculateCRC8(Uint8Array.from([f.total, f.idx, f.len, ...f.payload])) === f.crc;
        if (!ok) bad.push(where);
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
      }
    };
    walk(C, 'C');
    assert.deepEqual(bad, []);
  });

  it('contiene 720 routing della catena e 50 + 50 preset', () => {
    assert.equal(Object.keys(C.chainOrderCommands).length, 720);
    assert.equal(Object.keys(C.presetCommands.user).length, 50);
    assert.equal(Object.keys(C.presetCommands.factory).length, 50);
  });

  it('moveChainModule produce solo routing supportati e non spezza DRV-AMP-IR-EQ', () => {
    const idOf = Object.fromEntries(Object.entries(P.MODULE_NAMES).map(([id, name]) => [name, Number(id)]));
    let moves = 0;
    for (const key of Object.keys(C.chainOrderCommands)) {
      const order = key.split('-').map(name => idOf[name]);
      for (const mod of [0, 1, 6, 7, 8]) {
        for (const dir of [-1, 1]) {
          const moved = P.moveChainModule(order, mod, dir);
          if (!moved) continue;
          moves++;
          assert.ok(C.chainOrderCommands[moved.map(id => P.MODULE_NAMES[id]).join('-')], moved.join(','));
        }
      }
    }
    assert.ok(moves > 1000);
  });
});

describe('formati binari', () => {
  it('buildClonePayload riproduce byte per byte l’upload di Sonicake Manager', () => {
    const ref = fixture('transfer2_clone.bin');
    const built = P.buildClonePayload(ref[6], ascii(ref.subarray(10, 42)), ref.slice(74));
    assert.equal(built.length, 2770);
    assert.deepEqual(Array.from(built), Array.from(ref));
  });

  it('buildIRPayload riproduce l’upload IR', () => {
    const ref = fixture('reconstructed_upload.bin');
    const built = P.buildIRPayload(ref[6], ascii(ref.subarray(10, 42)), ref.slice(74));
    assert.deepEqual(Array.from(built), Array.from(ref));
  });

  it('convertCLOToLowModel dà un Low Model da 2.696 byte con VTSI', () => {
    const low = P.convertCLOToLowModel(fixture('test_low.clo'));
    assert.equal(low.length, 2696);
    assert.equal(ascii(low.subarray(0, 4)), 'VTSI');
  });

  it('flash: 146 pacchetti per Clone AMP, 112 per IR, 19 byte ciascuno', () => {
    const clone = P.buildStreamingFlashPackets(fixture('transfer2_clone.bin'));
    const ir = P.buildStreamingFlashPackets(new Uint8Array(2122));
    assert.equal(clone.length, 146);
    assert.equal(ir.length, 112);
    assert.ok(clone.every(f => f.length <= 10 + 19 * 2));
  });

  it('decodifica lo stato di un preset reale (476 byte)', () => {
    const dump = P.decodeNativeHardwareDump(fixture('preset4_dump.bin'));
    assert.equal(dump.order.length, 9);
    assert.equal(Object.keys(dump.selectedEffects).length, 10);
  });

  it('decodifica i nomi dei preset catturati (passo 20 byte)', () => {
    const raw = fixture('names_dump.bin');
    const frames = [];
    for (let i = 0; i < raw.length; i += 48) frames.push(raw.subarray(i, i + 48));
    frames.sort((a, b) => ((a[5] << 4) | a[6]) - ((b[5] << 4) | b[6]));
    const nib = frames.flatMap(f => Array.from(f.subarray(9, 47)));
    const bytes = new Uint8Array(nib.length / 2).map((_, i) => (nib[2 * i] << 4) | nib[2 * i + 1]);
    const names = P.decodeNativePresetNames(bytes);
    assert.deepEqual(names.slice(0, 5), ['Smart Box', 'Creamy OD', 'Flicker', 'Lavana', 'Dark Wave']);
  });

  it('nomi degli slot fino a 16 caratteri', () => {
    const hex = Array.from('Marshall 1959BJA', c => `0${(c.charCodeAt(0) >> 4).toString(16)}0${(c.charCodeAt(0) & 15).toString(16)}`).join('').toUpperCase();
    assert.equal(P.decodeName(hex, 16), 'Marshall 1959BJA');
    assert.equal(P.decodeName(hex), 'Marshall 1');
  });

  it('file .prst: build → parse identico, cambio nome a 508 byte', () => {
    const raw = new Uint8Array(508);
    raw.set([0x12, 0x4F, 0xFF, 0xFF, 0xFF, 0xFF]);
    raw.set(Array.from('Test', c => c.charCodeAt(0)), 6);
    const prst = PrstParser.build(raw);
    assert.equal(prst.length, 527);
    assert.deepEqual(Array.from(PrstParser.parse(prst.buffer).raw), Array.from(raw));
    assert.equal(PrstParser.withName(raw, 'Ciao').length, 508);
  });
});

describe('condivisione', () => {
  it('link / bundle: encode → decode', () => {
    const original = engine.getPresetBundle();
    const decoded = bundle.decodePresetBundle(bundle.encodePresetBundle(original));
    assert.ok(bundle.isValidPresetBundle(decoded));
    assert.deepEqual(decoded, JSON.parse(JSON.stringify(original)));
  });

  it('backup JSON: export → import', () => {
    const json = engine.exportBackupJson();
    engine.importBackupJson(json);
    assert.equal(JSON.parse(json).presetList.length, 100);
  });
});
