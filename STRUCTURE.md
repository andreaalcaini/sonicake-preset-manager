# Project Structure

Descrive l'architettura dei file, la topologia di rete, i container e le variabili d'ambiente del progetto.
Mantenere aggiornato questo file ad ogni modifica strutturale o aggiunta di endpoint.

**Sonicake Preset Manager & Tone3000 Cloud Explorer**: web app progressiva (desktop e mobile) per **tutte le pedaliere multi-effetto Sonicake** (hardware di riferimento: QME-20 e Pocket Master). Comunica direttamente con la pedaliera via **Web MIDI** (USB) e **Web Bluetooth** (BLE), senza software proprietario.

---

## 🧱 Stack

- **Frontend**: ES Modules vanilla (nessun framework, latenza minima sugli stream MIDI).
- **Bundler / dev server**: Vite + `@vitejs/plugin-basic-ssl` (HTTPS obbligatorio per Web MIDI e Web Bluetooth).
- **Stile**: Tailwind CSS + CSS custom in `src/styles/`, fedele all'app ufficiale **SonicLink**.
- **Compiler**: Python Flask (`server/server.py`) per la conversione Neural Amp Modeler (`.nam`) → Clone AMP. In produzione lo stesso processo serve anche il sito compilato.
- **Protocolli hardware**: Web MIDI API (`navigator.requestMIDIAccess`) e Web Bluetooth API (`navigator.bluetooth.requestDevice`).

---

## 🗂️ Albero del Repository

```text
sonicake-preset-manager/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD: immagine multi-arch (amd64/arm64) su GHCR
├── src/
│   ├── main.js                 # Bootstrap app, scorciatoie, wiring dei modali
│   ├── config/
│   │   └── features.js         # Feature flag (funzioni nascoste nel sito pubblicato)
│   ├── core/
│   │   ├── connection.js       # Trasporto MIDI & BLE, invio/ricezione SysEx, riconnessione dopo il ricaricamento
│   │   ├── protocol.js         # Framing SysEx, CRC16 (VTSI), CRC8 SMBus PEC (0x07), convertitore Low Model
│   │   ├── preset-engine.js    # State machine 50 preset, flash streaming (Clone AMP & IR), export/import, swap
│   │   └── prst-parser.js      # Parser file .prst
│   ├── components/
│   │   ├── Tone3000Modal.js    # Memory Manager (10 slot), Cloud Explorer, Drag&Drop, progress SysEx
│   │   ├── ModuleEditor.js     # Editor effetti, toggle Factory/Clone, sostituzione Tone3000
│   │   ├── SignalChain.js      # Routing e ordine della catena a 9 moduli
│   │   ├── PresetList.js       # Gestione 50 preset (U01-U50)
│   │   ├── PresetDropdown.js   # Menu a tendina della barra preset (desktop): ricerca, Utente/Fabbrica
│   │   ├── PresetPickerDialog.js
│   │   ├── SlotTransferModal.js
│   │   └── ...                 # Tuner, Drums, Setlist, Share, Export/Import, Stage Mode, Help
│   ├── data/                   # Librerie comandi/moduli, lookup EQ, pattern batteria
│   ├── services/
│   │   ├── compiler-bridge.js  # Client del compiler (/api sulla stessa origine, NAM → Low Model 2.696 byte)
│   │   └── tone3000.js         # Client REST Supabase di Tone3000
│   ├── styles/                 # main.css, soniclink.css, tone3000.css, knobs.css, rack.css, drums-tuner.css
│   └── utils/
│       └── bundle-encoder.js   # Codifica link/bundle di condivisione
├── public/                     # Asset statici, manifest PWA, service worker
├── server/
│   ├── server.py               # Flask: API compiler (+ sito statico se STATIC_DIR è impostata)
│   ├── requirements.txt
│   ├── 5868USB.dll             # Libreria nativa Sonicake (backend Windows)
│   ├── nam2clo/                # Convertitore ARM64
│   │   ├── nam2clo.c, juce_android_shim.cpp
│   │   ├── stubs/              # Stub librerie Android + lib5868usb_link_stub.cpp (link in CI senza vendor)
│   │   └── extract-vendor.ps1  # Estrae i file vendor dall'APK SonicLink in data/vendor/
│   ├── cache/                  # Cache conversioni in sviluppo locale (non committata)
│   └── *.py / *.bin            # Script e dump di reverse engineering
├── data/                       # Volume runtime (/app/data): cache/ + vendor/, mai committato
├── Dockerfile                  # Immagine unica multi-arch: sito Vite + API compiler (runtime bionic + nam2clo)
├── .dockerignore               # Build context dell'immagine
├── docker-compose.yml          # Servizio di produzione sulla rete cloudflared-mesh
├── .env.example                # Template variabili d'ambiente di docker compose
├── vite.config.js              # Dev server (HTTPS basicSsl, esposizione LAN, proxy /api → 8080)
├── start.bat                   # Avvio locale Windows (compiler + Vite)
└── package.json
```

