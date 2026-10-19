# AGENTS.md

Linee guida operative per agenti AI (Claude Code, Antigravity, Cursor, Codex) e sviluppatori in questo repository.
La mappa dei file, architettura, porte e componenti è descritta in [STRUCTURE.md](STRUCTURE.md): leggilo per primo per orientarti.

Le sezioni generali derivano da [andreaalcaini/agents-guideline](https://github.com/andreaalcaini/agents-guideline); quelle marcate **Progetto** sono specifiche di Sonicake Preset Manager.

---

## 🚨 REGOLA AUREA: Cloudflare Tunnel Mesh (`cloudflared-mesh`)

Ogni volta che crei o modifichi un file `docker-compose.yml` per aggiungere un nuovo servizio, devi:
1. Collegare il servizio alla rete esterna `cloudflared-mesh`:
   ```yaml
   services:
     <nome-servizio>:
       # ... altre configurazioni del servizio ...
       networks:
         - default
         - cloudflared-mesh

   networks:
     default:
     cloudflared-mesh:
       external: true
       name: cloudflared-mesh
   ```
2. Specificare l'alias per la mesh sotto il servizio:
   ```yaml
       networks:
         cloudflared-mesh:
           aliases:
             - <nomeservizio>.mesh
   ```
3. ⚠️ **CHIEDERE SEMPRE ALL'UTENTE:**
   > *"Quale alias desideri assegnare a questo servizio per la rete Cloudflare (ad es. `<nomeservizio>.mesh`)?"*
   Non inventare o finalizzare mai l'alias senza aver chiesto e ricevuto conferma dall'utente.

**Progetto:** l'unico servizio `app` (container `sonicake`) usa l'alias confermato `sonicake.mesh`; il tunnel punta a `http://sonicake.mesh:3000`.

---

## ⚡ DOCKER MULTI-ARCH PERFORMANCE REQUIREMENT (`--platform=$BUILDPLATFORM`)

### Il problema QEMU:
I runner GitHub Actions girano su architettura AMD64 (`linux/amd64`). Quando si compila per ARM64 (es. Raspberry Pi, Mac Apple Silicon), l'emulazione QEMU durante `npm install` o la build del codice è lentissima (freeze e timeout oltre 90 minuti).

### Lo standard:
Negli stage di build e installazione dipendenze usa SEMPRE `--platform=$BUILDPLATFORM` per sfruttare la velocità nativa della CPU del runner (build in ~30 secondi). Nello stage finale (`runner`) usa l'architettura target copiando gli asset già compilati.

### Applicazione nel progetto:
Un'unica immagine (`Dockerfile`) con sito Vite + API compiler:
- `deps` e `builder` (`npm ci`, `npm run build`) su `$BUILDPLATFORM`.
- `pydeps` su `$BUILDPLATFORM`: scarica le wheel pip **dell'architettura target** (`--platform manylinux2014_<arch> --only-binary=:all:` da `TARGETARCH`). Mai installarle con l'architettura del runner: `charset_normalizer` ha moduli compilati.
- `nam2clo` su `linux/amd64` fisso: l'Android NDK esiste solo x86_64 e l'output è sempre Android arm64, per qualsiasi target.
- Lo stage finale copia solo artefatti già pronti (più `groupadd`/`mkdir`): nessuna compilazione sotto QEMU.
- `.dockerignore` (root) parte dal template universale ed esclude vendor, cache e dump.

---

## 🚀 PIPELINE CI/CD & GITHUB PACKAGES (GHCR)

### File `.github/workflows/deploy.yml`:
- Trigger su push verso `main`/`master` e `workflow_dispatch`.
- `concurrency: cancel-in-progress: true` per interrompere build obsolete.
- QEMU + Docker Buildx per architetture `linux/amd64,linux/arm64`.
- Autenticazione con fallback `${{ secrets.GHCR_PAT || secrets.GITHUB_TOKEN }}`.
- Cache GitHub Actions (`cache-from/to: type=gha`).

**Progetto:** il workflow pubblica `ghcr.io/andreaalcaini/sonicake-preset-manager` (Public). I file vendor Sonicake (`lib5868USB.so`, `libc++_shared.so`, `nam_input_wav.wav`) sono proprietari: **non devono mai finire nell'immagine né nel repository**. Si montano a runtime da `./data/vendor`; in build `nam2clo` si linka contro `backend/nam2clo/stubs/lib5868usb_link_stub.cpp`.

### Regola d'oro Token GitHub (PAT):
- ⚠️ **NON USARE Fine-Grained Tokens (`github_pat_...`)**: non sono supportati da GHCR per namespace utente e causano l'errore `denied: permission_denied: The token provided does not match expected scopes`.
- ✅ **USARE SEMPRE Personal Access Token (Classic) (`ghp_...`)**:
  - Permessi obbligatori: `write:packages` (include `read:packages`), `repo`, `workflow`.
  - Salvare in `Settings -> Secrets and variables -> Actions` come secret `GHCR_PAT`.
- **Visibilità Package:** Impostare il package su **Public** in GitHub Packages così i server remoti possono fare `docker compose pull` senza autenticazione o problemi di token scaduti.

---

## 🔄 WORKFLOW DI SVILUPPO & REGOLE OPERATIVE

1. **Pianificazione prima delle modifiche non banali:**
   Per nuove feature, refactoring o modifiche multi-file: analizza il codice, presenta il piano (file toccati, logica, trade-off) e attendi approvazione prima di modificare.
2. **Usa i dev tools durante lo sviluppo:**
   Usa `npm run dev` / dev server con hot reload per testare le modifiche. Compila l'immagine Docker solo per verificare il rilascio o il container finale.
3. **Commits convenzionali a step:**
   Fai commit piccoli e frequenti (`feat:`, `fix:`, `refactor:`, `chore:`). Non fare un unico commit gigante alla fine.
4. **Nessun effetto collaterale non autorizzato:**
   Non inviare email, pagamenti o messaggi a utenti reali. I test usano mock o ambienti sandbox.
   **Progetto:** non inviare mai comandi SysEx alla pedaliera fisica per test: è Andrea a verificarli sull'hardware.
5. **Persistenza e cartella dati:**
   Tutti i dati persistenti (SQLite, upload, JSON) risiedono in `./data` (mappato nel container in `/app/data`). Includi `.gitignore` per escludere `data/*` tranne `!data/.gitkeep`.
   **Progetto:** `DATA_DIR` (`/app/data` nel container) contiene `cache/` e `vendor/`; il container gira come uid 1001, quindi sull'host: `sudo chown -R 1001:1001 data`.
6. **Allinea la documentazione:**
   Quando aggiungi o modifichi file, endpoint o variabili d'ambiente, aggiorna `STRUCTURE.md` e `.env.example` contestualmente.

---

## ⚠️ KNOWN PITFALLS & RISOLUZIONE ERRORI

- **Errore `error from registry: denied` sul server remoto:**
  Causato da vecchie credenziali memorizzate in `~/.docker/config.json`.
  - Se il package è pubblico: esegui `docker logout ghcr.io && docker compose pull`.
  - Se il package è privato: riesegui `echo "ghp_TUO_TOKEN" | docker login ghcr.io -u USER -p --password-stdin`.
- **Git Bash su Windows riscrive i path:**
  Le variabili d'ambiente con percorsi tipo `/data` possono essere trasformate da Git Bash in `C:/Program Files/Git/data`. Anteponi `MSYS2_ENV_CONV_EXCL='*'` o usa file `.env`.
  Vale anche per gli argomenti: `git show origin/master:path` e `docker exec ... ls /app` vanno lanciati con `MSYS_NO_PATHCONV=1`.
- **Windows file locking:**
  Su Windows i binari in esecuzione bloccano il file su disco: ferma il processo prima di ricompilare (es. `server.py` tiene aperta `5868USB.dll`).
- **Progetto: compiler "offline" in produzione:**
  Mancano i file in `data/vendor/` (estraili con `backend/nam2clo/extract-vendor.ps1`), la cache non è scrivibile (`chown -R 1001:1001 data`) oppure l'host è amd64 (la conversione funziona solo su arm64).
- **Progetto: conversioni lente in locale:**
  Su PC x86 l'immagine arm64 gira sotto QEMU: una conversione richiede ~4 minuti e supera il timeout di default. Per le prove alza `NAM2CLO_TIMEOUT`.

---

## 👥 Progetto: Team e Ruoli

- **Andrea (@andreaalcaini)**: creatore, architetto e product owner. È **l'unico con la pedaliera fisica (Sonicake QME-20)** collegata via USB e BLE: test hardware dal vivo, verifica MIDI/BLE, ascolto audio.
  - Pragmatico, rapido e diretto. Riporta feedback dal campo reale (smartphone Android/iOS e PC: *"da telefono dà questo errore"*, *"la pedaliera si è bloccata"*).
  - Quando fissa una priorità (es. *"dai priorità a Tone3000"*), questa supera qualsiasi attività secondaria o refactoring estetico non richiesto.
  - Delega all'AI codice, reverse engineering, integrazione di rete e build: si aspetta soluzioni concrete, codice verificato e spiegazioni sintetiche.
- **Agenti AI**: pair programming nel rispetto rigoroso delle regole hardware qui sotto. Senza pedaliera verificano le modifiche al protocollo con la pedaliera virtuale dei test.

---

## 💬 Progetto: Comunicazione

1. Rispondi sempre in **italiano**, tono professionale, diretto e conciso.
2. Niente spiegazioni ovvie: mostra cosa è stato fatto, come testarlo e quali decisioni servono.
3. Se una scelta è logicamente evidente, implementala e segnalala in breve; chiedi solo su decisioni di prodotto, timbriche/audio o vincoli hardware non documentati. Per modifiche multi-file vale comunque la regola di pianificazione sopra.
4. Prima di dichiarare concluso un compito: `npm run build` e `npm test` devono passare e `git status` deve essere in ordine. Chi non ha la pedaliera verifica le modifiche al protocollo con la pedaliera virtuale dei test.

---

## 🎨 Progetto: Design e UX

- Il testo dell'interfaccia dice sempre **"Pedaliera"**, mai il nome di un modello specifico.
- **100% responsive e mobile-first**: viewport `100dvh`, nessun overflow orizzontale o scrollbar fantasma, touch target $\ge 44\text{px}$ per le azioni primarie.
- **Stile ufficiale SonicLink**:
  - Chassis scuro da studio: `#121316`, `#18191e` (`#141518`), bordi card `#2a2b32`.
  - Accento Sonicake Orange: `#ff6600` / `#f97316` / `#ea580c`.
  - LED attivi verdi `#10b981`, marker IR ambra `#f59e0b`.
- **Bluetooth BLE**: logica essenziale e diretta (`connection.connectBLE()`), auto-reconnect differito, niente riconnessioni aggressive o polling che saturino lo stack Web Bluetooth.

---

## 🔒 Progetto: Regole Hardware Inderogabili

> [!CAUTION]
> Violare queste regole causa overflow della FIFO DMA dell'MCU, blocco della pedaliera, freeze del firmware o corruzione della flash. Verifica ogni modifica al protocollo su pacchetti catturati prima di chiedere ad Andrea di testarla.

Il protocollo completo (framing, comandi, risposte, formati) è in [docs/PROTOCOL.md](docs/PROTOCOL.md); qui restano i vincoli da non violare.

1. **Formato Low Model Clone AMP (2.696 byte)**:
   - La flash interna (verificato su QME-20) accetta **solo** il Low Model da 2.696 byte (mai `.namb` grezzi da 7.980 o 55.636 byte: crash immediato).
   - Formato: magic `VTSI`, dimensione `2696` a offset `0x04`, `extendSize = 2560` a offset `0x14`, `layerSize = 512` a offset `0x84`, CRC16 calcolato dall'offset 12 e salvato a offset `0x08`.
   - Conversione nel browser: `convertCLOToLowModel()` in `frontend/src/core/protocol.js`.
2. **Marker del payload**:
   - **Clone AMP**: payload totale **2.770 byte**. Byte 0 = `0x11`, **Byte 1 = `0x25`**, Byte 6 = `slotIndex` (0-4, banchi 901-905), Byte 10-41 = nome (ASCII, padding a zero), Byte 74-2770 = Low Model.
   - **User IR**: payload totale **2.122 byte**. Byte 0 = `0x11`, **Byte 1 = `0x21`**, Byte 6 = `slotIndex` (0-4, banchi 416-420), Byte 74-2122 = 512 campioni float 32 bit normalizzati a 48 kHz.
3. **Streaming SysEx e throttle DMA**:
   - Pacchetti da **19 byte** (146 per Clone AMP, 112 per IR), ognuno incapsulato in SysEx con CRC8 SMBus PEC (polinomio `0x07`).
   - Ritardo minimo di **8 ms** tra un pacchetto e l'altro.
   - La pedaliera conferma ogni pacchetto del flash con `14 08 00` (catturato su USB): `streamFlashPackets()` attende la conferma (max 1 s) prima del pacchetto successivo. Pausa effettiva 9 ms (8 + 1 di margine per il jitter di timer e USB/BLE). Se la conferma manca già al primo pacchetto, ritmo fisso di 9 ms; se manca a metà la scrittura si interrompe con un errore. Nessuna ritrasmissione: verificata solo per l'import dei preset. *(Introdotto il 2026-10-18, da confermare sulla pedaliera via USB e BLE.)*
   - Dopo l'ultimo pacchetto attendi **1,2 s** prima di qualsiasi altro comando (scrittura del settore SPI Flash).
4. **Export / Import nativo dei preset (usato per lo swap)**: verificato sul traffico USB di Sonicake Manager, `buildStreamingFlashPackets()` lo riproduce 27/27 byte per byte.
   - Richiesta export: un frame con payload `12 4F <slot0> 00 00 00` (`slot0` 0-based, P02 = `01`).
   - Risposta export: 27 frame da 19 byte = 508 byte: `12 4F FF FF FF FF` + 502 byte di preset (nome a offset 6). Via USB arriva riassemblata da `connection.js`, via BLE frame per frame.
   - Import: gli stessi 508 byte con header `11 4F <slot0> 00 00 00`, in frame da 19 byte; la pedaliera conferma ogni frame con `14 08 00`: attendi l'ACK (ritrasmetti dopo ~1 s), mai inviare a raffica.
   - File `.prst` = header da 25 byte + gli stessi 502 byte di preset.
   - Swap = export A + export B, import B→A, import A→B (`presetEngine.swapPresets`); i byte si copiano intatti, mai ricostruiti dai parametri decodificati.
5. **Routing della catena**: `DRV-AMP-IR-EQ` è un blocco fisso (mai diviso o riordinato). Si muovono solo NR, FX1, FX2, DLY, RVB, che scavalcano il blocco come unità: 6 unità → le 720 voci di `chainOrderCommands`. Usa `moveChainModule()` (`protocol.js`); `setChainOrder()` rifiuta qualsiasi routing non presente nella libreria.
6. **Protezione dei preset**: i 10 slot di memoria interni (5 Clone AMP + 5 IR) stanno in banchi flash separati. Scriverli **non deve mai** toccare, modificare o sovrascrivere i 50 preset utente (U01-U50).
7. **Rinomina degli slot Clone AMP / IR** (catturata da Sonicake Manager "Rename Clone" / "Rename IR" il 2026-10-19, `frontend/test/fixtures/slot_rename_capture.json`): messaggio di 22 byte `11 26 <slot> 00 00 0F` (Clone) oppure `11 22 <slot> 00 10 0A` (IR) + nome in 16 byte con padding a zero, inviato in 2 frame con ACK `14 08 00` per frame. Cambia solo il nome, la cattura non viene riscritta. Nome **massimo 10 caratteri**, come nelle app ufficiali. Funzione: `buildSlotRenamePayload()` (riproduce la cattura byte per byte).

---

## 🌿 Progetto: Git

- **Mai tracciare**: `prompt.txt` / `prompt*.txt`, `dist/`, `data/*` (tranne `.gitkeep`), `tools/captures/` (catture locali, possono contenere i nomi dei preset), `.env`, `__pycache__` e virtualenv, file vendor Sonicake (`data/vendor/`, `backend/nam2clo/vendor/`, `backend/nam2clo/build/`).
- Commit atomici e descrittivi (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
- **Nessuna attribuzione AI nei commit e nelle PR**: niente `Co-Authored-By: Claude …` né "Generated with Claude Code". L'unico autore è Andrea (GitHub mostra i co-autori tra i contributors).
- Branch principale: `master`, sincronizzato con `origin/master`.

---

## ✅ Progetto: Checklist prima di ogni consegna

- [ ] `npm run build` passa (exit code 0, controllato davvero: non filtrare l'output con `grep` prima di committare)?
- [ ] `npm run test:all` passa? Ogni modifica al protocollo ha un test nella pedaliera virtuale (`frontend/test/support/virtual-pedal.mjs`) prima di chiedere ad Andrea di provarla sull'hardware.
- [ ] `STRUCTURE.md`, `.env.example` e la documentazione del protocollo riflettono lo stato reale?
- [ ] Nessuna modifica altera la dimensione fissa di 2.696 byte dei Clone AMP o i timing SysEx?
- [ ] L'interfaccia mobile resta fluida e senza scrollbar orizzontali?
- [ ] `prompt*.txt`, `.env` e i file vendor sono esclusi da `git status`?
- [ ] Se hai toccato `docker-compose.yml`: nuovi servizi esposti sono su `cloudflared-mesh` con alias confermato dall'utente?
- [ ] Se hai toccato il Dockerfile: gli stage di build/installazione usano `--platform=$BUILDPLATFORM` e nessun file vendor entra nell'immagine?
- [ ] I commit sono stati pushati su `origin/master`?
