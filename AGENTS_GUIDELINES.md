# Guida Operativa per Agenti AI (Agents Guideline)
## Progetto: Sonicake Preset Manager & Tone3000 Cloud Explorer

Questa guida stabilisce il modo di lavorare, comunicare e prendere decisioni per qualsiasi agente AI (Antigravity, Claude Code, GitHub Copilot, ecc.) che collabora con **Andrea** su questo repository.

---

## 1. Chi è Andrea e come lavora

- **Ruolo**: Andrea (@andreaalcaini) è il creatore, architetto e product owner del progetto. È **l'unica persona del team con la pedaliera fisica (Sonicake QME-20)** collegata su banco di lavoro tramite USB e Bluetooth BLE.
- **Stile di interazione**:
  - **Pragmatico, rapido e diretto**: zero convenevoli, zero risposte verbose, va dritto al punto.
  - **Feedback dal campo reale**: testa dal vivo su smartphone (Android/iOS) e su PC, riportando esattamente ciò che accade sullo schermo o sulla pedaliera (es. *"da telefono dà questo errore"*, *"l'interfaccia si bugga quando seleziono BLE"*, *"la pedaliera si è bloccata"*).
  - **Definizione netta delle priorità**: quando Andrea stabilisce una priorità (es. *"dai priorità alla funzionalità di Tone3000"*), quella priorità supera qualsiasi attività secondaria o refactoring estetico non richiesto.
  - **Delega tecnica autonoma**: Andrea delega all'AI la scrittura del codice, il reverse engineering, l'integrazione di rete e la gestione del build. Si aspetta soluzioni concrete, codice testato e spiegazioni sintetiche delle scelte architetturali.
  - **Collaborazione distribuita**: Andrea collabora con **Mattia**, il quale usa Claude Code su una copia del repository ma **senza hardware fisico**. L'AI deve supportare questo flusso senza rompere la compatibilità tra i due.

---

## 2. Regole di Comunicazione con Andrea

1. **Linguaggio**: Rispondi sempre in **italiano**, con tono professionale, diretto e conciso.
2. **Zero fluff**: Non rispiegare concetti ovvi o manuali lunghi; mostra direttamente cosa è stato fatto, come testarlo e quali decisioni richiedono la sua conferma.
3. **Proattività e verifica prima di rispondere**:
   - Prima di dare un compito per concluso, esegui sempre `npm run build` per verificare che non ci siano errori di sintassi o bundle rotti.
   - Verifica lo stato di Git (`git status`) per assicurarsi che i file siano in ordine.
4. **Non fare domande banali**:
   - Se c'è una scelta logica evidente, implementala autonomamente e segnalala in breve.
   - Chiedi chiarimenti solo su decisioni di prodotto, audio/timbriche o vincoli hardware non documentati.

---

## 3. Direttive di Design e UX

- **100% Responsive e Mobile-First**:
  - L'applicazione deve essere perfetta su smartphone (schermi stretti touch, viewport dinamiche `100dvh`, nessun overflow orizzontale o scrollbar fantasma).
  - Touch targets minimi $\ge 44\text{px}$ per pulsanti primari (salvataggio, switch preset, cambio slot).
- **Stile Ufficiale SonicLink**:
  - Seguire fedelmente l'interfaccia dell'app nativa **SonicLink**:
    - **Chassis scuro da studio**: metallo spazzolato e carbonio (`#121316`, `#18191e`).
    - **Accenti Sonicake Orange**: arancione elettrico ad alto contrasto (`#ff6600` / `#f97316` / `#ea580c`).
    - **Card hardware smussate**: bordi definiti (`#2a2b32`), indicatori LED verdi (`#10b981`), marker IR ambra (`#f59e0b`).
- **Bluetooth BLE**: Mantieni la logica BLE essenziale e solida, evitando ri-connessioni aggressive o loop di polling che possono saturare lo stack Web Bluetooth del browser.

---

## 4. Regole Hardware Inderogabili (Protezione Firmware)

> [!CAUTION]
> Un errore nei pacchetti SysEx o nella taglia del binario blocca il DMA del microcontrollore e rende necessario il riavvio forzato della pedaliera. Non modificare queste regole senza validazione su pacchetti catturati.

1. **Formato Low Model Clone AMP (2.696 byte esatti)**:
   - La pedaliera accetta esclusivamente modelli compatti a **2.696 byte** (header `VTSI`, extendSize 2560 a offset `0x14`, layer size 512 a offset `0x84`, CRC16 Modbus a offset `0x08`).
   - Non inviare mai file `.namb` grezzi (7.980 o 55.636 byte): causano crash hardware immediato.
2. **Byte Identificativi**:
   - `0x25` = Clone AMP (Slot 0-4 -> Banchi 901-905, payload totale 2.770 byte).
   - `0x21` = Cabinet IR (Slot 0-4 -> Banchi 416-420, payload totale 2.122 byte, 512 campioni float normalizzati a 48kHz).
3. **Timing di Trasmissione**:
   - Pacchetti da 19 byte divisi in nibble MIDI a 7 bit con checksum SMBus PEC CRC8 (`0x07`).
   - Throttle obbligatorio $\ge 8\text{ms}$ tra ogni singolo pacchetto.
   - Settling window di **1.2 secondi** al termine della scrittura (tempo di scrittura fisica nel chip SPI Flash prima di accettare altri comandi).
4. **Protezione dei 50 Preset Utente (U01-U50)**:
   - Le scritture nei 10 banchi di memoria file (5 NAM + 5 IR) sono isolate e non devono mai toccare i preset salvati.

---

## 5. Regole di Git e Repository

1. **Mai tracciare `prompt.txt`**: Qualsiasi file di prompt, bozza di prompt o note private deve rimanere in `.gitignore` e **mai** essere inviato su GitHub (`prompt.txt`, `prompt*.txt`).
2. **Niente build artifacts**: La cartella `dist/` non deve essere tracciata in Git (viene generata da CI o localmente per il deploy).
3. **Commit Atomici e Parlanti**: Usare la convenzione standard (es. `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`).
4. **Branch Principale**: `master`, sempre sincronizzato con `origin/master`.

---

## 6. Checklist di Controllo per l'Agente prima di ogni Consegna

- [ ] Il comando `npm run build` passa con successo (exit code 0)?
- [ ] Il file `CLAUDE.md` e la documentazione del protocollo riflettono lo stato reale?
- [ ] Non sono presenti modifiche che alterano la dimensione fissa di 2.696 byte per i Clone AMP?
- [ ] L'interfaccia mobile rimane fluida e priva di barre di scorrimento orizzontali anomale?
- [ ] I file `prompt*.txt` sono esclusi da `git status`?
- [ ] I commit sono stati pushati sul remote `origin/master`?
