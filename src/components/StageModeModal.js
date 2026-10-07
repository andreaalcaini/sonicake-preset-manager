/**
 * Stage Mode / Live Performance View Modal Component
 * High-contrast full-screen view for live performances and band rehearsals.
 * Features giant preset names, large interactive module state tiles,
 * footswitch / arrow key preset stepping, and instant tuner access.
 */

import { presetEngine } from '../core/preset-engine.js';
import { MODULE_NAMES } from '../core/protocol.js';

export class StageModeModal {
  constructor(overlayElement, tunerModal) {
    this.overlay = overlayElement;
    this.tunerModal = tunerModal;
    this.isFullscreen = false;

    // Listen to preset engine updates
    presetEngine.onSlotChange(() => {
      if (this.isOpen()) this.render();
    });
    presetEngine.onStateChange(() => {
      if (this.isOpen()) this.render();
    });

    this.render();
  }

  isOpen() {
    return this.overlay.classList.contains('active');
  }

  open() {
    this.overlay.classList.add('active');
    this.render();
  }

  close() {
    this.overlay.classList.remove('active');
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      this.isFullscreen = true;
    } else {
      document.exitFullscreen().catch(() => {});
      this.isFullscreen = false;
    }
    this.render();
  }

  render() {
    const slot = presetEngine.currentSlot;
    const slotCode = presetEngine.getSlotCode(slot);
    const activePreset = presetEngine.activePreset;
    const presetName = activePreset.name || 'Init Tone';
    const states = activePreset.states || {};
    const ampMode = activePreset.ampMode === 'clone' ? 'NAM Clone' : 'Factory Amp';

    this.overlay.innerHTML = `
      <div class="w-[96vw] max-w-7xl h-[92vh] max-h-[96vh] bg-zinc-950 border border-zinc-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 flex flex-col justify-between shadow-2xl overflow-y-auto animate-in fade-in zoom-in-95 duration-150 select-none">
        
        <!-- Top bar: Stage status & Controls -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800/80">
          <div class="flex items-center gap-3">
            <span class="px-3 py-1 rounded-md bg-amber-500 text-zinc-950 font-black text-xs uppercase tracking-wider">
              LIVE STAGE
            </span>
            <span class="hidden sm:inline text-xs text-zinc-400 font-medium">
              Usa frecce ◀ ▶ per cambiare preset
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button class="px-3.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-semibold flex items-center gap-1.5 transition-colors" id="stageBtnTuner">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="10 8 16 12 10 16 10 8"></polygon>
              </svg>
              Accordatore
            </button>
            <button class="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold transition-colors" id="stageBtnFullscreen">
              ${document.fullscreenElement ? 'Riduci' : 'Schermo Intero'}
            </button>
            <button class="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-colors" id="stageBtnClose">
              Esci
            </button>
          </div>
        </div>

        <!-- Center: Giant Slot Code & Preset Name -->
        <div class="flex flex-col items-center justify-center text-center my-auto py-4">
          <div class="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 max-w-full">
            <span class="text-6xl sm:text-8xl md:text-9xl font-black text-amber-500 font-mono tracking-tight drop-shadow-md">
              ${slotCode}
            </span>
            <span class="text-3xl sm:text-5xl md:text-7xl font-extrabold text-white tracking-tight truncate max-w-full drop-shadow">
              ${presetName}
            </span>
          </div>

          <div class="mt-4 flex items-center gap-4 text-xs sm:text-sm font-semibold uppercase tracking-wider text-zinc-400">
            <span>Tipo: <strong class="${activePreset.ampMode === 'clone' ? 'text-cyan-400' : 'text-amber-400'}">${ampMode}</strong></span>
            <span class="text-zinc-600">•</span>
            <span>Volume: <strong class="text-white">${activePreset.volume || 75}%</strong></span>
          </div>
        </div>

        <!-- Interactive 9 Modules Status Rack (Responsive Grid) -->
        <div class="my-4">
          <div class="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2.5 text-center">
            Tocca per attivare / disattivare singoli effetti
          </div>

          <div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2 sm:gap-2.5">
            ${Array.from({ length: 9 }, (_, modId) => {
              const modName = MODULE_NAMES[modId] || `M${modId}`;
              const isOn = states[modId] !== false;
              return `
                <div class="stage-module-tile p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center gap-2 active:scale-95 ${isOn ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-500/10' : 'bg-zinc-900/40 border-zinc-800 text-zinc-500 hover:border-zinc-700'}" data-mod-id="${modId}">
                  <div class="w-3 h-3 rounded-full transition-all ${isOn ? 'bg-emerald-400 shadow-md shadow-emerald-400' : 'bg-zinc-700'}"></div>
                  <span class="text-sm sm:text-base font-black tracking-tight">
                    ${modName}
                  </span>
                  <span class="text-[10px] font-bold uppercase tracking-wider ${isOn ? 'text-emerald-400' : 'text-zinc-600'}">
                    ${isOn ? 'ON' : 'BYPASS'}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Bottom: Giant Next / Previous Footswitch Buttons -->
        <div class="grid grid-cols-2 gap-3 sm:gap-5 pt-3">
          <button class="stage-nav-btn py-4 sm:py-5 px-4 rounded-2xl border-2 border-zinc-700/80 bg-zinc-900 hover:bg-zinc-800/80 active:scale-[0.98] text-white flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 transition-all cursor-pointer shadow-lg" id="stageBtnPrev">
            <span class="text-lg sm:text-2xl font-black">◀ PREV</span>
            <span class="text-[11px] sm:text-xs text-zinc-400 font-medium">(Freccia Sinistra)</span>
          </button>

          <button class="stage-nav-btn py-4 sm:py-5 px-4 rounded-2xl border-2 border-zinc-700/80 bg-zinc-900 hover:bg-zinc-800/80 active:scale-[0.98] text-white flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 transition-all cursor-pointer shadow-lg" id="stageBtnNext">
            <span class="text-lg sm:text-2xl font-black">NEXT ▶</span>
            <span class="text-[11px] sm:text-xs text-zinc-400 font-medium">(Freccia Destra)</span>
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Close & Fullscreen
    const btnClose = this.overlay.querySelector('#stageBtnClose');
    if (btnClose) btnClose.addEventListener('click', () => this.close());

    const btnFullscreen = this.overlay.querySelector('#stageBtnFullscreen');
    if (btnFullscreen) btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

    // Tuner
    const btnTuner = this.overlay.querySelector('#stageBtnTuner');
    if (btnTuner && this.tunerModal) {
      btnTuner.addEventListener('click', () => {
        this.tunerModal.open();
      });
    }

    // Module bypass tiles
    this.overlay.querySelectorAll('.stage-module-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const modId = parseInt(tile.dataset.modId, 10);
        presetEngine.toggleModuleState(modId);
      });
    });

    // Prev / Next Preset buttons
    const btnPrev = this.overlay.querySelector('#stageBtnPrev');
    const btnNext = this.overlay.querySelector('#stageBtnNext');

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        const current = presetEngine.currentSlot;
        const target = current > 1 ? current - 1 : 100;
        presetEngine.selectPreset(target);
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        const current = presetEngine.currentSlot;
        const target = current < 100 ? current + 1 : 1;
        presetEngine.selectPreset(target);
      });
    }

    // Keyboard navigation while Stage Mode is open
    const keyHandler = (e) => {
      if (!this.isOpen()) {
        window.removeEventListener('keydown', keyHandler);
        return;
      }
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        const current = presetEngine.currentSlot;
        const target = current < 100 ? current + 1 : 1;
        presetEngine.selectPreset(target);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        const current = presetEngine.currentSlot;
        const target = current > 1 ? current - 1 : 100;
        presetEngine.selectPreset(target);
      }
    };

    window.addEventListener('keydown', keyHandler);
  }
}
