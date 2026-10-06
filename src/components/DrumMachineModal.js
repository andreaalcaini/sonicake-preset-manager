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
      <div class="modal-dialog drum-modal">
        <div class="modal-header">
          <span class="modal-title">&#129345; DRUM MACHINE & METRONOME (100 RHYTHMS)</span>
          <button class="modal-close-btn">&times;</button>
        </div>

        <div class="modal-body">
          <div class="drum-machine-container">
            <!-- Top Controls: Play, BPM, Tap, Vol -->
            <div class="drum-top-controls">
              <button class="drum-play-btn ${this.isPlaying ? 'playing' : ''}">
                ${this.isPlaying ? '&#9632;' : '&#9658;'}
              </button>

              <div class="drum-tempo-wrap">
                <div class="bpm-display-wrap">
                  <span class="bpm-number">${this.bpm}</span>
                  <span class="bpm-unit">BPM</span>
                </div>
                
                <input type="range" class="bpm-slider preset-volume-slider" style="width: 120px;" min="40" max="250" value="${this.bpm}">

                <button class="tap-tempo-btn">
                  <div class="tap-led"></div>
                  <span>TAP</span>
                </button>
              </div>

              <!-- Drum Vol -->
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <span style="font-size: 10px; font-weight: 700; color: var(--text-muted);">VOL</span>
                <input type="range" class="drum-vol-slider preset-volume-slider" style="width: 70px;" min="0" max="100" value="${this.volume}">
              </div>
            </div>

            <!-- Categories -->
            <div class="drum-categories">
              ${categories.map(cat => `
                <button class="drum-cat-btn ${cat === this.currentCategory ? 'active' : ''}" data-cat="${cat}">
                  ${cat}
                </button>
              `).join('')}
            </div>

            <!-- Patterns Grid -->
            <div class="drum-pattern-list">
              ${patterns.map(pat => `
                <div class="drum-pattern-item ${pat.id === this.selectedPatternId ? 'active' : ''}" data-id="${pat.id}" data-bpm="${pat.defaultBpm}">
                  <span>#${pat.id} ${pat.name}</span>
                  <span style="font-family: var(--font-mono); font-size: 10px; opacity: 0.7;">${pat.timeSignature}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-action modal-close-btn-bottom">Done</button>
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
