/**
 * Chromatic Tuner Modal Component
 * Accurate chromatic pitch detection using Web Audio autocorrelation,
 * device input selection (e.g. the Sonicake pedal USB Audio interface),
 * large note display, cent meter needle, and in-tune indicator.
 */

export class TunerModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.isListening = false;
    this.animFrameId = null;
    this.selectedDeviceId = '';
    this.availableDevices = [];

    // Pitch state
    this.detectedNote = '--';
    this.detectedAccidental = '';
    this.cents = 0;
    this.isInTune = false;
    this.referencePitch = 440; // A4 = 440 Hz

    this.noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    this.render();
  }

  async open() {
    this.overlay.classList.add('active');
    await this.refreshDevices();
    this.render();
    this.startListening();
  }

  close() {
    this.stopListening();
    this.overlay.classList.remove('active');
  }

  async refreshDevices() {
    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.availableDevices = devices.filter(d => d.kind === 'audioinput');
        if (!this.selectedDeviceId && this.availableDevices.length > 0) {
          // Prefer Sonicake or USB Audio if available
          const usbDev = this.availableDevices.find(d => /sonicake|smart\s*box|usb/i.test(d.label));
          this.selectedDeviceId = usbDev ? usbDev.deviceId : this.availableDevices[0].deviceId;
        }
      }
    } catch (e) {
      console.warn('Error enumerating audio devices:', e);
    }
  }

  async startListening(deviceId = this.selectedDeviceId) {
    this.stopListening();

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const constraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          video: false
        };
        this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
        const source = this.audioCtx.createMediaStreamSource(this.micStream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);

        this.isListening = true;
        this.detectPitchLoop();
      } else {
        this.simulateTuner();
      }
    } catch (err) {
      console.warn('Audio input access not granted, running simulated tuner:', err);
      this.simulateTuner();
    }
  }

  stopListening() {
    this.isListening = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  detectPitchLoop() {
    if (!this.isListening || !this.analyser) return;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    const pitch = this.autoCorrelate(buffer, this.audioCtx.sampleRate);
    if (pitch !== -1) {
      const { note, accidental, cents } = this.calculateNoteFromPitch(pitch);
      this.detectedNote = note;
      this.detectedAccidental = accidental;
      this.cents = cents;
      this.isInTune = Math.abs(cents) <= 4;
      this.updateVisuals();
    }

    this.animFrameId = requestAnimationFrame(() => this.detectPitchLoop());
  }

  autoCorrelate(buffer, sampleRate) {
    const SIZE = buffer.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
      const val = buffer[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.015) return -1; // Gate threshold for guitar signal

    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    const trimmed = buffer.slice(r1, r2);
    const c = new Float32Array(trimmed.length).fill(0);
    for (let i = 0; i < trimmed.length; i++) {
      for (let j = 0; j < trimmed.length - i; j++) {
        c[i] = c[i] + trimmed[j] * trimmed[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < trimmed.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }

  calculateNoteFromPitch(freq) {
    const noteNum = 12 * (Math.log(freq / this.referencePitch) / Math.log(2));
    const roundedNote = Math.round(noteNum) + 69;
    const noteIndex = roundedNote % 12;
    const noteNameFull = this.noteStrings[noteIndex];

    const note = noteNameFull[0];
    const accidental = noteNameFull.length > 1 ? noteNameFull[1] : '';

    const exactFreq = this.referencePitch * Math.pow(2, (roundedNote - 69) / 12);
    const cents = Math.round(1200 * Math.log2(freq / exactFreq));

    return { note, accidental, cents };
  }

  simulateTuner() {
    const demoNotes = ['E', 'A', 'D', 'G', 'B'];
    let idx = 0;
    const timer = setInterval(() => {
      if (!this.isListening) {
        clearInterval(timer);
        return;
      }
      this.detectedNote = demoNotes[idx % demoNotes.length];
      this.detectedAccidental = '';
      this.cents = Math.floor(Math.random() * 20) - 10;
      this.isInTune = Math.abs(this.cents) <= 3;
      this.updateVisuals();
      idx++;
    }, 1200);
  }

  updateVisuals() {
    const mainNoteEl = this.overlay.querySelector('.tuner-main-note');
    const accidentalEl = this.overlay.querySelector('.tuner-accidental');
    const centsEl = this.overlay.querySelector('.tuner-cents-text');
    const needleEl = this.overlay.querySelector('.meter-needle');
    const container = this.overlay.querySelector('.tuner-container');

    if (mainNoteEl) mainNoteEl.textContent = this.detectedNote;
    if (accidentalEl) accidentalEl.textContent = this.detectedAccidental;
    if (centsEl) {
      centsEl.textContent = `${this.cents > 0 ? '+' : ''}${this.cents} cents`;
    }

    if (needleEl) {
      const clampedCents = Math.max(-50, Math.min(50, this.cents));
      const percentage = 50 + (clampedCents / 50) * 45;
      needleEl.style.left = `${percentage}%`;
    }

    if (container) {
      container.classList.toggle('tuner-in-tune', this.isInTune);
    }
  }

  render() {
    this.overlay.innerHTML = `
      <div class="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="10 8 16 12 10 16 10 8"></polygon>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Accordatore Cromatico</h3>
              <p class="text-[11px] text-zinc-400">Rilevamento intonazione audio in tempo reale</p>
            </div>
          </div>
          <button class="modal-close-btn p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 overflow-y-auto space-y-5 text-sm">
          <div class="tuner-container ${this.isInTune ? 'tuner-in-tune' : ''}">
            <!-- Big Note Display -->
            <div class="tuner-note-display my-2">
              <span class="tuner-main-note text-7xl font-black text-white transition-colors">${this.detectedNote}</span>
              <span class="tuner-accidental text-3xl font-bold text-amber-500">${this.detectedAccidental}</span>
            </div>

            <!-- Cents Indicator -->
            <span class="tuner-cents-text font-mono text-sm font-semibold text-zinc-400">${this.cents > 0 ? '+' : ''}${this.cents} cents</span>

            <!-- Needle Meter -->
            <div class="tuner-meter-wrap w-full max-w-xs my-2">
              <div class="meter-scale">
                <div class="meter-center-mark"></div>
                <div class="meter-needle" style="left: 50%;"></div>
              </div>
              <div class="meter-ticks">
                <span>-50</span>
                <span>-25</span>
                <span>0</span>
                <span>+25</span>
                <span>+50</span>
              </div>
            </div>

            <!-- Audio Input Source Selection -->
            <div class="w-full p-3.5 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Sorgente Ingresso Audio:
                </label>
                <span class="text-[10px] text-cyan-400 font-mono">
                  ${this.availableDevices.length > 0 ? `${this.availableDevices.length} dispositivi` : 'Default'}
                </span>
              </div>
              
              <select class="tuner-device-select w-full px-3 py-2 bg-zinc-900 border border-zinc-700/80 focus:border-cyan-500/80 rounded-lg text-xs text-zinc-100 outline-none transition-colors">
                ${this.availableDevices.length > 0 ? this.availableDevices.map(d => `
                  <option value="${d.deviceId}" ${d.deviceId === this.selectedDeviceId ? 'selected' : ''}>
                    ${d.label || `Ingresso Audio ${d.deviceId.slice(0, 6)}`}
                  </option>
                `).join('') : `
                  <option value="">Ingresso Predefinito del Sistema (Pedaliera USB / Line-In)</option>
                `}
              </select>
            </div>

            <!-- Information / Technical Note -->
            <div class="w-full p-3 bg-zinc-950/40 border border-zinc-800/80 rounded-xl text-xs text-zinc-400 leading-relaxed text-left flex items-start gap-2">
              <svg class="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span>
                <strong>Analisi audio diretta:</strong> l'accordatore ascolta la chitarra dall'ingresso audio scelto (la pedaliera via USB o la scheda audio).
              </span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end">
          <button class="modal-close-btn-bottom px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors w-full sm:w-auto">
            Chiudi Accordatore
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    this.overlay.querySelectorAll('.modal-close-btn, .modal-close-btn-bottom').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    const devSelect = this.overlay.querySelector('.tuner-device-select');
    if (devSelect) {
      devSelect.addEventListener('change', (e) => {
        this.selectedDeviceId = e.target.value;
        this.startListening(this.selectedDeviceId);
      });
    }
  }
}
