/**
 * Signal Chain Component
 * Displays the reorderable 9-module pedalboard rack, bypass switches,
 * live LED indicators, and Amp/Clone mode switcher.
 */

import { presetEngine } from '../core/preset-engine.js';
import { MODULE_LIBRARY_DATA } from '../data/module-library.js';
import { MODULE_NAMES } from '../core/protocol.js';

export class SignalChain {
  constructor(containerElement, onSelectModule) {
    this.container = containerElement;
    this.onSelectModule = onSelectModule;
    this.selectedModuleId = 3; // Default to AMP

    // Subscribe to preset state and custom slot names changes
    presetEngine.onStateChange(() => this.render());
    presetEngine.onUserSlotsChange(() => this.render());
    this.render();
  }

  setSelectedModule(moduleId) {
    this.selectedModuleId = moduleId;
    this.render();
  }

  render() {
    const preset = presetEngine.activePreset;
    const order = preset.order || [0, 1, 2, 3, 4, 5, 6, 7, 8];

    this.container.innerHTML = `
      <div class="flex flex-col gap-2 sm:gap-2.5">
        <!-- Rack Top Header & Mode Toggle -->
        <div class="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 text-xs">
          <div class="flex items-center gap-1.5 sm:gap-2 text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
            <svg class="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12h16M4 6h16M4 18h16"/>
            </svg>
            <span class="hidden sm:inline">Catena Effetti & Routing (9 Moduli)</span>
            <span class="sm:hidden">Routing (9)</span>
          </div>
          
          <div class="flex items-center gap-1.5 sm:gap-3 flex-wrap">
            <!-- Amp Mode (Factory vs Clone/NAM) -->
            <div class="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button class="amp-mode-btn factory-btn px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-semibold text-[11px] transition ${preset.ampMode === 'factory' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-200'}" data-mode="factory">
                Factory
              </button>
              <button class="amp-mode-btn clone-btn px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-semibold text-[11px] transition ${preset.ampMode === 'clone' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-zinc-400 hover:text-zinc-200'}" data-mode="clone">
                Clone
              </button>
            </div>

            <!-- Patch Volume Slider -->
            <div class="flex items-center gap-1.5 sm:gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2 sm:px-2.5 py-0.5 sm:py-1">
              <span class="text-[10px] font-mono font-bold uppercase text-zinc-400">Vol</span>
              <input type="range" class="preset-volume-slider w-14 sm:w-20 accent-cyan-400 cursor-pointer" min="0" max="100" value="${preset.volume}">
              <span class="preset-volume-val font-mono text-[11px] font-bold text-cyan-400 w-5 sm:w-6 text-right">${preset.volume}</span>
            </div>
          </div>
        </div>

        <!-- 9 Modules Horizontal Rack with IN/OUT nodes -->
        <div class="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 scrollbar-thin touch-pan-x" style="-webkit-overflow-scrolling: touch; scroll-snap-type: x proximity;">
          <div class="shrink-0 px-1.5 sm:px-2.5 py-3 sm:py-4 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] font-mono font-bold text-zinc-500 flex flex-col items-center justify-center">
            <span>IN</span>
          </div>

          ${order.map((modId, index) => this.renderModuleCard(modId, index, order.length)).join('')}

          <div class="shrink-0 px-1.5 sm:px-2.5 py-3 sm:py-4 rounded-xl bg-zinc-950 border border-zinc-800 text-[10px] font-mono font-bold text-zinc-500 flex flex-col items-center justify-center">
            <span>OUT</span>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderModuleCard(modId, index, totalModules) {
    const preset = presetEngine.activePreset;
    const isBypassed = !preset.states[modId];
    const isSelected = this.selectedModuleId === modId;
    const modTag = MODULE_NAMES[modId] || `MOD ${modId}`;

    // Get current effect ID and definition
    const fxId = modId === 3 && preset.ampMode === 'clone' 
      ? (preset.selectedEffects[9] || 901) 
      : (preset.selectedEffects[modId] || 0);

    const fxDef = MODULE_LIBRARY_DATA.effectLibrary[fxId];

    let fxName = 'Off';
    if (modId === 3 && preset.ampMode === 'clone') {
      const cloneFxId = preset.selectedEffects[9] || 901;
      let cName = presetEngine.cloneSlotNames[cloneFxId - 901] || (fxDef ? fxDef.name : 'User Profile 1');
      if (cName === 'Audio Assa') cName = 'Audio Assault Slow30';
      if (cName === 'Petersburg') cName = 'Petersburg Thunder';
      if (cName === 'Empty' || !cName) cName = `Slot ${cloneFxId - 900} (Libero)`;
      fxName = cName;
    } else if (modId === 4 && fxId >= 416 && fxId <= 420) {
      let irName = presetEngine.irSlotNames[fxId - 416] || (fxDef ? fxDef.name : `User IR ${fxId - 415}`);
      if (irName === 'Empty' || !irName) irName = `User IR ${fxId - 415}`;
      fxName = irName;
    } else if (fxDef) {
      fxName = fxDef.name;
    }

    const iconName = this.getModuleIconPath(modId, preset.ampMode);

    return `
      <div class="module-card shrink-0 w-24 sm:w-28 md:w-32 rounded-xl border transition cursor-pointer select-none flex flex-col justify-between p-1.5 sm:p-2 ${
        isSelected 
          ? 'bg-zinc-850 border-cyan-500/80 ring-1 ring-cyan-500/40 shadow-lg' 
          : isBypassed 
            ? 'bg-zinc-950/70 border-zinc-850 opacity-60 hover:opacity-80' 
            : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
      }" data-module-id="${modId}" style="scroll-snap-align: start;">
        <!-- Top header with tag and reorder arrows -->
        <div class="flex items-center justify-between gap-1 mb-1">
          <span class="text-[9px] sm:text-[10px] font-mono font-bold px-1 sm:px-1.5 py-0.5 rounded ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-zinc-800 text-zinc-400'}">
            ${modTag}
          </span>
          <div class="flex items-center gap-0.5">
            ${index > 0 ? `<button class="btn-move btn-move-left p-1 sm:p-0.5 text-zinc-500 hover:text-white rounded hover:bg-zinc-800 transition text-[9px] sm:text-[10px]" data-index="${index}" title="Sposta a sinistra">&larr;</button>` : ''}
            ${index < totalModules - 1 ? `<button class="btn-move btn-move-right p-1 sm:p-0.5 text-zinc-500 hover:text-white rounded hover:bg-zinc-800 transition text-[9px] sm:text-[10px]" data-index="${index}" title="Sposta a destra">&rarr;</button>` : ''}
          </div>
        </div>

