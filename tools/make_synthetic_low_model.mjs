/**
 * Write a synthetic 2,696-byte Clone AMP Low Model for the automated tests
 * (frontend/test/fixtures/test_low.clo). It has the real format (VTSI magic, size, extendSize,
 * layerSize, CRC16) but deterministic pseudo-random weights: no capture of any creator.
 *
 * Usage: node tools/make_synthetic_low_model.mjs [output]
 */
import { writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { calculateSonicakeCRC16 } = await import(pathToFileURL(path.join(root, 'frontend/src/core/protocol.js')).href);
const out = process.argv[2] || path.join(root, 'frontend/test/fixtures/test_low.clo');

const low = new Uint8Array(2696);
const view = new DataView(low.buffer);
low.set([0x56, 0x54, 0x53, 0x49]);        // 'VTSI'
view.setUint32(0x04, 2696, true);          // total size
view.setUint32(0x14, 2560, true);          // extendSize
view.setUint32(0x84, 512, true);           // layerSize

// Weights: small deterministic floats (linear congruential generator), never real model data
let seed = 0x5eed1234;
for (let off = 0x88; off + 4 <= low.length; off += 4) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  view.setFloat32(off, ((seed / 0xffffffff) - 0.5) * 0.2, true);
}

const crc = calculateSonicakeCRC16(low.subarray(12));
low[8] = crc & 0xff;
low[9] = (crc >> 8) & 0xff;
writeFileSync(out, low);
console.log(`${out}: ${low.length} byte, CRC16 0x${crc.toString(16).padStart(4, '0')}`);
