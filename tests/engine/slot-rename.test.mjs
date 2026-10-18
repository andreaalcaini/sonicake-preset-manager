/**
 * Renaming Clone AMP / User IR slots already in the pedal memory.
 * The pedal has no rename command: captures written from the app are written again with the new
 * name (same data); for the others the new name is an app-only alias that survives the syncs.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs, loadSite, VirtualPedal, fixture } from '../support/virtual-pedal.mjs';

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

describe('rinomina degli slot in memoria', () => {
  it('Clone scritto dall’app: rinominato sulla pedaliera con la stessa cattura', async () => {
    const lowModel = P.convertCLOToLowModel(fixture('test_low.clo'));
    await E.flashCloneToPedal(2, lowModel, 'Plexi Lead');
    const written = pedal.flashes.at(-1).data;
    assert.equal(E.canRenameSlotOnPedal('Clone', 2), true);

    await E.renameSlotOnPedal('Clone', 2, 'Plexi 68');
    const rewritten = pedal.flashes.at(-1).data;
    assert.equal(pedal.flashes.length, 2);
    assert.equal(pedal.clone[2].name, 'Plexi 68');
    assert.equal(E.cloneSlotNames[2], 'Plexi 68');
    assert.deepEqual(Array.from(rewritten.subarray(74)), Array.from(written.subarray(74)), 'dati della cattura cambiati');
    assert.equal(rewritten[6], 2);
    assert.equal(E.canRenameSlotOnPedal('Clone', 2), true, 'deve restare rinominabile');
  });

  it('IR scritta dall’app: rinominata sulla pedaliera con gli stessi campioni', async () => {
    const samples = new Float32Array(512).map((_, i) => Math.exp(-i / 30));
    await E.flashIRToPedal(3, samples, 'Greenback');
    const written = pedal.flashes.at(-1).data;
    await E.renameSlotOnPedal('IR', 3, 'V30 Close');
    const rewritten = pedal.flashes.at(-1).data;
    assert.equal(pedal.ir[3].name, 'V30 Close');
    assert.equal(E.irSlotNames[3], 'V30 Close');
    assert.deepEqual(Array.from(rewritten.subarray(74)), Array.from(written.subarray(74)));
  });

  it('slot scritto altrove: nome solo nell’app, non perso alla sincronizzazione', async () => {
    assert.equal(E.canRenameSlotOnPedal('Clone', 0), false);
    const flashes = pedal.flashes.length;
    E.setSlotAlias('Clone', 0, 'Mio Plexi');
    await E.syncCloneAmpNames();
    assert.equal(E.cloneSlotNames[0], 'Mio Plexi');
    assert.equal(pedal.clone[0].name, 'Marshall 1959BJA', 'la pedaliera non va toccata');
    assert.equal(pedal.flashes.length, flashes);
    assert.match(localStorage.getItem('sonicake_slot_aliases'), /Mio Plexi/);
  });

  it('l’alias decade quando nello slot arriva un’altra cattura', async () => {
    pedal.clone[0] = { name: 'Other Amp', used: 1 };
    await E.syncCloneAmpNames();
    assert.equal(E.cloneSlotNames[0], 'Other Amp');
    assert.doesNotMatch(localStorage.getItem('sonicake_slot_aliases'), /Mio Plexi/);
  });

  it('scrivere una cattura in uno slot ne cancella l’alias', async () => {
    E.setSlotAlias('Clone', 0, 'Alias Vecchio');
    await E.flashCloneToPedal(0, P.convertCLOToLowModel(fixture('test_low.clo')), 'Nuova Cattura');
    assert.equal(E.cloneSlotNames[0], 'Nuova Cattura');
    assert.doesNotMatch(localStorage.getItem('sonicake_slot_aliases'), /Alias Vecchio/);
  });

  it('pedaliera scollegata: nessuna riscrittura possibile', () => {
    site.connection.isConnected = false;
    try {
      assert.equal(E.canRenameSlotOnPedal('Clone', 2), false);
    } finally {
      site.connection.isConnected = true;
    }
  });
});
