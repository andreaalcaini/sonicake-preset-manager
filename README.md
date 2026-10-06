# Sonicake Smart Box (QME-20) - PC Preset Manager

Applicazione desktop per PC Windows per la gestione avanzata dei preset, il sound design e l'editing in tempo reale della pedaliera multieffetto **Sonicake Smart Box (QME-20)** e **Pocket Master**.

L'applicazione replica e supera tutte le funzionalità dell'app mobile **SONICLINK**, offrendo un'interfaccia skeuomorfica professionale stile Neural DSP Cortex / Helix, connettività sia **USB MIDI** che **Bluetooth BLE**, e l'integrazione cloud con **Tone3000 (Neural Amp Modeler)**.

---

## 🚀 Avvio Rapido

Puoi avviare l'applicazione in due modi semplici:

### Metodo 1: Doppio click sul file `start.bat`
Fai doppio click su `start.bat` nella cartella del progetto. Verrà avviato il server locale e si aprirà automaticamente il browser predefinito all'indirizzo `http://localhost:5173`.

### Metodo 2: Da terminale
```bash
npm run dev
```
Apri poi Chrome o Edge all'indirizzo: `http://localhost:5173`.

> **Nota di compatibilità:** Usa **Google Chrome** o **Microsoft Edge** per supportare nativamente le API **Web MIDI** (USB) e **Web Bluetooth** (BLE).

---

## ✨ Funzionalità Principali

### 1. Connettività Hardware Completa
- **USB MIDI Diretto:** Rilevamento automatico del dispositivo USB `Smart Box` su Windows.
- **Bluetooth BLE Diretto:** Supporto wireless con protocollo standard Sonicake Smart Box BLE GATT (`03b80e5a-ede8-4b33-a751-6ce34ec4c700`).
- **Sincronizzazione Bidirezionale:** Ogni rotazione di manopola, cambio di effetto o bypass viene inviato in millisecondi via messaggi SysEx alla pedaliera.

### 2. Gestione Completa dei 100 Preset
- **50 Slot Utente (U01 - U50):** Modificabili e salvabili direttamente nella memoria flash della pedaliera con calcolo automatico del checksum hardware **SMBus PEC CRC8**.
- **50 Slot Factory (F01 - F50):** Consultabili e utilizzabili come base per nuovi suoni.
- **Ricerca in tempo reale:** Filtra istantaneamente i preset per nome o numero.
- **Copia & Incolla Preset:** Clona un banco sonoro in un altro slot con un click.
- **Ridenominazione rapida:** Assegna nomi personalizzati (fino a 10 caratteri).
- **Import / Export `.prst` nativo:** Supporto per il formato binario ufficiale da 527 byte compatibile con il software Sonicake Manager.
- **Backup & Ripristino Globale:** Esporta o ripristina tutti i 100 preset in un singolo file JSON.

### 3. Rack Signal Chain Interattivo
- **9 Moduli Indipendenti:** NR (Noise Gate), FX1, DRV (Overdrive/Distortion), AMP (Amplificatori), IR (Cabinet & Custom IR), EQ (Equalizzatori grafici), FX2 (Modulazioni/Pitch), DLY (Delay), RVB (Riverberi).
- **LED di stato realistici:** Indicatori luminosi verde/rosso di bypass con accensione/spegnimento istantaneo.
- **Riorganizzazione del segnale:** Sposta qualsiasi modulo avanti o indietro nella catena audio in base alle tue preferenze timbriche.
- **Modalità Factory Amp vs. Clone / NAM:** Passa con un click tra gli amplificatori classici modellati e i profili Neural Amp Modeler proprietari Sonicake (User Profile 1-5).
- **Master Patch Volume:** Slider dedicato per livellare il volume di uscita del preset (0-100).

### 4. Editor Parametri con Manopole Skeuomorfiche
- **Rotary Knobs 270°:** Manopole metalliche tornite stile hardware boutique con rotazione continua, indicatore ad arco circolare e notch luminoso.
- **Controllo drag verticale:** Trascina verso l'alto o verso il basso con il mouse per regolare il valore in modo naturale e fluido.
- **Supporto rotellina del mouse:** Scroll per una regolazione di precisione al millimetro.
- **Doppio click per digitazione:** Fai doppio click sul valore numerico per digitare direttamente il numero desiderato.
- **Libreria completa dei modelli:** Oltre 96 modelli di effetti con parametri ufficiali, unità di misura (Hz, dB, ms) e descrizioni storiche.

### 5. Confronto Sonoro A/B & Undo/Redo
- **Pulsante A/B:** Salva lo stato A e lo stato B e alternali istantaneamente con una scorciatoia (`Alt+A`) per sentire quale equalizzazione o gain funziona meglio nel mix.
- **Cronologia Undo / Redo:** Annulla (`Ctrl+Z`) o ripristina (`Ctrl+Y`) qualsiasi tweak di parametro accidentale fino a 50 passaggi.