        <!-- Center Icon & Model Name -->
        <div class="flex flex-col items-center justify-center my-1 text-center">
          <img src="${iconName}" alt="${modTag}" class="w-5 h-5 sm:w-6 sm:h-6 object-contain mb-1 opacity-90" onerror="this.style.display='none'">
          <span class="text-[10px] sm:text-[11px] font-semibold text-zinc-100 truncate w-full" title="${fxName}">
            ${fxName}
          </span>
        </div>

        <!-- Bottom Bypass LED Toggle Button -->
        <div class="mt-1 pt-1 sm:pt-1.5 border-t border-zinc-800/60">
          <div class="module-bypass-toggle flex items-center justify-center gap-1 py-1 sm:py-1.5 px-1.5 sm:px-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 hover:border-zinc-700 active:scale-95 transition" data-module-id="${modId}" title="Attiva / Disattiva Bypass">
            <div class="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition ${isBypassed ? 'bg-zinc-700' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'}"></div>
            <span class="text-[9px] sm:text-[10px] font-mono font-bold ${isBypassed ? 'text-zinc-500' : 'text-emerald-400'}">
              ${isBypassed ? 'BYP' : 'ON'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  getModuleIconPath(modId, ampMode) {
    const iconMap = {
      0: 'nr_on.svg',
      1: 'fx1_on.svg',
      2: 'drv_on.svg',
      3: ampMode === 'clone' ? 'effects.svg' : 'drv_on.svg',
      4: 'ir_on.svg',
      5: 'eq_on.svg',
      6: 'fx2_on.svg',
      7: 'dly_on.svg',
      8: 'rvb_on.svg'
    };
    const filename = iconMap[modId] || 'effects.svg';
    return `/assets/images/${filename}`;
  }

  attachEventListeners() {
    // Select module card
    this.container.querySelectorAll('.module-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.module-bypass-toggle') || e.target.closest('.btn-move')) {
          return; // Let child handler handle it
        }
        const modId = parseInt(card.dataset.moduleId, 10);
        this.selectedModuleId = modId;
        this.render();
        if (this.onSelectModule) {
          this.onSelectModule(modId);
        }
      });
    });

    // Toggle module bypass
    this.container.querySelectorAll('.module-bypass-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const modId = parseInt(toggle.dataset.moduleId, 10);
        const currentState = presetEngine.activePreset.states[modId];
        presetEngine.setModuleBypass(modId, !currentState);
      });
    });

    // Reorder modules left/right
    this.container.querySelectorAll('.btn-move-left').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const order = [...presetEngine.activePreset.order];
        if (idx > 0) {
          const temp = order[idx];
          order[idx] = order[idx - 1];
          order[idx - 1] = temp;
          presetEngine.setChainOrder(order);
        }
      });
    });

    this.container.querySelectorAll('.btn-move-right').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const order = [...presetEngine.activePreset.order];
        if (idx < order.length - 1) {
          const temp = order[idx];
          order[idx] = order[idx + 1];
          order[idx + 1] = temp;
          presetEngine.setChainOrder(order);
        }
      });
    });

    // Amp Mode toggle buttons
    this.container.querySelectorAll('.amp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        presetEngine.setAmpMode(mode);
      });
    });

    // Preset volume slider
    const volSlider = this.container.querySelector('.preset-volume-slider');
    const volVal = this.container.querySelector('.preset-volume-val');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (volVal) volVal.textContent = val;
        presetEngine.setPresetVolume(val);
      });

      // DAW behavior: Double-click or Alt+Click resets preset volume to default (75)
      const resetVol = (e) => {
        e.preventDefault();
        volSlider.value = 75;
        if (volVal) volVal.textContent = 75;
        presetEngine.setPresetVolume(75);
      };
      volSlider.addEventListener('dblclick', resetVol);
      if (volVal) volVal.addEventListener('dblclick', resetVol);
      volSlider.addEventListener('mousedown', (e) => {
        if (e.altKey) resetVol(e);
      });
    }
  }
}
