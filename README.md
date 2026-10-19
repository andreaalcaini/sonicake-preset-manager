<div align="center">

# 🎛️ Sonicake Studio Preset Manager

**Editor visivo e Preset Manager moderno, gratuito e open-source per pedaliere Sonicake.**  
*Gestisci la catena degli effetti, carica sulla pedaliera catture NAM e IR dalla libreria [TONE3000](https://www.tone3000.com) e controlla la tua pedaliera via USB o Bluetooth BLE da PC, Mac, tablet e smartphone.*

[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Touch-cyan.svg)](#)
[![Web MIDI](https://img.shields.io/badge/Web%20MIDI-Supported-emerald.svg)](#)
[![Web Bluetooth](https://img.shields.io/badge/Web%20Bluetooth-BLE%20Wireless-blue.svg)](#)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v3.4-38bdf8.svg)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg)](https://vitejs.dev/)

</div>

---

## 📖 Panoramica del Progetto

Le pedaliere **Sonicake** (tutta la gamma multi-effetto) offrono timbriche eccellenti con supporto ai profili **Neural Amp Modeler (.nam)** e risposte all'impulso **IR (.wav)**. Tuttavia, non dispongono di un editor desktop ufficiale completo e multipiattaforma.

**Sonicake Studio Preset Manager** nasce per colmare questa esigenza: un'applicazione web nativa, velocissima, con estetica studio hardware (ispirata a *Quad Cortex*, *UAD* e *Ableton*), senza pubblicità e **100% gratuita**. 

Funziona direttamente dal browser sfruttando gli standard moderni **Web MIDI** e **Web Bluetooth**, senza dover installare driver o software di terze parti.

---

## ✨ Funzionalità Principali

### 🎛️ 1. Editor Visivo della Catena Effetti
- **9 Blocchi Modellati in Tempo Reale:** NR (Noise Gate), WAH/FX1, COMP/DRV, PRE/AMP, CAB/IR, EQ, MOD/FX2, DLY, REV.
- **Riconfigurazione del Segnale:** Attiva, disattiva in bypass e riordina i blocchi con un tocco.
- **Supporto Touch Nativo per Tablet & Smartphone:** Le manopole rotative graduate (rotary knobs) rispondono al trascinamento touch su iPad, tablet Android e telefoni.
- **Confronto Istantaneo A/B:** Ascolta istantaneamente la differenza tra il suono originale e le modifiche con un solo clic o con la scorciatoia `Alt + A`.
- **Annulla / Ripristina (Undo/Redo):** Storico illimitato delle modifiche con `Ctrl + Z` e `Ctrl + Y`.

### 🌐 2. Libreria TONE3000 (Powered by [TONE3000](https://www.tone3000.com))
- **Libreria TONE3000 tramite la sua [API pubblica](https://www.tone3000.com/api):** Accedi con il tuo account TONE3000 (email + codice) e sfoglia il catalogo completo di amplificatori NAM e casse IR; nel sito trovi anche i tuoi preferiti, i download, le tue catture e le novità. Le catture NAM A2, che la pedaliera non può caricare, vengono nascoste.
- **Selettore Variazioni del Creatore:** Quando selezioni un tone, visualizzi il menu con tutte le variazioni caricate dall'autore (es. *Clean, Crunch, Lead, High Gain, SM57, R121*) per scaricare esattamente il timbro che desideri.
- **Gestione Memoria File Interni (5 NAM + 5 IR):** I file scaricati vengono scritti negli slot hardware dedicati (Slot NAM 1–5 e Slot IR 1–5), **senza rischiare di sovrascrivere o alterare i tuoi 50 preset utente**.
- **Caricamento Locale:** Trascina o carica direttamente i tuoi file `.nam` o `.wav` dal computer negli slot interni.

### 🔗 3. Condivisione Preset 1-Click (Web Link & File Bundle)
- **Condivisione Istantanea via Link:** Genera con un clic un URL compatto e condivisibile contenente l'intera catena e tutti i parametri.
- **File `.sonicbundle`:** Pacchetto completo che include la catena degli effetti e il riferimento alla cattura usata: per le catture TONE3000 solo il tone (titolo, creatore, licenza), mai il file. Chi apre il preset ottiene la cattura da TONE3000 con il proprio account.
- **Scelta Slot all'Importazione:** Chi apre il link o importa il bundle viene guidato nella scelta dello slot della memoria interna (NAM o IR) in cui salvare il file, applicando la catena in modo sicuro.

### 📶 4. Doppia Connettività (USB MIDI & Wireless Bluetooth BLE)
- **USB MIDI Diretto:** Connessione stabile via cavo USB Type-C con rilevamento automatico della pedaliera.
- **Bluetooth BLE Wireless:** Connettiti al modulo Bluetooth nativo della pedaliera per modificare i suoni comodamente senza fili.
- **Sincronizzazione Bidirezionale:** Ogni rotazione hardware o modifica software viene scambiata istantaneamente con calcolo del checksum di controllo (*SMBus PEC CRC8*).

### 💾 5. Gestione Completa dei 100 Preset Hardware
- **50 Slot Utente (U01–U50):** Rinomina, modifica e salva i tuoi suoni con protezione da sovrascritture accidentali.
- **50 Slot Factory (F01–F50):** Banchi di fabbrica originali sempre consultabili e richiamabili.
- **Carica su Slot Libero:** Invia il preset attivo a qualsiasi slot (da U01 a U50) con anteprima e conferma.
- **Backup & Ripristino:** Esporta e importa l'intero banco da 50/100 preset in formato nativo `.prst` o `.json`.

### 🧰 6. Toolkit Integrato per Musicisti
- **Curva Grafica Interattiva per l'Equalizzatore (EQ Visualizer):** Grafico studio della risposta in frequenza (20 Hz - 20 kHz, -15 a +15 dB) con nodi interattivi trascinabili per scolpire il suono visivamente in tempo reale.
- **Scaletta Live / Setlist Manager (<kbd>Alt + S</kbd>):** Organizza scalette per concerti e prove band. Associa i preset della pedaliera ai brani con note, tonalità e BPM, e scorri la scaletta direttamente in Live Stage Mode.
- **Player Basi (Backing Track Practice Studio):** Carica basi MP3/WAV, rallenta il tempo senza alterare l'intonazione (0.5x–1.5x) e sfrutta il loop A–B per perfezionare gli assoli.
- **Progressive Web App (PWA & Offline):** Installabile direttamente come applicazione nativa standalone su Windows, macOS, Android e iOS; funziona anche offline senza rete internet.
- **Accordatore Cromatico a Schermo:** Riconoscimento accurato della frequenza, ago dei centesimi (-50 a +50 cent) e LED verde di intonazione a 440 Hz con selezione della sorgente audio.
- **Drum Machine con 100 Ritmi:** Batterie campionate divise per genere (Rock, Blues, Funk, Jazz, Metal, Pop, Elettronica, Metronomo) con Tap Tempo e regolazione BPM da 40 a 250.
- **Modalità Live Stage:** Interfaccia a pieno schermo ad altissimo contrasto per palchi e sale prove, con navigazione a pedale (Footswitch A/B/C) azionabile anche con i tasti freccia.
- **Smart Tone Generator:** Generatore guidato di suoni basato su stili musicali celebri (*Texas Blues, Ambient Clean, Modern Djent, 80s Rock*).

---

## 🖥️ Compatibilità Browser

L'applicazione utilizza le API native del W3C **Web MIDI** e **Web Bluetooth**.

| Piattaforma | Browser Supportati | Connessione |
| :--- | :--- | :--- |
| **Windows / macOS / Linux** | Google Chrome, Microsoft Edge, Brave, Opera | USB MIDI & Bluetooth BLE |
| **Android (Tablet / Smartphone)** | Google Chrome, Edge, Brave | USB OTG & Bluetooth BLE |
| **iPadOS / iOS** | Bluefy Browser, WebBLE Browser | Bluetooth BLE |

> [!NOTE]  
> Firefox e Safari (su desktop) non integrano nativamente la Web MIDI API senza plugin esterni. Si consiglia l'uso di un browser basato su Chromium.

---

## 🗂️ Repository

| Percorso | Contenuto |
|---|---|
| [`frontend/`](frontend/) | Web app (Vite, ES modules, PWA): editor, libreria TONE3000, protocollo Web MIDI / Web Bluetooth; test con la pedaliera virtuale in [`frontend/test/`](frontend/test/) |
| [`backend/`](backend/) | Compiler NAM → Clone AMP (Flask) che in produzione serve anche il sito. [Guida](backend/README.md) |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | Protocollo della pedaliera: frame SysEx, comandi, flash, export/import, rinomina |
| [`tools/`](tools/) | Script di reverse engineering (storici, non usati dal sito) |
| [`data/`](data/) | Volume runtime: cache delle conversioni e file vendor (mai committato) |

Architettura, porte e variabili d'ambiente: [STRUCTURE.md](STRUCTURE.md). Linee guida per agenti AI e sviluppatori: [AGENTS.md](AGENTS.md).

---

## 🚀 Avvio Rapido & Sviluppo Locale

### Prerequisiti
- [Node.js](https://nodejs.org/) 22 o superiore, con `npm`
- [Python](https://www.python.org/) 3.12+ per il compiler NAM (`pip install -r backend/requirements.txt`)

### Installazione ed Esecuzione
```bash
git clone https://github.com/andreaalcaini/sonicake-preset-manager.git
cd sonicake-preset-manager
npm install
npm run dev        # compiler (:8080) + sito con hot reload (https://localhost:5173)
```

Il sito usa HTTPS anche in locale (obbligatorio per Web MIDI e Web Bluetooth) ed è raggiungibile dagli altri dispositivi della rete. Solo il sito: `npm run dev:frontend`; solo il compiler: `npm run dev:backend`.

### Test (nessuna pedaliera necessaria)
```bash
npm test           # motore e protocollo contro la pedaliera virtuale
npm run test:all   # + compiler (Python) + interfaccia (Chrome headless)
```

### Build per la Produzione
```bash
npm run build      # sito in frontend/dist/
```

---

## ⌨️ Scorciatoie da Tastiera Studio

| Scorciatoia | Descrizione |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Salva il preset attivo sulla pedaliera |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Condividi preset (Crea Link o Bundle con NAM/IR) |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Annulla ultima modifica (Undo) |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Ripristina modifica (Redo) |
| <kbd>Alt</kbd> + <kbd>A</kbd> | Confronto sonoro rapido A / B |
| <kbd>Alt</kbd> + <kbd>S</kbd> | Apri Scaletta Live / Setlist Manager |
| <kbd>↓</kbd> / <kbd>↑</kbd> | Passa al preset successivo o precedente |
| <kbd>F</kbd> | Attiva la modalità Live Stage a pieno schermo |
| <kbd>?</kbd> | Mostra la finestra Guida e scorciatoie |
| <kbd>Spazio</kbd> | Tap Tempo (quando la Drum Machine è aperta) |

---

## 📦 Deploy in Produzione

Ogni push su `master` compila con GitHub Actions l'immagine Docker multi-arch (`linux/amd64` + `linux/arm64`) con sito e compiler NAM, e la pubblica su `ghcr.io/andreaalcaini/sonicake-preset-manager`.

Sul server bastano `docker-compose.yml`, un eventuale `.env` (vedi `.env.example`) e i file vendor Sonicake in `data/vendor/` (vedi [backend/README.md](backend/README.md)):

```bash
docker compose pull && docker compose up -d
```

Il sito è esposto tramite Cloudflare Tunnel (rete `cloudflared-mesh`, alias `sonicake.mesh`).

---

## 🤝 Contributi

I contributi da parte della community di musicisti e sviluppatori sono i benvenuti!
1. Fai un **Fork** del progetto.
2. Crea un branch per la tua funzionalità (`git checkout -b feature/NuovoModulo`).
3. Fai il commit delle tue modifiche (`git commit -m "Aggiunto supporto a nuovo parametro"`).
4. Esegui il push sul tuo branch (`git push origin feature/NuovoModulo`).
5. Apri una **Pull Request**.

---

## ⚖️ Disclaimer & Licenza

* Questo software è un progetto open source sviluppato in modo indipendente dalla community e **non è affiliato, sponsorizzato o supportato da Sonicake Technology**.
* Tutti i marchi, i loghi e i nomi di prodotto registrati appartengono ai rispettivi proprietari.
* Rilasciato sotto licenza [MIT](LICENSE). Realizzato con passione per la community di chitarristi e bassisti! 🎸
