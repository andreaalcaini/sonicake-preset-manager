/**
 * Flash pacing on the pedal ACKs [14 08 00]: fallback to fixed 8 ms pacing for pedals that never
 * ACK, and a clear error (no blind sending) when the ACKs stop mid-stream.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs, loadSite, VirtualPedal, fixture } from '../support/virtual-pedal.mjs';

let site, E, P, logs;

before(async () => {
  installBrowserStubs();
  site = await loadSite();
  ({ engine: E, P } = site);
  logs = [];
  site.connection.log = (m, t) => logs.push(`[${t}] ${m}`);
});

describe('flash con le conferme della pedaliera', () => {
  it('ogni pacchetto aspetta la sua conferma, sempre ≥ 8 ms', async () => {
    const pedal = new VirtualPedal(site, 'usb', { commitMs: 300 });
    pedal.attach();
    const t0 = performance.now();
    await E.streamFlashPackets(P.buildStreamingFlashPackets(P.buildIRPayload(0, 'Ack Cab', new Float32Array(512))));
    assert.equal(pedal.flashPacketsReceived, 112);
    assert.ok(pedal.minGap >= 7.9, `pausa minima ${pedal.minGap.toFixed(1)} ms`);
    assert.ok(performance.now() - t0 < 5000);
  });

  it('pedaliera che non conferma: invio a ritmo fisso e scrittura completata', async () => {
    const pedal = new VirtualPedal(site, 'usb', { flashAck: 'none', commitMs: 300 });
    pedal.attach();
    logs.length = 0;
    await E.flashCloneToPedal(1, P.convertCLOToLowModel(fixture('test_low.clo')), 'No Ack Amp');
    assert.equal(pedal.flashes.at(-1)?.total, 146);
    assert.ok(pedal.minGap >= 7.9, `pausa minima ${pedal.minGap.toFixed(1)} ms`);
    assert.ok(logs.some(l => /ritmo fisso/.test(l)));
  });

  it('conferme che si interrompono a metà: scrittura fermata con errore, nessun invio alla cieca', async () => {
    const pedal = new VirtualPedal(site, 'usb', { flashAck: 50, commitMs: 300 });
    pedal.attach();
    await assert.rejects(
      E.flashCloneToPedal(2, P.convertCLOToLowModel(fixture('test_low.clo')), 'Broken Amp'),
      /pacchetto 51\/146/
    );
    assert.equal(pedal.flashPacketsReceived, 51);
    assert.equal(pedal.flashes.length, 0);
  });
});
