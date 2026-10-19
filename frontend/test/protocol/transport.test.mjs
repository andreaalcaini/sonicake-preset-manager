/**
 * connection.js reassembly (deliverFrame): USB and BLE must deliver whole messages.
 */
import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserStubs, loadSite } from '../support/virtual-pedal.mjs';

let P, connection, received, logs;

before(async () => {
  installBrowserStubs();
  ({ P, connection } = await loadSite());
  connection.messageHandlers.clear(); // keep the engine out of these tests
  connection.onMessage((hex) => received.push(hex));
  connection.log = (m, t) => logs.push(`[${t}] ${m}`);
});

beforeEach(() => {
  received = [];
  logs = [];
  connection.multiFrameAnswers = {};
  connection.bleBuffer = [];
});

/** payload of a dispatched hex message */
const payloadOf = (hex) => {
  const b = hex.slice(4).match(/../g).map(x => parseInt(x, 16));
  const n = b.slice(9, -1);
  return Array.from({ length: n.length / 2 }, (_, i) => (n[2 * i] << 4) | n[2 * i + 1]);
};
const answer = (size, seed = 1) => Uint8Array.from({ length: size }, (_, i) => (i * 31 + seed) & 0xFF);

describe('riassemblaggio delle risposte multi-frame', () => {
  it('USB: frame fuori ordine → un solo messaggio completo, ultimo frame corto rispettato', () => {
    const data = answer(87); // Clone AMP names answer: 5 frames, the last one 11 bytes
    const frames = P.buildStreamingFlashPackets(data);
    for (const f of [frames[2], frames[0], frames[4], frames[1], frames[3]]) connection.handleUsbMidiMessage({ data: f });
    assert.equal(received.length, 1);
    assert.deepEqual(payloadOf(received[0]), Array.from(data));
  });

  it('BLE: header e timestamp ignorati, più frame per notifica, frame spezzati', () => {
    const data = answer(200, 7);
    const frames = P.buildStreamingFlashPackets(data);
    connection.handleBleNotification(Uint8Array.from([0x80, 0x80, ...frames[0], 0x80, ...frames[1]]));
    for (const f of frames.slice(2)) {
      connection.handleBleNotification(Uint8Array.from([0x80, 0x80, ...f.slice(0, 20)]));
      connection.handleBleNotification(Uint8Array.from([0x80, ...f.slice(20)]));
    }
    assert.equal(received.length, 1);
    assert.deepEqual(payloadOf(received[0]), Array.from(data));
  });

  it('i messaggi da un solo frame passano subito', () => {
    connection.handleUsbMidiMessage({ data: P.buildStreamingFlashPackets(Uint8Array.from([0x14, 0x08, 0x00]))[0] });
    assert.equal(received.length, 1);
    assert.deepEqual(payloadOf(received[0]), [0x14, 0x08, 0x00]);
  });

  it('frame mancante: nulla viene consegnato; dopo 2,5 s di silenzio la risposta parziale è scartata', () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    try {
      const frames = P.buildStreamingFlashPackets(answer(2002)); // preset names: 106 frames
      frames.forEach((f, i) => { if (i !== 50) connection.handleUsbMidiMessage({ data: f }); });
      assert.equal(received.length, 0);
      mock.timers.tick(3000);
      // A new, complete answer with the same frame count is not mixed with the stale one
      const fresh = answer(2002, 9);
      for (const f of P.buildStreamingFlashPackets(fresh)) connection.handleUsbMidiMessage({ data: f });
      assert.equal(received.length, 1);
      assert.deepEqual(payloadOf(received[0]), Array.from(fresh));
      assert.ok(logs.some(l => /incompleta scartata \(105\/106/.test(l)), logs.join('\n'));
    } finally {
      mock.timers.reset();
    }
  });
});
