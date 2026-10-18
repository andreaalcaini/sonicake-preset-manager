# Contributing to Sonicake Pedaliera Preset Manager

Thank you for your interest in contributing to **Sonicake Pedaliera Preset Manager**! 🎉

This project is an open-source, community-driven desktop editor designed to provide guitarists and bassists with the ultimate tone design experience for **all Sonicake multi-effects pedals** (tested on QME-20 and QME-10).

---

## 🛠️ Development Setup

1. **Prerequisites:**
   - [Node.js](https://nodejs.org/) (version 18 or newer recommended).
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
   Open `http://localhost:5173` in your browser.

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## 💡 How You Can Help

- **Model & AlgID Verification:** Help verify effect parameters, algorithm mappings, and EQ frequencies against physical hardware firmware versions.
- **Tone3000 Cloud Enhancements:** Expand Neural Amp Modeler search filters, tags, and cloud preview.
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
