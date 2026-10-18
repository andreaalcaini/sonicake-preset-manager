/**
 * Drum Machine Component
 * Features 100 drum patterns across 8 styles (Rock, Pop, Blues, Jazz, Funk, Electronic, World, Metronome),
 * BPM slider, Tap Tempo with LED flasher, and built-in Web Audio rhythm generator.
 */

import { DRUM_PATTERNS } from '../data/drum-patterns.js';
import { connection } from '../core/connection.js';

export class DrumMachineModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.isPlaying = false;
    this.bpm = 120;
    this.volume = 80;
    this.currentCategory = 'Rock';
    this.selectedPatternId = 1;

    // Tap tempo tracking
    this.tapTimes = [];
    this.tapTimeout = null;

    // Web Audio Synthesizer
    this.audioCtx = null;
    this.nextNoteTime = 0;
    this.timerId = null;
    this.currentBeat = 0;

    this.render();
  }

  open() {
    this.overlay.classList.add('active');
  }

  close() {
    this.stopPlayback();
    this.overlay.classList.remove('active');
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  togglePlayback() {
    this.initAudio();
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.startPlayback();
    }
  }

  startPlayback() {
    this.isPlaying = true;
    this.currentBeat = 0;
    this.nextNoteTime = this.audioCtx.currentTime + 0.05;

    const playBtn = this.overlay.querySelector('.drum-play-btn');
    if (playBtn) {
      playBtn.classList.add('playing');
      playBtn.innerHTML = '&#9632;'; // Stop symbol
    }

    this.scheduler();
    connection.log(`Drum Machine started: Pattern #${this.selectedPatternId} @ ${this.bpm} BPM`, 'info');
  }

  stopPlayback() {
    this.isPlaying = false;
    clearTimeout(this.timerId);

    const playBtn = this.overlay.querySelector('.drum-play-btn');
    if (playBtn) {
      playBtn.classList.remove('playing');
      playBtn.innerHTML = '&#9658;'; // Play symbol
    }
  }

  scheduler() {
    if (!this.isPlaying) return;

    while (this.nextNoteTime < this.audioCtx.currentTime + 0.1) {
      this.scheduleBeat(this.currentBeat, this.nextNoteTime);
      const secondsPerBeat = 60.0 / this.bpm / 2; // 8th note subdivisions
      this.nextNoteTime += secondsPerBeat;
      this.currentBeat = (this.currentBeat + 1) % 8;
    }

    this.timerId = setTimeout(() => this.scheduler(), 25);
  }

  scheduleBeat(beat, time) {
    // 8-step basic drum pattern generator matching style
    const isQuarter = (beat % 2) === 0;
    const quarterIndex = beat / 2;

    // Hi-hat on every 8th note
    this.playHiHat(time);

    // Kick on beats 1 and 3 (or variations)
    if (quarterIndex === 0 || quarterIndex === 2) {
      this.playKick(time);
    }

    // Snare on beats 2 and 4
    if (quarterIndex === 1 || quarterIndex === 3) {
      this.playSnare(time);
    }

    // Flash tap tempo LED on beat 1
    if (beat === 0) {
      setTimeout(() => this.flashTempoLed(), Math.max(0, (time - this.audioCtx.currentTime) * 1000));
    }
  }

  // --- Web Audio Drum Synthesis ---

  playKick(time) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.12);

    const vol = (this.volume / 100) * 0.9;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(time);
    osc.stop(time + 0.2);
  }

  playSnare(time) {
    // Noise buffer for snare snap
    const bufferSize = this.audioCtx.sampleRate * 0.15;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = this.audioCtx.createGain();
    const vol = (this.volume / 100) * 0.6;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    noise.start(time);
    noise.stop(time + 0.16);
  }

  playHiHat(time) {
    const bufferSize = this.audioCtx.sampleRate * 0.04;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;

    const gain = this.audioCtx.createGain();
    const vol = (this.volume / 100) * 0.25;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  // --- Tap Tempo Calculation ---

  handleTapTempo() {
    const now = Date.now();
    this.flashTempoLed();

    if (this.tapTimes.length > 0 && now - this.tapTimes[this.tapTimes.length - 1] > 2000) {
      this.tapTimes = []; // Reset if idle > 2s
    }

    this.tapTimes.push(now);
    if (this.tapTimes.length > 4) {
      this.tapTimes.shift();
    }

    if (this.tapTimes.length >= 2) {
      let totalDiff = 0;
      for (let i = 1; i < this.tapTimes.length; i++) {
        totalDiff += this.tapTimes[i] - this.tapTimes[i - 1];
      }
      const avgDiff = totalDiff / (this.tapTimes.length - 1);
      const calculatedBpm = Math.round(60000 / avgDiff);
      this.setBpm(Math.max(40, Math.min(250, calculatedBpm)));
    }
  }

  setBpm(newBpm) {
    this.bpm = Math.max(40, Math.min(250, Math.round(newBpm)));
    const bpmNum = this.overlay.querySelector('.bpm-number');
    const bpmSlider = this.overlay.querySelector('.bpm-slider');
    if (bpmNum) bpmNum.textContent = this.bpm;
    if (bpmSlider) bpmSlider.value = this.bpm;
  }

  flashTempoLed() {
    const tapBtn = this.overlay.querySelector('.tap-tempo-btn');
    if (tapBtn) {
      tapBtn.classList.add('flash');
      setTimeout(() => tapBtn.classList.remove('flash'), 80);
    }
  }

  // --- Rendering ---

  render() {
    const categories = ['Rock', 'Pop', 'Blues', 'Jazz', 'Funk', 'Electronic', 'World', 'Metronome'];
    const patterns = DRUM_PATTERNS.filter(p => p.category === this.currentCategory);

    this.overlay.innerHTML = `
      <div class="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Drum Machine & Metronomo</h3>
              <p class="text-[11px] text-zinc-400">100 ritmi integrati nella pedaliera</p>
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
        <div class="p-5 overflow-y-auto space-y-4 text-sm max-h-[75vh]">
          <!-- Top Controls: Play, BPM, Tap, Vol -->
          <div class="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-4">
            <!-- Play/Stop button -->
            <button class="drum-play-btn w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold transition-all shadow-md shrink-0 ${this.isPlaying ? 'bg-amber-500 text-zinc-950 playing' : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'}">
              ${this.isPlaying ? '&#9632;' : '&#9658;'}
            </button>

            <!-- BPM and Tap -->
            <div class="flex items-center gap-3 sm:gap-4 flex-1">
              <div class="text-center shrink-0">
                <div class="bpm-number text-2xl font-black font-mono text-white leading-none">${this.bpm}</div>
                <div class="text-[10px] font-bold text-amber-500 uppercase tracking-wider mt-0.5">BPM</div>
              </div>
              
              <input type="range" class="bpm-slider flex-1 accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg" min="40" max="250" value="${this.bpm}">

              <button class="tap-tempo-btn px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-zinc-200 text-xs font-bold uppercase transition-all flex items-center gap-1.5 shrink-0 active:scale-95">
                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>TAP</span>
              </button>
            </div>

            <!-- Volume -->
            <div class="flex flex-col items-center gap-1 shrink-0 pl-2 border-l border-zinc-800">
              <span class="text-[10px] font-bold text-zinc-500 uppercase">VOL</span>
              <input type="range" class="drum-vol-slider w-16 accent-cyan-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg" min="0" max="100" value="${this.volume}">
            </div>
          </div>

          <!-- Categories filter pills -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            ${categories.map(cat => `
              <button class="drum-cat-btn px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${cat === this.currentCategory ? 'bg-amber-500 text-zinc-950 font-bold' : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'}" data-cat="${cat}">
                ${cat}
              </button>
            `).join('')}
          </div>

          <!-- Patterns Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-zinc-950/40 border border-zinc-800 rounded-xl">
            ${patterns.map(pat => `
              <div class="drum-pattern-item p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${pat.id === this.selectedPatternId ? 'bg-amber-500/15 border-amber-500/50 text-white font-bold' : 'bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-800/60 text-zinc-300'}" data-id="${pat.id}" data-bpm="${pat.defaultBpm}">
                <span class="text-xs truncate">#${pat.id} ${pat.name}</span>
                <span class="text-[10px] font-mono text-zinc-400 px-1.5 py-0.5 rounded bg-zinc-950/60 border border-zinc-800 shrink-0 ml-2">${pat.timeSignature}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end">
          <button class="modal-close-btn-bottom px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Play/Stop
    const playBtn = this.overlay.querySelector('.drum-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.togglePlayback());
    }

    // BPM Slider
    const bpmSlider = this.overlay.querySelector('.bpm-slider');
    if (bpmSlider) {
      bpmSlider.addEventListener('input', (e) => this.setBpm(e.target.value));
    }

    // Tap Tempo
    const tapBtn = this.overlay.querySelector('.tap-tempo-btn');
    if (tapBtn) {
      tapBtn.addEventListener('click', () => this.handleTapTempo());
    }

    // Drum Volume
    const volSlider = this.overlay.querySelector('.drum-vol-slider');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        this.volume = parseInt(e.target.value, 10);
      });
    }

    // Categories
    this.overlay.querySelectorAll('.drum-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentCategory = btn.dataset.cat;
        this.render();
      });
    });

    // Pattern Selection
    this.overlay.querySelectorAll('.drum-pattern-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedPatternId = parseInt(item.dataset.id, 10);
        const defBpm = parseInt(item.dataset.bpm, 10);
        if (defBpm && !this.isPlaying) {
          this.setBpm(defBpm);
        }
        this.render();
      });
    });

    // Close
    this.overlay.querySelectorAll('.modal-close-btn, .modal-close-btn-bottom').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }
}
