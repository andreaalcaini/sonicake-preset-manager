# Sonicake Preset Manager & Tone3000 Cloud Explorer

Desktop and mobile progressive web manager for **all Sonicake multi-effects pedals** ("Pedaliera"; reference hardware: QME-20 and Pocket Master).
UI text always says "Pedaliera", never a specific model name.
Communicates directly with the physical pedal via **Web MIDI** (USB) and **Web Bluetooth** (BLE), without requiring proprietary desktop software.

---

## Team & Roles

- **Andrea (@andreaalcaini)**: Project creator and repository owner. Possesses the physical Sonicake QME-20 pedalboard on his desk for live hardware testing, BLE/MIDI verification, and audio auditing.
- **Mattia**: Collaborator developing features, tests, and documentation. Does not have the physical hardware connected.
- **Claude Code**: Pair-programming assistant. Operates via the CLI (`claude`), writes tests, documentation, refactors, and feature improvements adhering strictly to hardware safety rules.

---

## Tech Stack & Architecture

- **Frontend**: Vanilla ES Modules (no heavy framework overhead, near-zero latency for MIDI streams).
- **Bundler & Dev Server**: Vite with `@vitejs/plugin-basic-ssl` (HTTPS required for Web Bluetooth and Web MIDI in browsers).
- **Styling**: Tailwind CSS + custom CSS (`src/styles/`), designed to faithfully replicate the official **SonicLink** mobile app aesthetic (deep slate chassis `#141518`, electric Sonicake orange `#ff6600` / `#f97316`, rounded hardware cards, responsive for smartphone, tablet, and PC).
- **Backend Compiler Microservice**: Python Flask (`server/server.py`) wrapping `5868USB.dll` (`namConvertCloDataWithProcess`) for Neural Amp Modeler (.nam) → CLO conversion and reading Sonicake Manager AppData.
- **Hardware Protocols**: Web MIDI API (`navigator.requestMIDIAccess`) and Web Bluetooth API (`navigator.bluetooth.requestDevice`).

---

## Directory Map

```text
├── src/
│   ├── core/
│   │   ├── connection.js       # MIDI & BLE transport, SysEx send/receive, Android DataView offset fix
│   │   ├── protocol.js         # SysEx framing, CRC16 (VTSI), CRC8 SMBus PEC (0x07), Low Model converter
│   │   └── preset-engine.js    # 50 preset state machine, flash streaming (Clone AMP & IR), audition
│   ├── components/
│   │   ├── Tone3000Modal.js    # Memory Manager (10 slots), Cloud Explorer, Drag&Drop, SysEx progress
│   │   ├── ModuleEditor.js     # Effect chain editor, Factory/Clone toggle, Tone3000 replacement
│   │   ├── SignalChain.js      # 9-module chain routing & order
│   │   ├── PresetListModal.js  # 50 presets manager (U01-U50)
│   │   ├── BackupModal.js      # Backup & Restore
│   │   └── ...                 # Tuner, Drums, Setlist, Share modals
│   ├── services/
│   │   ├── compiler-bridge.js  # Bridge client for server.py (NAM → 2,696-byte Low Model)
│   │   └── tone3000.js         # Tone3000 Supabase REST API client
│   └── styles/
│       ├── main.css            # Base Tailwind and hardware variables
│       └── tone3000.css        # Tone3000 modal and dropzone styling
├── server/
│   ├── server.py               # Flask microservice (port 8080)
│   ├── 5868USB.dll             # Sonicake native C++ compiler library (Windows backend)
│   ├── nam2clo/                # ARM64 converter: nam2clo.c, JUCE shim, Android stubs, extract-vendor.ps1
│   └── cache/                  # Converted models cache
├── data/                       # Runtime volume (/app/data): cache + vendor/ files, never committed
├── Dockerfile                  # Multi-arch image: Vite site + compiler API (bionic runtime + nam2clo)
├── docker-compose.yml          # Production service (ghcr.io image, port 3000, ./data volume)
├── .github/workflows/deploy.yml # Build & push linux/amd64 + linux/arm64 image to GHCR
├── vite.config.js              # Vite server (HTTPS basicSsl, LAN exposure, /api proxy to 8080)
└── package.json
```

---

## Key Development Commands

