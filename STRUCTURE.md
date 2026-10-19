# Project Structure

Descrive l'architettura dei file, la topologia di rete, i container e le variabili d'ambiente del progetto.
Mantenere aggiornato questo file ad ogni modifica strutturale o aggiunta di endpoint.

**Pedaliera Studio** (progetto indipendente, non affiliato a Sonicake; libreria catture Powered by [TONE3000](https://www.tone3000.com)): web app progressiva (desktop e mobile) per **tutte le pedaliere multi-effetto Sonicake** (hardware di riferimento: QME-20 e Pocket Master). Comunica direttamente con la pedaliera via **Web MIDI** (USB) e **Web Bluetooth** (BLE), senza software proprietario.

---

## 🧱 Stack

- **Frontend**: ES Modules vanilla (nessun framework, latenza minima sugli stream MIDI).
- **Bundler / dev server**: Vite + `@vitejs/plugin-basic-ssl` (HTTPS obbligatorio per Web MIDI e Web Bluetooth).
- **Stile**: Tailwind CSS + CSS custom in `frontend/src/styles/`, tema scuro da studio con grafica originale (`frontend/public/assets/ui/`, generata da `tools/make_ui_assets.py`).
- **Compiler**: Python Flask (`backend/server.py`) per la conversione Neural Amp Modeler (`.nam`) → Clone AMP. In produzione lo stesso processo serve anche il sito compilato.
- **Protocolli hardware**: Web MIDI API (`navigator.requestMIDIAccess`) e Web Bluetooth API (`navigator.bluetooth.requestDevice`).

---

## 🗂️ Albero del Repository

```text
sonicake-preset-manager/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD: test, poi immagine multi-arch (amd64/arm64) su GHCR
├── frontend/                   # Web app (workspace npm @sonicake/frontend)
│   ├── index.html
│   ├── src/
│   │   ├── main.js             # Bootstrap app, scorciatoie, wiring dei modali
│   │   ├── config/
│   │   │   ├── features.js     # Feature flag (funzioni nascoste nel sito pubblicato)
│   │   │   └── tone3000.js     # API TONE3000: publishable key (client_id), redirect di ritorno del login
│   │   ├── core/
│   │   │   ├── connection.js   # Trasporto MIDI & BLE, invio/ricezione SysEx, riconnessione dopo il ricaricamento
│   │   │   ├── protocol.js     # Framing SysEx, CRC16 (VTSI), CRC8 SMBus PEC (0x07), convertitore Low Model
│   │   │   ├── preset-engine.js # State machine 50 preset, flash streaming (Clone AMP & IR), export/import, swap
│   │   │   └── prst-parser.js  # Parser file .prst
│   │   ├── components/
│   │   │   ├── Tone3000Modal.js    # Memory Manager (10 slot), libreria TONE3000 (login, Sfoglia, elenchi), Drag&Drop, progress SysEx
│   │   │   ├── ModuleEditor.js     # Editor effetti, toggle Factory/Clone, pulsante libreria TONE3000, scheda della cattura TONE3000 caricata nel blocco
│   │   │   ├── SignalChain.js      # Routing e ordine della catena a 9 moduli
│   │   │   ├── PresetList.js       # Gestione 50 preset (U01-U50)
│   │   │   ├── PresetDropdown.js   # Menu a tendina della barra preset (desktop): ricerca, Utente/Fabbrica
│   │   │   ├── UpdateBanner.js     # Barra "aggiornamento disponibile" (non ricarica durante una scrittura)
│   │   │   ├── ui-feedback.js      # Avvisi (notify), dialog di testo (askText) e conferma (askConfirm)
│   │   │   ├── PresetPickerDialog.js
│   │   │   ├── SlotTransferModal.js
│   │   │   └── ...                 # Tuner, Drums, Setlist, Share, Export/Import, Stage Mode, Help
│   │   ├── data/               # Librerie comandi/moduli, lookup EQ, pattern batteria
│   │   ├── services/
│   │   │   ├── compiler-bridge.js  # Client del compiler (/api sulla stessa origine, NAM → Low Model 2.696 byte)
│   │   │   ├── tone3000.js         # API ufficiale TONE3000: OAuth PKCE nel popup, token, elenchi, download dei file
│   │   │   └── update-check.js     # Confronta la versione compilata con /version.json pubblicato
│   │   ├── styles/             # main.css, studio.css, tone3000.css, knobs.css, rack.css, drums-tuner.css
│   │   └── utils/
│   │       └── bundle-encoder.js   # Codifica link/bundle di condivisione
│   ├── public/                 # Grafica originale (assets/ui/), loghi TONE3000 (assets/tone3000/), manifest PWA, service worker,
│   │                           # tone3000-callback.html (ritorno del login TONE3000)
│   ├── test/                   # Test automatici (girano anche in CI prima della build dell'immagine)
│   │   ├── support/            # Pedaliera virtuale (risponde come quella vera) e scenario del motore
│   │   ├── engine/             # Scenario completo su USB, BLE a frame spezzati, BLE a 5 frame per notifica
│   │   ├── protocol/           # Libreria comandi (CRC8), routing catena, formati binari vs catture, .prst
│   │   ├── ui/                 # Chrome headless sulla build, rete e hardware simulati
│   │   └── fixtures/           # Piccole catture reali del protocollo (committate)
│   ├── vite.config.js          # Dev server (HTTPS basicSsl, esposizione LAN, proxy /api → 8080), version.json
│   ├── tailwind.config.js, postcss.config.js
│   └── package.json
├── backend/                    # Compiler NAM → Clone AMP; in produzione serve anche il sito
│   ├── server.py               # Flask: API compiler (+ sito statico se STATIC_DIR è impostata)
│   ├── requirements.txt
│   ├── nam2clo/                # Convertitore ARM64
│   │   ├── nam2clo.c, juce_android_shim.cpp
│   │   ├── stubs/              # Stub librerie Android + lib5868usb_link_stub.cpp (link in CI senza vendor)
│   │   └── extract-vendor.ps1  # Estrae i file vendor dall'APK SonicLink in data/vendor/
│   ├── test/                   # Limiti di sicurezza del compiler (Python unittest)
│   └── README.md
├── docs/
│   └── PROTOCOL.md             # Protocollo della pedaliera: frame, comandi, flash, export/import, rinomina
├── tools/                      # Script di reverse engineering (storici, non usati dal sito né dal server)
│   ├── make_ui_assets.py       # Genera la grafica originale del sito (frontend/public/assets/ui/)
│   └── captures/               # Catture locali dello sniffer e dump (mai committate)
├── data/                       # Volume runtime (/app/data in Docker, anche in sviluppo): cache/ + vendor/, mai committato
├── Dockerfile                  # Immagine unica multi-arch: sito Vite + API compiler (runtime bionic + nam2clo)
├── .dockerignore               # Build context dell'immagine
├── .gitattributes              # Fine riga LF, binari marcati
├── docker-compose.yml          # Servizio di produzione sulla rete cloudflared-mesh
├── .env.example                # Template variabili d'ambiente di docker compose
└── package.json                # Workspace npm: dev (compiler + sito insieme), build, test
```

---

## 🔁 Pipeline NAM → Pedaliera

Identica a Sonicake Manager, verificata byte per byte.

1. `.nam` (file locale, oppure scaricato dal browser da TONE3000 con il login dell'utente) → `POST /api/convert-nam` come file.
2. `namConvertCloDataWithProcess(ctx, inWav, outWav, namPath, cloOut, int* outSize, int* progress, int* total)` riproduce `nam_input_wav.wav` attraverso il modello e ricava un **CLO da 8.840 byte** (~15-20 s, worker asincrono; completato quando `*outSize == 8840`, errore quando progress/total `== -2`).
3. `convert_clo_to_low()` → **Low Model da 2.696 byte** (identico all'upload catturato di Sonicake Manager `frontend/test/fixtures/transfer2_clone.bin`).
4. Frontend `buildClonePayload()` + `flashCloneToPedal()` → 146 pacchetti SysEx.

Due backend intercambiabili (`server.py` ne sceglie uno, `/api/health` riporta `compiler_backend`):

- **Windows** (`dll`): `5868USB.dll` di Sonicake Manager in-process, presa dall'installazione locale di Sonicake Manager (o da `data/vendor/`). Mai nel repository.
- **Linux ARM64** (`nam2clo`, produzione): la build Android della stessa libreria (`lib5868USB.so`, arm64) eseguita da `nam2clo` nel `Dockerfile`, che include un runtime bionic minimo (linker64 + libc/libm/libdl dall'immagine AOSP redroid) e stub per liblog/OpenSL ES/EGL/GLES/libandroid. `juce_android_shim.cpp` intercetta `juce::File::getSpecialLocation` (altrimenti risolto via JNI → crash senza Java VM). L'output è identico byte per byte all'app SonicLink; rispetto alla DLL Windows differisce di ~0,07% (float ARM vs x86). Un processo per conversione, `NAM2CLO_WORKERS` in parallelo.
- **File vendor** (`lib5868USB.so`, `libc++_shared.so`, `nam_input_wav.wav`): estratti dall'APK SonicLink con `backend/nam2clo/extract-vendor.ps1` in `data/vendor/` e **montati a runtime**: mai committati, mai nell'immagine. In build `nam2clo` viene linkato contro `stubs/lib5868usb_link_stub.cpp`.
- Su host amd64 il sito funziona e il compiler risulta offline (la libreria esiste solo per ARM64).

---

## 🐳 Docker & Topologia di Rete

### Container di Produzione

- **Immagine:** `ghcr.io/andreaalcaini/sonicake-preset-manager:latest` (Public)
- **Architetture supportate:** `linux/amd64` e `linux/arm64` (conversione NAM solo su arm64)
- **Stage di build:** `deps`, `builder` e `pydeps` su `$BUILDPLATFORM`; `nam2clo` su `linux/amd64` (l'NDK esiste solo x86_64, l'output è sempre Android arm64); `android` copia il runtime bionic da redroid. Nello stage finale non si compila nulla.
- **Porta interna:** `3000` (waitress, utente `app` uid 1001)
- **Porta host:** `127.0.0.1:3010` → `3000`, solo per verifiche dal server stesso
- **Volume persistente:** `./data:/app/data` (`cache/` cartella di lavoro: solo file temporanei delle conversioni e `active_preset.json` di sviluppo, nessun modello conservato; `vendor/` file Sonicake). Proprietario: `sudo chown -R 1001:1001 data`
- **Host di produzione:** VPS Oracle Ampere (ARM64)

### Rete Cloudflare Tunnel (`cloudflared-mesh`)

- **Rete esterna:** `cloudflared-mesh` (creata da Cloudflared sull'host)
- **Alias DNS interno:** `sonicake.mesh` (confermato dall'utente); risponde anche il nome del container `sonicake`
- **Instradamento:** Public Hostname `sonicake.alcaini.it` → `http://sonicake.mesh:3000`. L'HTTPS richiesto da Web MIDI/Bluetooth è terminato da Cloudflare.

---

## 🔌 Porte

| Porta | Dove | Servizio |
|---|---|---|
| `5173` | sviluppo locale (HTTPS, `0.0.0.0`) | Vite dev server, proxy `/api` → `127.0.0.1:8080` |
| `8080` | sviluppo locale | `backend/server.py` (`npm run dev` o `npm run dev:backend`) |
| `3000` | container `sonicake` | Sito + API, raggiunto da Cloudflared come `sonicake.mesh:3000` |
| `3010` | host di produzione, solo `127.0.0.1` | Verifiche locali (`curl http://127.0.0.1:3010/api/health`) |

---

## 🔗 Endpoint API (`backend/server.py`)

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/api/health` | Stato del servizio e `compiler_backend` |
| `POST` | `/api/convert-nam` | Multipart `file` (`.nam`) → Low Model 2.696 byte. Il server non scarica mai URL (JSON con `url` → 400) |
| `GET`/`POST` | `/api/active-preset` | Solo sviluppo: legge/salva il preset attivo (`active_preset.json` nella cache) |
| `GET` | `/*` | Sito compilato con fallback SPA su `index.html` (solo se `STATIC_DIR` è impostata) |

---

## ⚙️ Variabili d'Ambiente

### docker compose (`.env` accanto a `docker-compose.yml`, template in `.env.example`)

| Variabile | Default | Descrizione |
|---|---|---|
| `NAM2CLO_WORKERS` | `2` | Conversioni NAM in parallelo |
| `NAM2CLO_TIMEOUT` | `180` | Timeout in secondi di una conversione |

### Applicazione (`backend/server.py`, impostate nel `Dockerfile`)

| Variabile | Default (container) | Descrizione |
|---|---|---|
| `PORT` | `8080` (`3000`) | Porta del server Flask |
| `DATA_DIR` | `data/` del repository (`/app/data`) | Volume persistente: `vendor/` e `cache/`, la cartella di lavoro delle conversioni (fallback su `/tmp` se non scrivibile). All'avvio vengono cancellate le conversioni salvate dalle versioni precedenti |
| `STATIC_DIR` | — (`/app/static`) | Sito compilato servito dallo stesso processo |
| `NAM2CLO_BIN` | — (`/opt/nam2clo/nam2clo`) | Convertitore ARM64 |
| `NAM2CLO_LIB` | — (`/app/data/vendor/lib5868USB.so`) | Libreria vendor montata |
| `SONICAKE_NAM_INPUT_WAV` | auto (`/app/data/vendor/nam_input_wav.wav`) | WAV di eccitazione |
| `NAM2CLO_CACHE_DIR` | — (`/tmp`) | Directory scratch di JUCE (letta da `juce_android_shim.cpp`) |
| `NAM2CLO_WORKERS` / `NAM2CLO_TIMEOUT` | `2` / `180` | Vedi sopra |

### Build del sito

| Variabile | Default | Descrizione |
|---|---|---|
| `APP_VERSION` | `build-<data ISO>` | Versione compilata nel sito e scritta in `dist/version.json`. La CI passa lo SHA del commit (build arg del `Dockerfile`). Una pagina aperta legge `/version.json` all'avvio, ogni 5 minuti e quando torna visibile: se è diversa mostra "È disponibile un aggiornamento". Il service worker non mette mai in cache `/version.json`, `/api` e le richieste ad altri domini |
| `VITE_TONE3000_CLIENT_ID` | chiave in `frontend/src/config/tone3000.js` | Publishable key TONE3000 (OAuth `client_id`, pubblica per natura). Gli indirizzi di ritorno `<origine>/tone3000-callback.html` (produzione e `https://localhost:5173`) vanno registrati sulla chiave in tone3000.com/settings |
| `SONICAKE_LIB_PATH` | — | Percorso di `5868USB.dll` (solo Windows). Altrimenti `data/vendor/5868USB.dll` o l'installazione di Sonicake Manager |
| `MAX_MODEL_MB` | `25` | Dimensione massima di un modello caricato (oltre: HTTP 413) |
| `CORS_ORIGINS` | — (nessuno) | Origini esterne ammesse a chiamare `/api` (il sito usa la stessa origine e non ne ha bisogno) |
| `SONICAKE_DEV_ENDPOINTS` | `1` in locale, `0` con `STATIC_DIR` | Abilita `/api/active-preset` (solo debug) |

### GitHub Actions (`Settings → Secrets and variables → Actions`)

| Nome | Tipo | Descrizione |
|---|---|---|
| `GHCR_PAT` | Secret (opzionale) | PAT **Classic** (`ghp_...`) con `write:packages`, `repo`, `workflow`; fallback su `GITHUB_TOKEN` |

---

## 🛠️ Comandi

```bash
npm install                 # Dipendenze (workspace: root + frontend)
npm run dev                 # Compiler :8080 + Vite HTTPS su 0.0.0.0:5173 (LAN/mobile), insieme
npm run dev:frontend        # Solo il sito
npm run dev:backend         # Solo il compiler (python backend/server.py)
npm run build               # Build di produzione in frontend/dist/
npm run preview             # Anteprima della build

# Test (nessuna pedaliera necessaria)
npm test                    # Motore + protocollo contro la pedaliera virtuale (~15 s)
npm run test:backend        # Limiti di sicurezza del compiler (Python)
npm run test:ui             # Build + Chrome headless (CHROME_PATH per un browser non standard)
npm run test:all            # Tutto quanto sopra

# Immagine in locale (solo per verificare il rilascio)
docker build --platform linux/arm64 -t sonicake .

# Produzione (sulla VPS, accanto a docker-compose.yml, .env e data/vendor/)
docker compose pull && docker compose up -d
```
