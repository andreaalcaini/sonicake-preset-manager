# Protocollo della pedaliera

Come il sito parla con le pedaliere Sonicake (riferimento: QME-20) via **Web MIDI** (USB) e **Web Bluetooth** (BLE-MIDI).
Tutto quello che segue è stato ricavato dal traffico di Sonicake Manager / SonicLink e viene verificato dai test sulla pedaliera virtuale ([`frontend/test/`](../frontend/test/)) contro le catture reali in [`frontend/test/fixtures/`](../frontend/test/fixtures/).

I vincoli da non violare mai (timing, dimensioni, protezione dei preset) sono riassunti in [AGENTS.md](../AGENTS.md#-progetto-regole-hardware-inderogabili).

| Codice | File |
|---|---|
| Framing, CRC, payload, Low Model | [`frontend/src/core/protocol.js`](../frontend/src/core/protocol.js) |
| Trasporto USB/BLE, riassemblaggio | [`frontend/src/core/connection.js`](../frontend/src/core/connection.js) |
| Flash, export/import, swap, rinomina | [`frontend/src/core/preset-engine.js`](../frontend/src/core/preset-engine.js) |
| File `.prst` | [`frontend/src/core/prst-parser.js`](../frontend/src/core/prst-parser.js) |
| Pedaliera virtuale (risponde come quella vera) | [`frontend/test/support/virtual-pedal.mjs`](../frontend/test/support/virtual-pedal.mjs) |

---

## 1. Frame SysEx

Ogni messaggio (payload) viene spezzato in pezzi da **19 byte** e ogni pezzo viaggia in un frame SysEx in cui ogni byte è diviso in due nibble (`0x4F` → `04 0F`):

```text
F0  crc  total  idx  len  payload…  F7        (ogni campo dopo F0 in nibble)
```

| Campo | Significato |
|---|---|
| `crc` | CRC8 SMBus PEC (polinomio `0x07`) su `[total, idx, len, payload…]` |
| `total` | numero di frame del messaggio |
| `idx` | indice del frame, da 0 |
| `len` | byte di payload in questo frame (≤ 19; l'ultimo può essere più corto) |

- **USB**: il frame va così com'è a `MIDIOutput.send()`.
- **BLE**: davanti al frame ci sono header e timestamp BLE-MIDI (`80 80`). Una notifica può contenere più frame, oppure un frame spezzato su più notifiche. `connection.js` scarta i byte ≥ `0x80` interni e riassembla.
- **Risposte multi-frame**: vengono riassemblate per `total`/`idx`; una risposta incompleta viene scartata dopo 2,5 s di silenzio.

## 2. Richieste e risposte

Payload in esadecimale; le richieste sono un solo frame.

| Richiesta | Risposta |
|---|---|
| `12 40` nomi dei preset | 2.002 byte: `12 40` + 100 record da 20 byte (indice a +0, nome 16 caratteri a +4): 50 utente + 50 fabbrica |
| `12 43` preset attivo | `12 43 <slot0> 00` |
| `12 41` stato del preset attivo | parametri di tutti i moduli (decodifica in `protocol.js`) |
| `12 24` nomi Clone AMP | 87 byte: `12 24`, byte 2-6 = slot vuoto (1) / usato (0), nomi da 16 byte da offset 7 |
| `12 20` nomi User IR | stesso formato, `12 20` |
| `12 4F <slot0> 00 00 00` export di un preset | vedi §5 |

I comandi `11 …` (scrittura) ricevono come conferma `14 08 00`.

| Comando | Effetto |
|---|---|
| `11 43 <slot0> …` | seleziona un preset (risposta `12 1B 01`) |
| `11 4A <slot0> …` + nome | rinomina un preset utente (nome da offset 6) |
| `11 47 09 …` slot a offset 10 | attiva uno slot Clone AMP (risposta `12 45 01`) |
| `11 49 09 …` modo a offset 6 | AMP di fabbrica / Clone |
| parametri, on/off, routing | libreria comandi in [`frontend/src/data/`](../frontend/src/data/) |

## 3. Scrittura di una cattura (flash)

| | Clone AMP | User IR |
|---|---|---|
| Payload | **2.770 byte** | **2.122 byte** |
| Byte 0-1 | `11 25` | `11 21` |
| Byte 6 | slot 0-4 (banchi 901-905) | slot 0-4 (banchi 416-420) |
| Byte 10-41 | nome ASCII, padding a zero | nome ASCII, padding a zero |
| Byte 74… | **Low Model da 2.696 byte** (§4) | 512 campioni float32, 48 kHz, normalizzati |
| Frame | 146 | 112 |

Invio (`streamFlashPackets()`):

1. solo Clone AMP: richiesta dei nomi Clone (`12 24`) come Sonicake Manager, poi 60 ms;
2. un frame alla volta, almeno **8 ms** tra due frame (il codice ne usa 9: margine per il jitter di timer e USB/BLE), aspettando l'ACK `14 08 00` di ogni frame (massimo 1 s);
   - nessun ACK già al primo frame: ritmo fisso di 9 ms;
   - ACK mancante a metà: scrittura interrotta con errore;
3. dopo l'ultimo frame **1,2 s** di attesa (scrittura del settore flash), poi rilettura dei nomi finché la pedaliera riporta il nuovo nome.

Gli slot Clone/IR stanno in banchi separati: scriverli non tocca mai i preset U01-U50.

## 4. Low Model Clone AMP (2.696 byte)

La flash accetta **solo** questo formato: un `.namb` grezzo (7.980 o 55.636 byte) blocca la pedaliera.

| Offset | Contenuto |
|---|---|
| `0x00` | magic `VTSI` |
| `0x04` | dimensione `2696` |
| `0x08` | CRC16 calcolato dall'offset 12 |
| `0x14` | `extendSize = 2560` |
| `0x84` | `layerSize = 512` |

- **Pipeline `.nam` → Low Model**: `backend/server.py` fa girare il modello NAM sul WAV di eccitazione e ottiene un CLO da 8.840 byte; `convert_clo_to_low()` lo riduce a 2.696 byte. Il risultato è identico all'upload catturato di Sonicake Manager.
- **Nel browser**: `convertCLOToLowModel()` in `protocol.js`.

## 5. Export / import dei preset (swap)

Riprodotto byte per byte dal traffico USB di Sonicake Manager (27 frame su 27).

- **Export**: la richiesta `12 4F <slot0> 00 00 00` riceve 27 frame = 508 byte, cioè `12 4F FF FF FF FF` + 502 byte di preset (nome a offset 6).
- **Import**: gli stessi 508 byte con header `11 4F <slot0> 00 00 00`, in frame da 19 byte. Ogni frame aspetta l'ACK `14 08 00` e viene ritrasmesso dopo ~1 s, al massimo 3 tentativi.
- **Swap**: export A + export B, import B→A, import A→B. I byte si copiano intatti, mai ricostruiti dai parametri.
- **File `.prst`**: header da 25 byte + gli stessi 502 byte di preset.

## 6. Rinomina degli slot Clone AMP / IR

Catturata da Sonicake Manager "Rename Clone" / "Rename IR" il 2026-10-19 ([`slot_rename_capture.json`](../frontend/test/fixtures/slot_rename_capture.json)).

```text
Clone:  11 26 <slot> 00 00 0F  + nome (16 byte, padding a zero)    = 22 byte
IR:     11 22 <slot> 00 10 0A  + nome (16 byte, padding a zero)    = 22 byte
```

- Il messaggio viaggia in 2 frame, con ACK `14 08 00` per ogni frame.
- Cambia solo il nome: la cattura non viene riscritta.
- Il nome ha al massimo **10 caratteri**, come nelle app ufficiali.
- Funzione: `buildSlotRenamePayload()`.

## 7. Routing della catena

`DRV-AMP-IR-EQ` è un blocco fisso. Si muovono solo NR, FX1, FX2, DLY e RVB, che scavalcano il blocco come unità: 6 unità danno le 720 combinazioni di `chainOrderCommands`.
`moveChainModule()` calcola il nuovo ordine; `setChainOrder()` rifiuta qualsiasi routing che non sia nella libreria.
