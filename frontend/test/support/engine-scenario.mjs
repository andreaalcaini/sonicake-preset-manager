/**
 * End-to-end scenario of the site's engine against the virtual pedal: sync, editing, save,
 * .prst export/import, swap, Clone AMP and User IR flash. One file per transport runs it
 * (the engine is a singleton, node --test gives every file its own process).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs, loadSite, VirtualPedal, fixture, ascii } from './virtual-pedal.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function runEngineScenario(transport) {
  describe(`motore + pedaliera virtuale (${transport})`, () => {
    let site, E, P, C, pedal, logs;
    const sent = () => pedal.commands.length;

    before(async () => {
      installBrowserStubs();
      site = await loadSite();
      ({ engine: E, P, C } = site);
      logs = [];
      site.connection.log = (m, t) => logs.push(`[${t}] ${m}`);
      pedal = new VirtualPedal(site, transport);
      pedal.attach();
      await E.runInitialSyncSequence();
      await sleep(600);
    });

    it('sincronizza i nomi Clone AMP e User IR (16 caratteri)', () => {
      assert.equal(E.cloneSlotNames[0], 'Marshall 1959BJA');
      assert.equal(E.irSlotNames[0], 'Marshall V30 4x1');
    });

    it('sincronizza i nomi dei 100 preset (utente e fabbrica)', () => {
      const names = E.presetList.map(p => p.name);
      assert.equal(names[0], 'APP TEST');
      assert.equal(names[49], 'User50');
      assert.equal(names[50], 'Fact1');
      assert.equal(names[99], 'Fact50');
    });

    it('legge il preset attivo e i suoi parametri', () => {
      assert.equal(E.currentSlot, 1);
      assert.ok(logs.some(l => /caricato dalla pedaliera/.test(l)), 'stato del preset non decodificato');
    });

    it('cambia preset', async () => {
      await E.selectPreset(4);
      await sleep(400);
      assert.equal(pedal.current, 3);
      assert.equal(E.currentSlot, 4);
    });

    it('invia bypass, effetto, parametro e amp mode', async () => {
      let before = sent();
      await E.setModuleBypass(0, false);
      await E.setModuleBypass(0, true);
      assert.equal(sent() - before, 2);
      const fxIds = Object.keys(C.effectTypes[1]);
      before = sent();
      await E.setEffectType(1, fxIds[1]);
      assert.ok(sent() > before);
      const mod = Object.keys(C.parameters)[0];
      const alg = Object.keys(C.parameters[mod])[0];
      const val = Object.keys(C.parameters[mod][alg])[3];
      before = sent();
      await E.setParameter(Number(mod), alg, Number(val));
      assert.equal(sent() - before, 1);
      before = sent();
      await E.setAmpMode('factory');
      assert.ok(sent() > before);
    });

    it('riordina la catena e rifiuta i routing non supportati', async () => {
      const moved = P.moveChainModule([...E.activePreset.order], 0, 1);
      assert.ok(moved);
      let before = sent();
      await E.setChainOrder(moved);
      assert.equal(sent() - before, 1);
      before = sent();
      await E.setChainOrder([3, 0, 1, 2, 4, 5, 6, 7, 8]); // DRV-AMP-IR-EQ split
      assert.equal(sent() - before, 0);
    });

    it('limita i comandi dei volumi (throttle 40 ms)', async () => {
      const before = sent();
      E.setPresetVolume(60); E.setPresetVolume(61); E.setPresetVolume(62);
      E.setMasterVolume(80);
      await sleep(200);
      const n = sent() - before;
      assert.ok(n >= 2 && n <= 4, `${n} comandi`);
    });

    it('salva un preset con il nome', async () => {
      await E.savePresetToSlot(6, 'NewSound');
      await sleep(200);
      assert.equal(pedal.presets[5].name, 'NewSound');
      assert.equal(E.presetList[5].name, 'NewSound');
    });

    it('esporta e reimporta un .prst con un nuovo nome', async () => {
      const exported = await E.exportPrstFromSlot(2);
      assert.equal(exported.bytes.length, 527);
      assert.equal(exported.name, 'Creamy OD');
      const buffer = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.length);
      await E.importPrstToSlot(buffer, 10, { newName: 'Imported' });
      assert.equal(pedal.presets[9].name, 'Imported');
      assert.equal(pedal.imports.at(-1).len, 508);
      assert.equal(E.presetList[9].name, 'Imported');
    });

    it('scambia due preset copiando i byte intatti', async () => {
      const rawA = pedal.presets[0].raw.slice(16, 40).join();
      const rawB = pedal.presets[1].raw.slice(16, 40).join();
      const nameB = pedal.presets[1].name;
      await E.swapPresets(1, 2);
      assert.equal(pedal.presets[0].raw.slice(16, 40).join(), rawB);
      assert.equal(pedal.presets[1].raw.slice(16, 40).join(), rawA);
      assert.equal(E.presetList[0].name, nameB);
    });

    it('scrive una cattura Clone AMP, attende il salvataggio e la attiva', async () => {
      const lowModel = P.convertCLOToLowModel(fixture('test_low.clo'));
      pedal.minGap = Infinity;
      let progress = 0;
      await E.flashCloneToPedal(3, lowModel, 'My Marshall 59', () => progress++);
      const fl = pedal.flashes.at(-1);
      assert.equal(fl.kind, 'clone');
      assert.equal(fl.total, 146);
      assert.equal(fl.len, 2770);
      assert.equal(progress, 146);
      assert.equal(ascii(fl.data.subarray(74, 78)), 'VTSI');
      assert.equal(fl.data[78] | (fl.data[79] << 8), 2696);
      assert.ok(pedal.minGap >= 8, `pausa minima ${pedal.minGap.toFixed(1)} ms`);
      assert.equal(pedal.clone[3].name, 'My Marshall 59');
      assert.equal(E.cloneSlotNames[3], 'My Marshall 59');

      const before = sent();
      await E.activateCloneSlot(3, true);
      await sleep(100);
      const selects = pedal.commands.slice(before).filter(c => c.p[0] === 0x11 && c.p[1] === 0x47);
      assert.equal(selects.length, 1, 'una sola selezione, verso lo slot nuovo');
      assert.equal(selects[0].p[10], 3);
      assert.equal(pedal.activeClone, 3);
      assert.equal(pedal.ampMode, 1);
      assert.deepEqual(pedal.ignoredWhileBusy, []);
    });

    it('scrive una User IR e la attiva', async () => {
      const samples = new Float32Array(512).map((_, i) => Math.exp(-i / 40) * Math.cos(i / 3));
      await E.flashIRToPedal(1, samples, 'Cab Greenback');
      const fi = pedal.flashes.at(-1);
      assert.equal(fi.kind, 'ir');
      assert.equal(fi.total, 112);
      assert.equal(fi.len, 2122);
      assert.equal(pedal.ir[1].name, 'Cab Greenback');
      assert.equal(E.irSlotNames[1], 'Cab Greenback');
      await E.activateIRSlot(1, true);
      assert.equal(E.activePreset.selectedEffects[4], 417);
    });

    it('ogni frame inviato è valido (F0/F7, nibble, lunghezza, CRC8)', () => {
      assert.deepEqual(pedal.errors, []);
    });
  });
}
