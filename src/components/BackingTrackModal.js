/**
 * Backing Track Audio Player Component
 * Practice studio tool for musicians: load MP3/WAV backing tracks,
 * slow down audio without changing pitch (0.5x - 1.5x), set A-B loop sections, and practice solos.
 */

import { notify } from './ui-feedback.js';

export class BackingTrackModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.audio = new Audio();
    this.audio.preservesPitch = true; // Essential: preserve pitch when changing speed!
    this.audio.mozPreservesPitch = true;
    this.audio.webkitPreservesPitch = true;

    this.fileName = 'Nessun file caricato';
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.playbackRate = 1.0;
    this.volume = 0.8;
    this.audio.volume = this.volume;

    // A-B Loop points
    this.loopA = null;
    this.loopB = null;
    this.isLoopActive = false;

    this.initAudioEvents();
    this.render();
  }

  initAudioEvents() {
    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration;
      this.render();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;

      // Handle A-B loop boundary
      if (this.isLoopActive && this.loopA !== null && this.loopB !== null) {
        if (this.currentTime >= this.loopB) {
          this.audio.currentTime = this.loopA;
        }
      }

      this.updateProgressUI();
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.renderPlayButton();
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.renderPlayButton();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.renderPlayButton();
    });
  }

  loadAudioFile(file) {
    if (!file) return;
    this.fileName = file.name;
    const url = URL.createObjectURL(file);
    this.audio.src = url;
    this.loopA = null;
    this.loopB = null;
    this.isLoopActive = false;
    this.audio.load();
    this.render();
  }

  open() {
    this.render();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  updateProgressUI() {
    const timeDisplay = this.overlay.querySelector('#backingTrackTimeDisplay');
    const progressBar = this.overlay.querySelector('#backingTrackProgressBar');
    const scrubSlider = this.overlay.querySelector('#backingTrackScrubSlider');

    if (timeDisplay) {
      timeDisplay.textContent = `${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;
    }
    const percent = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
    if (scrubSlider && !this.isScrubbing) {
      scrubSlider.value = percent;
    }
  }

  renderPlayButton() {
    const btn = this.overlay.querySelector('#btnBackingPlayPause');
    if (!btn) return;
    if (this.isPlaying) {
      btn.innerHTML = `
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      `;
      btn.classList.add('bg-emerald-500', 'text-zinc-950');
      btn.classList.remove('bg-zinc-800', 'text-white');
    } else {
      btn.innerHTML = `
        <svg class="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
      btn.classList.remove('bg-emerald-500', 'text-zinc-950');
      btn.classList.add('bg-zinc-800', 'text-white');
    }
  }

  render() {
    this.overlay.innerHTML = `
      <div class="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase font-mono">Player Basi & Backing Tracks</h3>
              <p class="text-[11px] text-zinc-400">Esercitati sulle basi: rallenta gli assoli senza cambiare tonalità e usa il loop A-B</p>
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
        <div class="p-5 space-y-5 overflow-y-auto">
          <!-- File Drop Zone & Selection -->
          <div id="dropZoneAudio" class="p-4 border-2 border-dashed border-zinc-800 hover:border-emerald-500/50 rounded-xl bg-zinc-950/60 flex items-center justify-between gap-3 transition cursor-pointer">
            <div class="flex items-center gap-3 min-w-0">
              <div class="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400">
                <svg class="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18V5l12-2v13M9 9l12-2M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
                </svg>
              </div>
              <div class="min-w-0">
                <div class="text-xs font-bold text-zinc-200 truncate" id="backingTrackFileNameDisplay">${this.fileName}</div>
                <div class="text-[11px] text-zinc-500">Trascina un file MP3 / WAV o clicca per caricare</div>
              </div>
            </div>
            <button id="btnBrowseAudio" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition shrink-0">
              Sfoglia File
            </button>
            <input type="file" id="inputAudioFile" accept="audio/*" class="hidden">
          </div>

          <!-- Player Deck -->
          <div class="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-4">
            <!-- Timeline / Scrub bar -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs font-mono">
                <span class="text-emerald-400 font-bold" id="backingTrackTimeDisplay">
                  ${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}
                </span>
                <span class="text-zinc-500 text-[11px]">
                  ${this.isLoopActive ? `Loop: [${this.formatTime(this.loopA)} → ${this.formatTime(this.loopB)}]` : 'Loop disattivo'}
                </span>
              </div>

              <!-- Seek Slider -->
              <div class="relative flex items-center">
                <input type="range" id="backingTrackScrubSlider" min="0" max="100" step="0.1" value="0" class="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500">
              </div>
            </div>

            <!-- Transport Buttons -->
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <!-- Rewind 5s -->
                <button id="btnBackingRewind5" class="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition" title="Indietro di 5 secondi">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>
                </button>

                <!-- Play / Pause -->
                <button id="btnBackingPlayPause" class="w-11 h-11 rounded-xl bg-zinc-800 text-white flex items-center justify-center transition shadow-lg" title="Play / Pausa">
                  <svg class="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                </button>

                <!-- Forward 5s -->
                <button id="btnBackingForward5" class="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition" title="Avanti di 5 secondi">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>
                </button>

                <!-- Stop -->
                <button id="btnBackingStop" class="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition" title="Stop">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                </button>
              </div>

              <!-- Volume Control -->
              <div class="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5">
                <svg class="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                <input type="range" id="backingTrackVolumeSlider" min="0" max="1" step="0.05" value="${this.volume}" class="w-20 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500">
                <span class="text-[10px] font-mono text-zinc-400 w-7 text-right" id="volumePercentDisplay">${Math.round(this.volume * 100)}%</span>
              </div>
            </div>
          </div>

          <!-- Speed & Pitch-Preserved Slowdown Section -->
          <div class="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span class="text-xs font-mono font-bold uppercase text-zinc-300">Velocità di Esecuzione (Tonalità Inalterata)</span>
              </div>
              <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" id="speedDisplayBadge">
                ${this.playbackRate.toFixed(2)}x
              </span>
            </div>

            <div class="flex items-center gap-3">
              <input type="range" id="speedSlider" min="0.5" max="1.5" step="0.05" value="${this.playbackRate}" class="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400">
            </div>

            <!-- Quick Speed Buttons -->
            <div class="flex items-center gap-1.5 flex-wrap">
              ${[0.5, 0.75, 0.85, 0.9, 1.0, 1.1, 1.25].map(rate => `
                <button class="btn-quick-speed px-2.5 py-1 rounded-md text-[11px] font-mono transition ${this.playbackRate === rate ? 'bg-cyan-500 text-zinc-950 font-bold' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'}" data-rate="${rate}">
                  ${rate === 1.0 ? 'Normale (1x)' : `${rate}x`}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- A-B Loop Practice Section -->
          <div class="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
                <span class="text-xs font-mono font-bold uppercase text-zinc-300">Sezione A-B Loop (Ripetizione Fraseggio)</span>
              </div>
              <button id="btnToggleLoop" class="px-2.5 py-0.5 rounded text-xs font-mono font-semibold transition ${this.isLoopActive ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:text-white'}">
                ${this.isLoopActive ? 'Loop ATTIVO' : 'Loop Disattivo'}
              </button>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button id="btnSetPointA" class="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-zinc-200 transition flex flex-col items-center">
                <span class="text-[10px] text-zinc-500 font-mono">Punto Inizio</span>
                <span class="font-bold font-mono text-amber-400" id="displayPointA">${this.loopA !== null ? this.formatTime(this.loopA) : 'Imposta [A]'}</span>
              </button>

              <button id="btnSetPointB" class="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 text-zinc-200 transition flex flex-col items-center">
                <span class="text-[10px] text-zinc-500 font-mono">Punto Fine</span>
                <span class="font-bold font-mono text-amber-400" id="displayPointB">${this.loopB !== null ? this.formatTime(this.loopB) : 'Imposta [B]'}</span>
              </button>

              <button id="btnClearLoop" class="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 transition flex flex-col items-center">
                <span class="text-[10px] text-zinc-500 font-mono">Reset</span>
                <span class="font-bold">Azzera Loop</span>
              </button>

              <button id="btnJumpToA" class="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 transition flex flex-col items-center">
                <span class="text-[10px] text-zinc-500 font-mono">Salta ad [A]</span>
                <span class="font-bold">Ricomincia</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 border-t border-zinc-800 bg-zinc-950/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span>La riproduzione audio avviene direttamente sul tuo browser e sulla tua scheda audio</span>
          <button class="modal-close-btn px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition">
            Chiudi
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.renderPlayButton();
  }

  attachEventListeners() {
    this.overlay.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // File input & Drag drop
    const dropZone = this.overlay.querySelector('#dropZoneAudio');
    const fileInput = this.overlay.querySelector('#inputAudioFile');
    const btnBrowse = this.overlay.querySelector('#btnBrowseAudio');

    if (btnBrowse && fileInput) {
      btnBrowse.addEventListener('click', () => fileInput.click());
    }
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', (e) => {
        if (e.target !== btnBrowse) fileInput.click();
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-emerald-500');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-emerald-500');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-emerald-500');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.loadAudioFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.loadAudioFile(e.target.files[0]);
        }
      });
    }

    // Play/Pause
    this.overlay.querySelector('#btnBackingPlayPause')?.addEventListener('click', () => {
      if (!this.audio.src) {
        notify('Carica prima un file audio (MP3 o WAV).', 'warning');
        return;
      }
      if (this.isPlaying) {
        this.audio.pause();
      } else {
        this.audio.play();
      }
    });

    // Stop
    this.overlay.querySelector('#btnBackingStop')?.addEventListener('click', () => {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.isPlaying = false;
      this.renderPlayButton();
    });

    // Rewind / Forward 5s
    this.overlay.querySelector('#btnBackingRewind5')?.addEventListener('click', () => {
      this.audio.currentTime = Math.max(0, this.audio.currentTime - 5);
    });
    this.overlay.querySelector('#btnBackingForward5')?.addEventListener('click', () => {
      this.audio.currentTime = Math.min(this.duration, this.audio.currentTime + 5);
    });

    // Scrub slider
    const scrubSlider = this.overlay.querySelector('#backingTrackScrubSlider');
    if (scrubSlider) {
      scrubSlider.addEventListener('mousedown', () => { this.isScrubbing = true; });
      scrubSlider.addEventListener('touchstart', () => { this.isScrubbing = true; }, { passive: true });
      scrubSlider.addEventListener('input', (e) => {
        const percent = parseFloat(e.target.value);
        if (this.duration > 0) {
          this.currentTime = (percent / 100) * this.duration;
          const timeDisplay = this.overlay.querySelector('#backingTrackTimeDisplay');
          if (timeDisplay) {
            timeDisplay.textContent = `${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;
          }
        }
      });
      scrubSlider.addEventListener('change', (e) => {
        this.isScrubbing = false;
        const percent = parseFloat(e.target.value);
        if (this.duration > 0) {
          this.audio.currentTime = (percent / 100) * this.duration;
        }
      });
      scrubSlider.addEventListener('mouseup', () => { this.isScrubbing = false; });
      scrubSlider.addEventListener('touchend', () => { this.isScrubbing = false; });
    }

    // Volume slider
    const volSlider = this.overlay.querySelector('#backingTrackVolumeSlider');
    const volDisplay = this.overlay.querySelector('#volumePercentDisplay');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        this.volume = parseFloat(e.target.value);
        this.audio.volume = this.volume;
        if (volDisplay) volDisplay.textContent = `${Math.round(this.volume * 100)}%`;
      });
    }

    // Speed slider
    const speedSlider = this.overlay.querySelector('#speedSlider');
    const speedDisplayBadge = this.overlay.querySelector('#speedDisplayBadge');
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        this.playbackRate = parseFloat(e.target.value);
        this.audio.playbackRate = this.playbackRate;
        if (speedDisplayBadge) speedDisplayBadge.textContent = `${this.playbackRate.toFixed(2)}x`;
        this.highlightActiveSpeedBtn();
      });
    }

    // Quick speed buttons
    this.overlay.querySelectorAll('.btn-quick-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        const rate = parseFloat(btn.dataset.rate);
        this.playbackRate = rate;
        this.audio.playbackRate = rate;
        if (speedSlider) speedSlider.value = rate;
        if (speedDisplayBadge) speedDisplayBadge.textContent = `${rate.toFixed(2)}x`;
        this.highlightActiveSpeedBtn();
      });
    });

    // A-B Loop buttons
    this.overlay.querySelector('#btnSetPointA')?.addEventListener('click', () => {
      this.loopA = this.audio.currentTime;
      this.overlay.querySelector('#displayPointA').textContent = this.formatTime(this.loopA);
      if (this.loopB !== null && this.loopB > this.loopA) {
        this.isLoopActive = true;
      }
      this.updateLoopBadge();
    });

    this.overlay.querySelector('#btnSetPointB')?.addEventListener('click', () => {
      this.loopB = this.audio.currentTime;
      this.overlay.querySelector('#displayPointB').textContent = this.formatTime(this.loopB);
      if (this.loopA !== null && this.loopB > this.loopA) {
        this.isLoopActive = true;
      }
      this.updateLoopBadge();
    });

    this.overlay.querySelector('#btnClearLoop')?.addEventListener('click', () => {
      this.loopA = null;
      this.loopB = null;
      this.isLoopActive = false;
      this.overlay.querySelector('#displayPointA').textContent = 'Imposta [A]';
      this.overlay.querySelector('#displayPointB').textContent = 'Imposta [B]';
      this.updateLoopBadge();
    });

    this.overlay.querySelector('#btnJumpToA')?.addEventListener('click', () => {
      if (this.loopA !== null) {
        this.audio.currentTime = this.loopA;
      } else {
        this.audio.currentTime = 0;
      }
    });

    this.overlay.querySelector('#btnToggleLoop')?.addEventListener('click', () => {
      this.isLoopActive = !this.isLoopActive;
      this.updateLoopBadge();
    });
  }

  updateLoopBadge() {
    const btn = this.overlay.querySelector('#btnToggleLoop');
    if (!btn) return;
    if (this.isLoopActive) {
      btn.textContent = 'Loop ATTIVO';
      btn.classList.add('bg-amber-500', 'text-zinc-950');
      btn.classList.remove('bg-zinc-800', 'text-zinc-400');
    } else {
      btn.textContent = 'Loop Disattivo';
      btn.classList.remove('bg-amber-500', 'text-zinc-950');
      btn.classList.add('bg-zinc-800', 'text-zinc-400');
    }
  }

  highlightActiveSpeedBtn() {
    this.overlay.querySelectorAll('.btn-quick-speed').forEach(btn => {
      const rate = parseFloat(btn.dataset.rate);
      const isMatch = Math.abs(rate - this.playbackRate) < 0.02;
      if (isMatch) {
        btn.classList.add('bg-cyan-500', 'text-zinc-950', 'font-bold');
        btn.classList.remove('bg-zinc-900', 'text-zinc-400');
      } else {
        btn.classList.remove('bg-cyan-500', 'text-zinc-950', 'font-bold');
        btn.classList.add('bg-zinc-900', 'text-zinc-400');
      }
    });
  }
}