---

## 🔁 Pipeline NAM → Pedaliera

Identica a Sonicake Manager, verificata byte per byte.

1. `.nam` (`model_url` di Tone3000 o file locale) → `POST /api/convert-nam`.
2. `namConvertCloDataWithProcess(ctx, inWav, outWav, namPath, cloOut, int* outSize, int* progress, int* total)` riproduce `nam_input_wav.wav` attraverso il modello e ricava un **CLO da 8.840 byte** (~15-20 s, worker asincrono; completato quando `*outSize == 8840`, errore quando progress/total `== -2`).
3. `convert_clo_to_low()` → **Low Model da 2.696 byte** (identico all'upload catturato di Sonicake Manager `server/transfer2_clone.bin`).
4. Frontend `buildClonePayload()` + `flashCloneToPedal()` → 146 pacchetti SysEx.

Due backend intercambiabili (`server.py` ne sceglie uno, `/api/health` riporta `compiler_backend`):

- **Windows** (`dll`): `5868USB.dll` di Sonicake Manager in-process.
- **Linux ARM64** (`nam2clo`, produzione): la build Android della stessa libreria (`lib5868USB.so`, arm64) eseguita da `nam2clo` nel `Dockerfile`, che include un runtime bionic minimo (linker64 + libc/libm/libdl dall'immagine AOSP redroid) e stub per liblog/OpenSL ES/EGL/GLES/libandroid. `juce_android_shim.cpp` intercetta `juce::File::getSpecialLocation` (altrimenti risolto via JNI → crash senza Java VM). L'output è identico byte per byte all'app SonicLink; rispetto alla DLL Windows differisce di ~0,07% (float ARM vs x86). Un processo per conversione, `NAM2CLO_WORKERS` in parallelo.
- **File vendor** (`lib5868USB.so`, `libc++_shared.so`, `nam_input_wav.wav`): estratti dall'APK SonicLink con `server/nam2clo/extract-vendor.ps1` in `data/vendor/` e **montati a runtime**: mai committati, mai nell'immagine. In build `nam2clo` viene linkato contro `stubs/lib5868usb_link_stub.cpp`.
- Su host amd64 il sito funziona e il compiler risulta offline (la libreria esiste solo per ARM64).

---

## 🐳 Docker & Topologia di Rete

### Container di Produzione

- **Immagine:** `ghcr.io/andreaalcaini/sonicake-preset-manager:latest` (Public)
- **Architetture supportate:** `linux/amd64` e `linux/arm64` (conversione NAM solo su arm64)
- **Stage di build:** `deps`, `builder` e `pydeps` su `$BUILDPLATFORM`; `nam2clo` su `linux/amd64` (l'NDK esiste solo x86_64, l'output è sempre Android arm64); `android` copia il runtime bionic da redroid. Nello stage finale non si compila nulla.
- **Porta interna:** `3000` (waitress, utente `app` uid 1001)
- **Porta host:** `127.0.0.1:3010` → `3000`, solo per verifiche dal server stesso
- **Volume persistente:** `./data:/app/data` (`cache/` conversioni e `active_preset.json`, `vendor/` file Sonicake). Proprietario: `sudo chown -R 1001:1001 data`
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
| `8080` | sviluppo locale | `python server/server.py` |
| `3000` | container `sonicake` | Sito + API, raggiunto da Cloudflared come `sonicake.mesh:3000` |
| `3010` | host di produzione, solo `127.0.0.1` | Verifiche locali (`curl http://127.0.0.1:3010/api/health`) |

---

## 🔗 Endpoint API (`server/server.py`)

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/api/health` | Stato del servizio, `compiler_backend`, numero di elementi in cache |
| `POST` | `/api/convert-nam` | JSON `{url, name}` (solo modelli Tone3000) oppure multipart `file` (`.nam`) → Low Model 2.696 byte |
| `GET`/`POST` | `/api/active-preset` | Solo sviluppo: legge/salva il preset attivo (`active_preset.json` nella cache) |
| `GET` | `/*` | Sito compilato con fallback SPA su `index.html` (solo se `STATIC_DIR` è impostata) |

---

## ⚙️ Variabili d'Ambiente

### docker compose (`.env` accanto a `docker-compose.yml`, template in `.env.example`)

| Variabile | Default | Descrizione |
|---|---|---|
| `NAM2CLO_WORKERS` | `2` | Conversioni NAM in parallelo |
| `NAM2CLO_TIMEOUT` | `180` | Timeout in secondi di una conversione |

### Applicazione (`server/server.py`, impostate nel `Dockerfile`)

| Variabile | Default (container) | Descrizione |
|---|---|---|
| `PORT` | `8080` (`3000`) | Porta del server Flask |
| `DATA_DIR` | `server/` (`/app/data`) | Volume persistente: `cache/` (fallback su `/tmp` se non scrivibile) |
| `STATIC_DIR` | — (`/app/static`) | Sito compilato servito dallo stesso processo |
| `NAM2CLO_BIN` | — (`/opt/nam2clo/nam2clo`) | Convertitore ARM64 |
| `NAM2CLO_LIB` | — (`/app/data/vendor/lib5868USB.so`) | Libreria vendor montata |
| `SONICAKE_NAM_INPUT_WAV` | auto (`/app/data/vendor/nam_input_wav.wav`) | WAV di eccitazione |
| `NAM2CLO_CACHE_DIR` | — (`/tmp`) | Directory scratch di JUCE (letta da `juce_android_shim.cpp`) |
| `NAM2CLO_WORKERS` / `NAM2CLO_TIMEOUT` | `2` / `180` | Vedi sopra |
| `SONICAKE_LIB_PATH` | — | Percorso alternativo di `5868USB.dll` (solo Windows) |
| `MODEL_URL_HOSTS` | `api.tone3000.com` | Host (separati da virgola) da cui `/api/convert-nam` può scaricare modelli: solo `https`, niente redirect |
| `MAX_MODEL_MB` | `25` | Dimensione massima di un modello scaricato o caricato (oltre: HTTP 413) |
| `CORS_ORIGINS` | — (nessuno) | Origini esterne ammesse a chiamare `/api` (il sito usa la stessa origine e non ne ha bisogno) |
| `SONICAKE_DEV_ENDPOINTS` | `1` in locale, `0` con `STATIC_DIR` | Abilita `/api/active-preset` (solo debug) |

### GitHub Actions (`Settings → Secrets and variables → Actions`)

| Nome | Tipo | Descrizione |
|---|---|---|
| `GHCR_PAT` | Secret (opzionale) | PAT **Classic** (`ghp_...`) con `write:packages`, `repo`, `workflow`; fallback su `GITHUB_TOKEN` |

---

## 🛠️ Comandi

```bash
npm run dev                 # Vite HTTPS su 0.0.0.0:5173 (LAN/mobile)
npm run build               # Build di produzione in dist/
npm run preview             # Anteprima della build
python server/server.py     # Compiler locale su :8080 (necessario per .nam → Clone AMP)
start.bat                   # Windows: compiler + Vite in un colpo

# Immagine in locale (solo per verificare il rilascio)
docker build --platform linux/arm64 -t sonicake .

# Produzione (sulla VPS, accanto a docker-compose.yml, .env e data/vendor/)
docker compose pull && docker compose up -d
```
