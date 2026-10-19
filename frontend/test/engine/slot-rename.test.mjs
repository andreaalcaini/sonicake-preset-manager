/**
 * Renaming Clone AMP / User IR slots with the native rename message, checked against the
 * Sonicake Manager capture (test/fixtures/slot_rename_capture.json).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { installBrowserStubs, loadSite, VirtualPedal, ROOT } from '../support/virtual-pedal.mjs';

const capture = JSON.parse(readFileSync(path.join(ROOT, 'test', 'fixtures', 'slot_rename_capture.json'), 'utf8'));
const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
let site, E, P, pedal;

before(async () => {
  installBrowserStubs();
  site = await loadSite();
  ({ engine: E, P } = site);
  site.connection.log = () => {};
  pedal = new VirtualPedal(site, 'usb', { commitMs: 300 });
  pedal.attach();
  await E.syncCloneAmpNames();
  await E.syncUserIRNames();
});

describe('messaggio di rinomina (protocollo)', () => {
  it('Clone AMP: identico byte per byte alla cattura di Sonicake Manager', () => {
    const frames = P.buildStreamingFlashPackets(P.buildSlotRenamePayload('Clone', capture.clone.slot, capture.clone.newName));
    assert.deepEqual(frames.map(hex), capture.clone.frames);
  });

  it('User IR: identico byte per byte alla cattura di Sonicake Manager', () => {
    const frames = P.buildStreamingFlashPackets(P.buildSlotRenamePayload('IR', capture.ir.slot, capture.ir.newName));
    assert.deepEqual(frames.map(hex), capture.ir.frames);
  });
});

describe('rinomina sulla pedaliera', () => {
  it('rinomina uno slot Clone scritto da un’altra app, senza riscrivere la cattura', async () => {
    const sentBefore = pedal.rawFrames.length;
    const confirmed = await E.renameSlotOnPedal('Clone', capture.clone.slot, capture.clone.newName);
    assert.equal(confirmed, true);
    assert.equal(pedal.clone[capture.clone.slot].name, 'TEST1');
    assert.equal(E.cloneSlotNames[capture.clone.slot], 'TEST1');
    assert.equal(pedal.flashes.length, 0, 'nessuna riscrittura della cattura');
    const renameFrames = pedal.rawFrames.slice(sentBefore).filter(f => capture.clone.frames.includes(f));
    assert.deepEqual(renameFrames, capture.clone.frames, 'frame diversi da quelli di Sonicake Manager');
    assert.ok(pedal.minGap >= 8, `pausa minima ${pedal.minGap.toFixed(1)} ms`);
  });

  it('rinomina una User IR', async () => {
    assert.equal(await E.renameSlotOnPedal('IR', capture.ir.slot, capture.ir.newName), true);
    assert.equal(pedal.ir[capture.ir.slot].name, 'TEST2');
    assert.equal(E.irSlotNames[capture.ir.slot], 'TEST2');
  });

  it('al massimo 10 caratteri, come nell’app ufficiale', async () => {
    await E.renameSlotOnPedal('Clone', 3, 'Nome Lunghissimo');
    assert.equal(pedal.renames.at(-1).name, 'Nome Lungh');
    assert.equal(E.cloneSlotNames[3], 'Nome Lungh');
  });

  it('il nome resta dopo una sincronizzazione', async () => {
    await E.syncCloneAmpNames();
    assert.equal(E.cloneSlotNames[capture.clone.slot], 'TEST1');
  });

  it('pedaliera scollegata: errore chiaro, nessun invio', async () => {
    const sent = pedal.rawFrames.length;
    site.connection.isConnected = false;
    try {
      await assert.rejects(E.renameSlotOnPedal('Clone', 0, 'X'), /Collega la pedaliera/);
    } finally {
      site.connection.isConnected = true;
    }
    assert.equal(pedal.rawFrames.length, sent);
  });
});