### 6. Integrazione Cloud TONE3000 (Neural Amp Modeler)
- **Motore di ricerca in tempo reale:** Collegato via REST API al database live di **Tone3000** (`api.tone3000.com`).
- **Filtri dedicati:** Cerca Amps, Pedali, Cabs / IR, e Full Rigs (Marshall, Fender, Dumble, Friedman, Mesa Boogie, Bogner, Soldano, Vox, ecc.).
- **Caricamento 1-Click:** Clicca su *"Load to Smart Box"* su qualsiasi cattura per impostare automaticamente la modalità Clone, configurare i parametri e rinominare il preset.
- **Download diretto .NAM:** Link rapido al modello neurale originale e alla pagina ufficiale Tone3000.

### 7. Drum Machine Integrata (100 Ritmi)
- **8 Generi musicali:** Rock, Pop, Blues, Jazz, Funk, Electronic, World, Metronomo.
- **BPM e Tap Tempo:** Slider da 40 a 250 BPM, pulsante Tap Tempo con LED lampeggiante e sintetizzatore audio integrato via Web Audio per suonare a tempo senza cuffie esterne.

### 8. Accordatore Cromatico
- **Rilevamento del pitch ad alta precisione:** Riconoscimento automatico della nota suonata (Chitarra / Basso standard o cromatica).
- **Indicatore Cents & Ago:** Misuratore continuo da -50 a +50 cents con illuminazione verde neon quando la corda è perfettamente intonata.
- **Frequenza di riferimento regolabile:** Standard A4 = 440 Hz.

### 9. Console Diagnostica SysEx
- Drawer richiudibile in basso che visualizza in tempo reale tutti i messaggi esadecimali SysEx scambiati con la Smart Box, utile per diagnostica e verifica.

---

## ⌨️ Scorciatoie da Tastiera
| Tasto | Azione |
| :--- | :--- |
| `Ctrl + S` | Apri finestra di salvataggio preset sulla pedaliera |
| `Ctrl + Z` | Annulla ultima modifica (Undo) |
| `Ctrl + Y` | Ripristina ultima modifica (Redo) |
| `Alt + A` | Alterna confronto sonoro A/B |
| `Spazio` | Tap Tempo (quando il metronomo/drum machine è aperto) |

---

## 📁 Struttura del Progetto
```
sonicake-preset-manager/
├── index.html                  # Layout principale dell'applicazione
├── package.json                # Configurazione e dipendenze Vite
├── start.bat                   # Launcher automatico per Windows
├── public/
│   └── assets/images/          # 64 icone SVG ufficiali Sonicake
├── src/
│   ├── main.js                 # Entrypoint applicazione e wiring eventi
│   ├── core/
│   │   ├── connection.js       # Driver Web MIDI (USB) & Web Bluetooth (BLE)
│   │   ├── protocol.js         # Decodifica pacchetti SysEx, CRC8 SMBus PEC
│   │   ├── preset-engine.js    # Motore di stato banchi, A/B, undo/redo
│   │   └── prst-parser.js      # Parser e generatore file binari .prst (527 byte)
│   ├── data/
│   │   ├── command-library.js  # Dizionario comandi esadecimali hardware
│   │   ├── module-library.js   # Specifiche di tutti i 96+ modelli ed algoritmi
│   │   ├── eq-lookup.js        # Tabella reverse-lookup 1141 valori parametri EQ
│   │   └── drum-patterns.js    # Catalogo 100 ritmi drum machine
│   ├── services/
│   │   └── tone3000.js         # Client REST per Tone3000 Supabase API
│   ├── components/
│   │   ├── SignalChain.js      # Rack 9 moduli pedaliera e routing
│   │   ├── ModuleEditor.js     # Manopole rotative hardware ed editing
│   │   ├── PresetList.js       # Barra laterale 100 slot, rename e backup
│   │   ├── Tone3000Modal.js    # Explorer modale Tone3000
│   │   ├── DrumMachineModal.js # Drum machine & metronomo Web Audio
│   │   ├── TunerModal.js       # Accordatore cromatico con rilevamento pitch
│   │   └── SaveModal.js        # Finestra di salvataggio flash hardware
│   └── styles/
│       ├── main.css            # Dark theme e layout Neural DSP style
│       ├── rack.css            # Grafica rack stompbox, LED e cavi
│       ├── knobs.css           # Grafica manopole rotative metalliche e archi
│       ├── tone3000.css        # Schede e filtri Tone3000
│       └── drums-tuner.css     # UI drum machine e ago accordatore
```
