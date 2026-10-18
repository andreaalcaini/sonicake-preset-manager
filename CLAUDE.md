# Sonicake Preset Manager & Tone3000 Cloud Explorer

Desktop and mobile progressive web manager for the **Sonicake Smart Box (QME-20)** multi-effects pedalboard and **Pocket Master**.
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
- **Backend Compiler Microservice**: Python Flask (`server/server.py`) wrapping `5868USB.dll` (`convertNamToNambAtPath`) for Neural Amp Modeler (.nam) compilations and reading Sonicake Manager AppData.
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
│   │   ├── compiler-bridge.js  # Bridge client for server.py + static verified models (/models/*.clo)
│   │   └── tone3000.js         # Tone3000 Supabase REST API client
│   └── styles/
│       ├── main.css            # Base Tailwind and hardware variables
│       └── tone3000.css        # Tone3000 modal and dropzone styling
├── public/
│   └── models/                 # Pre-compiled 2,696-byte Zero-Freeze verified models (served statically)
│       ├── marshall_1959.clo
│       ├── petersburg_thunder.clo
│       └── slow30_high_gain.clo
├── server/
│   ├── server.py               # Flask microservice (port 8080)
│   ├── 5868USB.dll             # Sonicake native C++ compiler library
│   ├── verified/               # Verified .clo binaries
│   └── cache/                  # Converted models cache
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

### Backend Microservice (Optional - only needed for raw .nam compilation or AppData sync)
```bash
# Run Flask compiler bridge on port 8080
python server/server.py
```

*Note:* Pre-compiled verified models work directly through Vite via `/models/*.clo` without needing `server.py` running!

---

## Critical Hardware Rules & Safety Constraints

> [!CAUTION]
> Violating these rules will cause MCU DMA FIFO overflow, pedal lockup, firmware freeze, or corruption of flash memory. Always verify protocol alterations before asking Andrea to test.

1. **Clone AMP Low Model Binary Format (2,696 bytes)**:
   - The Smart Box QME-20 internal flash memory accepts **strictly** the 2,696-byte Low Model format (never raw 7,980-byte or 55,636-byte `.namb` files).
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

4. **Preset Protection**:
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