### Frontend
```bash
# Start Vite development server (HTTPS enabled, exposed on 0.0.0.0:5173 for LAN/mobile)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### NAM → Pedal pipeline (same as Sonicake Manager, verified byte-for-byte)

1. `.nam` (Tone3000 `model_url` or local file) → `POST /api/convert-nam`.
2. `namConvertCloDataWithProcess(ctx, inWav, outWav, namPath, cloOut, int* outSize, int* progress, int* total)` plays `nam_input_wav.wav` (bundled in `Sonicake Manager\data\flutter_assets\assets\wavs\`) through the model and fits an **8,840-byte CLO** (~15-20s, async worker; done when `*outSize == 8840`, error when progress/total `== -2`).
3. `convert_clo_to_low()` → **2,696-byte Low Model** (identical to the captured Sonicake Manager upload `server/transfer2_clone.bin`).
4. Frontend `buildClonePayload()` + `flashCloneToPedal()` → 146 SysEx packets.

Two interchangeable backends (`server.py` picks one, `/api/health` reports `compiler_backend`):
- **Windows** (`dll`): Sonicake Manager's `5868USB.dll` in-process. `SONICAKE_LIB_PATH` / `SONICAKE_NAM_INPUT_WAV` override the paths.
- **Linux ARM64** (`nam2clo`, production on the Oracle VPS): the SonicLink Android build of the same library (`lib5868USB.so`, arm64) run by `server/nam2clo/nam2clo` inside the root `Dockerfile`, which ships a minimal Android bionic runtime (linker64 + libc/libm/libdl from the AOSP redroid image) and stubs for liblog/OpenSL ES/EGL/GLES/libandroid. `juce_android_shim.cpp` interposes `juce::File::getSpecialLocation` (otherwise resolved via JNI → crash without a Java VM). Output is byte-identical to the SonicLink phone app; vs. the Windows DLL it differs by ~0.07% (ARM vs x86 float math). One process per conversion, `NAM2CLO_WORKERS` in parallel (default 2), `NAM2CLO_TIMEOUT` seconds (default 180).
- Vendor files (`lib5868USB.so`, `libc++_shared.so`, input WAV) are extracted from the SonicLink APK by `server/nam2clo/extract-vendor.ps1` into `data/vendor/` and mounted at runtime: **never committed, never in the image**. CI links `nam2clo` against `stubs/lib5868usb_link_stub.cpp` instead.
- Deploy: GitHub Actions builds `ghcr.io/andreaalcaini/sonicake-preset-manager` (amd64 + arm64) on every push to master; the VPS runs `docker compose pull && docker compose up -d`. The converter works on arm64 only (amd64 → compiler offline). HTTPS comes from the reverse proxy in front of port 3000.

### Backend Microservice (required for .nam → Clone AMP conversion)
```bash
# Run Flask compiler bridge on port 8080
python server/server.py
```

---

## Critical Hardware Rules & Safety Constraints

> [!CAUTION]
> Violating these rules will cause MCU DMA FIFO overflow, pedal lockup, firmware freeze, or corruption of flash memory. Always verify protocol alterations before asking Andrea to test.

1. **Clone AMP Low Model Binary Format (2,696 bytes)**:
   - The pedal internal flash memory (verified on QME-20) accepts **strictly** the 2,696-byte Low Model format (never raw 7,980-byte or 55,636-byte `.namb` files).
   - Format: Magic `VTSI`, size `2696` at offset `0x04`, `extendSize = 2560` at offset `0x14`, `layerSize = 512` at offset `0x84`, CRC16 starting from offset 12 stored at offset `0x08`.
   - Function: `convertCLOToLowModel()` in `src/core/protocol.js` handles conversion in the browser.

2. **Payload Markers & Identifiers**:
   - **Clone AMP**: Total payload is **2,770 bytes**. Byte 0 = `0x11`, **Byte 1 = `0x25`** (Clone AMP identifier), Byte 6 = `slotIndex` (0 to 4), Bytes 10-41 = name (ASCII null-padded), Bytes 74-2770 = Low Model data.
   - **User IR**: Total payload is **2,122 bytes**. Byte 0 = `0x11`, **Byte 1 = `0x21`** (User IR identifier), Byte 6 = `slotIndex` (0 to 4), Bytes 74-2122 = 512 normalized 32-bit float samples at 48kHz.

3. **SysEx Streaming & DMA Throttle**:
   - Data is chunked into **19-byte packets** (146 packets for Clone AMP, 112 packets for IR).
   - Each chunk is framed into SysEx with SMBus PEC CRC8 (polynomial `0x07`).
   - A minimum delay of **8ms** between packets is strictly required to prevent hardware buffer overrun.
   - After flashing the last packet, wait **1.2s** settling delay before sending any new commands (hardware writes to SPI Flash sector).

4. **Native Preset Export / Import (used for swapping presets)** — verified on captured Sonicake Manager USB traffic, our `buildStreamingFlashPackets()` reproduces it 27/27 byte-for-byte:
   - Export request: one frame with payload `12 4F <slot0> 00 00 00` (`slot0` = 0-based, P02 = `01`).
   - Export response: 27 × 19-byte frames = 508 bytes: `12 4F FF FF FF FF` + 502 preset bytes (name at offset 6). USB delivers it reassembled by `connection.js`, BLE frame by frame.
   - Import: same 508 bytes with header `11 4F <slot0> 00 00 00`, streamed in 19-byte frames; the pedal ACKs every frame with `14 08 00` — wait for it (retransmit after ~1s), never blast.
   - `.prst` files = 25-byte header + the same 502 preset bytes.
   - Swap = export A + export B, import B→A, import A→B (`presetEngine.swapPresets`); bytes are copied untouched, never rebuilt from decoded parameters.

5. **Signal Chain Routing**: `DRV-AMP-IR-EQ` is a fixed block (never split or reordered). Only NR, FX1, FX2, DLY, RVB move, hopping over the block as one unit: 6 units → the 720 entries of `chainOrderCommands`. Use `moveChainModule()` (protocol.js); `setChainOrder()` rejects any routing not in the library.

6. **Preset Protection**:
   - The 10 internal memory slots (5 Clone AMP + 5 IR) reside in separate hardware flash banks. Flashing these slots **must never** touch, modify, or overwrite the 50 user presets (U01-U50).

---

## Design & UI Guidelines

- **SonicLink Alignment**: Replicate the look and feel of the official SonicLink smartphone application:
  - Backgrounds: Dark studio metals (`#121316`, `#18191e`).
  - Brand Accent: Sonicake electric orange (`#ff6600` / `#f97316`).
  - Active indicators: Glowing green LEDs (`#10b981`), amber IR markers (`#f59e0b`).
  - Ergonomics: 100% responsive, touch targets $\ge 44\text{px}$, no horizontal scrollbars on mobile.
- **Bluetooth BLE**: Deferred auto-reconnect logic; keep BLE connection simple and direct (`connection.connectBLE()`).

---

## Git Conventions

- **NEVER track or commit**:
  - `prompt.txt` or `prompt*.txt`
  - `dist/` build artifacts
  - `server/cache/*` binary dumps
  - `__pycache__` and Python virtualenvs
- Always keep commits atomic and descriptive (e.g. `feat: ...`, `fix: ...`, `docs: ...`).
