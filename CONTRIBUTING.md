# Contributing to Sonicake Pedaliera Preset Manager

Thank you for your interest in contributing to **Sonicake Pedaliera Preset Manager**! 🎉

This project is an open-source, community-driven desktop editor designed to provide guitarists and bassists with the ultimate tone design experience for **all Sonicake multi-effects pedals** (tested on QME-20 and QME-10).

---

## 🛠️ Development Setup

1. **Prerequisites:**
   - [Node.js](https://nodejs.org/) 22 or newer.
   - [Python](https://www.python.org/) 3.12+ for the NAM compiler (`pip install -r backend/requirements.txt`).
   - Google Chrome, Microsoft Edge, Brave, or Opera (required for Web MIDI and Web Bluetooth support).

2. **Clone the repository:**
   ```bash
   git clone https://github.com/andreaalcaini/sonicake-preset-manager.git
   cd sonicake-preset-manager
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```
   Starts the NAM compiler (`backend/`, port 8080) and the site (`frontend/`) together. Open `https://localhost:5173` in your browser.

5. **Build for production:**
   ```bash
   npm run build      # site in frontend/dist/
   ```

6. **Run the tests (no pedal needed):**
   ```bash
   npm test              # engine + protocol against a virtual pedal
   npm run test:all      # + compiler server (Python) + interface (headless Chrome)
   ```
   CI runs the same tests before publishing the Docker image. AI agents and contributors: read [AGENTS.md](AGENTS.md), [STRUCTURE.md](STRUCTURE.md) and, for anything that talks to the pedal, [docs/PROTOCOL.md](docs/PROTOCOL.md) first.

---

## 💡 How You Can Help

- **Model & AlgID Verification:** Help verify effect parameters, algorithm mappings, and EQ frequencies against physical hardware firmware versions.
- **TONE3000 library:** Improvements within the [TONE3000 API](https://www.tone3000.com/api) terms and design requirements (free tier: Select / Load Tone flows and the bounded lists only).
- **UI / Skeuomorphic Design:** Improve knob rendering, rack animations, and stage mode visibility.
- **Documentation & Localization:** Translations (English, Spanish, Italian, German, Japanese, Chinese).

---

## 🐛 Reporting Issues

If you find a bug or unexpected behavior:
1. Open a new issue in the GitHub repository.
2. Specify your **Operating System** (Windows 10/11, macOS, Linux).
3. Specify your **Connection Type** (USB MIDI or Bluetooth BLE).
4. Specify your **Browser** and version (Chrome 120+, Edge, etc.).
5. Include relevant logs from the expandable **Hardware SysEx Console** at the bottom of the screen.

---

## 📄 License

By contributing to this repository, you agree that your contributions will be licensed under the [MIT License](LICENSE).
