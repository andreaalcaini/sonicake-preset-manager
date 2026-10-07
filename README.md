# 🎸 Sonicake Smart Box & Pocket Master — PC Preset Manager

[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Web MIDI API](https://img.shields.io/badge/Web_MIDI-Supported-00E5FF?logo=midi&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
[![Web Bluetooth](https://img.shields.io/badge/Web_Bluetooth-BLE_GATT-0082FC?logo=bluetooth&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
[![Tone3000 API](https://img.shields.io/badge/Tone3000-Neural_Amp_Modeler-FF0080)](https://tone3000.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Applicazione desktop professionale per **Sonicake Smart Box (QME-20)** e **Pocket Master (QME-10)**.

Sviluppata per sostituire e superare l'app mobile **SonicLink**, offre un'interfaccia skeuomorfica stile Neural DSP Cortex / Helix, connettività bidirezionale sia **USB MIDI** che **Bluetooth BLE wireless**, gestione separata della **memoria interna file (5 profili Clone NAM + 5 User Cabinet IR)**, integrazione con **Tone3000**, accordatore cromatico in tempo reale, drum machine con tap tempo, e la modalità **Stage Mode** ad alta visibilità per suonare dal vivo.

---

## ⚡ Caratteristiche Principali

### 1. Connettività Doppia: USB MIDI & Bluetooth BLE
* **USB MIDI Diretto:** Rilevamento istantaneo su Windows, macOS e Linux tramite standard Web MIDI API.
* **Bluetooth BLE Wireless:** Connessione al servizio GATT proprietario Sonicake (`03b80e5a-ede8-4b33-a751-6ce34ec4c700`) senza bisogno di dongle o driver proprietari.
* **Sincronizzazione Bidirezionale:** Ogni rotazione di potenziometro o cambio di effetto viene trasmesso alla pedaliera in tempo reale via SysEx con calcolo automatico del checksum **SMBus PEC CRC8**.

### 2. Gestione Completa dei 100 Preset Hardware
* **50 Slot Utente (U01–U50):** Modificabili, rinominabili e salvabili con protezione contro la sovrascrittura accidentale.
* **50 Slot Factory (F01–F50):** Banchi sonori ufficiali di fabbrica sempre a portata di mano.
* **Preferiti con Stella (⭐):** Filtro rapido per salvare i tuoi preset preferiti nei segnalibri.
* **Scambio di Posizione (Swap 🔁):** Riordina la tua scaletta per i concerti scambiando di posto due preset con un click.
* **Import / Export Multi-Formato:**
  * **`.prst` nativo:** file binario ufficiale da 527 byte compatibile con l'app mobile SonicLink.
  * **`.json` completo:** formato human-readable compatibile con PocketEdit ed editor web.
  * **Backup completo:** salva tutti i 50 preset utente in un unico file per ripristinarli quando vuoi.

### 3. Gestione Memoria File Interni (5 Clone NAM + 5 User IR) & Variazioni Tone3000
* **Pulsante dedicato `⚡ Tone3000 & Memoria`:**
  * Permette di gestire i **10 slot della memoria file interna** della Smart Box:
    * **5 Slot Clone AMP / NAM (901–905):** Modelli Neural Amp Modeler proprietari.
    * **5 Slot User Cabinet IR (416–420):** Risposte all'impulso `.wav` per le casse.
  * **Zero interferenze con i preset:** Salvare o sostituire un file nella memoria interna lavora unicamente sui 10 slot hardware, **senza intaccare o sovrascrivere i tuoi 50 preset utente**!
  * **Caricamento file da PC:** Puoi caricare direttamente file locali `.nam` e `.wav` dal tuo computer.
  * **Libreria Online Tone3000 & Selettore Variazioni del Creatore:** Cerca tra migliaia di catture NAM e cabinet IR sul cloud. Quando selezioni un tone, puoi **scegliere tra tutte le variazioni caricate dal creatore** (es. Clean, Crunch, Lead, canali differenti o microfonazioni SM57/R121) e salvare la variazione desiderata direttamente nello slot di memoria interna scelto!

### 4. Condivisione Preset 1-Click (Link Web & File Bundle `.sonicbundle`)
* **Pulsante `🔗 Condividi` (Ctrl+Shift+S):**
  * **Link Diretto di Condivisione (1-Click URL):** Genera un link web sicuro che racchiude tutta la catena degli effetti, i parametri e le informazioni del modello Tone3000. Puoi incollarlo ovunque (WhatsApp, Discord, forum).
  * **File Bundle `.sonicbundle`:** Scarica un pacchetto completo per archiviare o scambiare preset con altri chitarristi.
  * **Richiesta Slot di Destinazione su Apertura:** Quando un utente apre un link o importa un file bundle contenente un modello Tone3000 (Clone NAM o IR), l'applicazione mostra un dialogo interattivo chiedendo **in quale dei 5 slot della memoria interna hardware** si desidera salvare il modello scaricato, applicando poi la catena all'istante senza toccare gli altri preset!

### 5. Rack Effetti Interattivo & Manopole Rotary 270°
* **9 Moduli del segnale:** `NR` (Noise Gate), `FX1` (Comp/Wah), `DRV` (Overdrive/Dist/Fuzz), `AMP` (Amplificatori/NAM), `IR` (Cabinet), `EQ` (Equalizzatore), `FX2` (Modulazioni/Pitch), `DLY` (Delay), `RVB` (Riverberi).
* **Riordinamento del segnale:** Sposta qualsiasi modulo avanti o indietro per creare catene personalizzate (es. Delay prima del Riverbero, Chorus prima del Drive, ecc.).
* **Potenziometri Skeuomorfici:** Controllo a trascinamento verticale fluido, supporto alla rotellina del mouse e doppio click per digitare il valore esatto.

### 5. Modalità Palco ad Alta Visibilità (🎤 Stage Mode)
* Schermata a tutto schermo ad alto contrasto per concerti e prove:
  * Codice e nome preset giganti visibili a metri di distanza.
  * Mattonelle LED grandi dei 9 moduli con stato On/Bypass cliccabile al volo.
  * Pulsanti di navigazione `◀ PREV` e `NEXT ▶` azionabili con i tasti freccia della tastiera o pedaliere footswitch esterne.
  * Accesso istantaneo all'accordatore.

### 6. Accordatore Cromatico in Tempo Reale
* Analisi audio in tempo reale ad alta precisione tramite algoritmo di autocorrelazione Web Audio.
* **Selettore sorgente audio:** Puoi selezionare direttamente l'ingresso USB della Sonicake Smart Box o la tua scheda audio.
* Ago dei centesimi calibrato (-50 a +50 cents) e luce verde neon quando la corda è intonata a 440 Hz.

### 7. Drum Machine Integrata & Tap Tempo
* 100 ritmi di batteria suddivisi in 8 generi (Rock, Pop, Blues, Jazz, Funk, Elettronica, World, Metronomo).
* Slider BPM (40–250) con pulsante Tap Tempo e sintetizzatore audio integrato.

### 8. Generatore Intelligente di Suoni (✨ Smart Tone)
* Genera istantaneamente preset bilanciati per stili iconici: *Texas Blues, Dream Clean & Ambient, 80s Sunset Strip, Djent Modern Metal, Funk Rhythm, Psych Rock Fuzz*.

---

## 🚀 Installazione e Avvio Rapido

### Requisiti
* [Node.js](https://nodejs.org/) (versione 18 o superiore consigliata)
* Browser con supporto a Web MIDI e Web Bluetooth (**Google Chrome**, **Microsoft Edge**, **Brave** o **Opera**)

### Avvio su PC:
1. Scarica o clona il repository:
   ```bash
   git clone https://github.com/your-username/sonicake-preset-manager.git
   cd sonicake-preset-manager
   ```
2. Installa le dipendenze:
   ```bash
   npm install
   ```
3. Avvia il server di sviluppo:
   ```bash
   npm run dev
   ```
4. Apri il browser all'indirizzo: `http://localhost:5173` (oppure fai doppio click su `start.bat` su Windows).

---

## ⌨️ Scorciatoie da Tastiera

| Tasto | Azione |
| :--- | :--- |
| `Ctrl + Shift + S` | Condividi preset (Genera Link web 1-click o file bundle con Tone3000) |
| `Ctrl + S` | Salva preset nello slot di memoria scelto |
| `Ctrl + Z` | Annulla modifica parametro (Undo) |
| `Ctrl + Y` | Ripristina modifica (Redo) |
| `Alt + A` | Alterna confronto sonoro A / B |
| `F` | Attiva / Disattiva Live Stage Mode a schermo intero |
| `Freccia Su / Giù` | Seleziona preset precedente o successivo |
| `?` | Mostra la guida completa e scorciatoie |
| `Spazio` | Tap Tempo nella Drum Machine |

---

## 📦 Come Pubblicare il Progetto su GitHub

Se desideri caricare il progetto sul tuo account GitHub per renderlo open-source:

1. Crea un nuovo repository vuoto su [GitHub](https://github.com/new) (es. `sonicake-preset-manager`).
2. Apri il terminale nella cartella del progetto ed esegui:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Sonicake Smart Box PC Preset Manager v1.0"
   git branch -M main
   git remote add origin https://github.com/TUO-USERNAME/sonicake-preset-manager.git
   git push -u origin main
   ```

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Consulta il file [`LICENSE`](LICENSE) per ulteriori dettagli.
Creato con passione per la community di chitarristi e bassisti Sonicake! 🎸
