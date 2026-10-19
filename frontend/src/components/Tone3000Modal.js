/**
 * Tone3000 Cloud Explorer & Hardware Memory Manager Component
 * SonicLink Studio Smartphone & Desktop UI
 * 
 * Manages the Sonicake pedal internal file memory:
 * - 5 Clone AMP (Neural Amp Modeler) slots (Banchi 901 - 905)
 * - 5 User Cabinet IR (.wav) slots (Banchi 416 - 420)
 * 
 * Zero-risk hardware protection:
 * - Flashes strictly 2,696-byte Low Models for Clone AMPs
 * - Flashes normalized 512-point 48kHz audio samples for IRs
 * - Throttles packets at 8ms with CRC8 SMBus PEC
 * - Never touches or alters the 50 user working presets
 */

import { Tone3000Service } from '../services/tone3000.js';
import { presetEngine, SLOT_RENAME_MAX } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';
import { CompilerBridgeService } from '../services/compiler-bridge.js';
import { convertCLOToLowModel } from '../core/protocol.js';
import { notify, askText } from './ui-feedback.js';

export class Tone3000Modal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.activeTab = 'memory'; // 'memory' or 'browse'
    this.searchQuery = '';
    this.currentGear = 'all';
    this.tones = [];
    this.isLoading = false;
    this.debounceTimer = null;
    this.selectedTargetType = 'amp'; // 'amp' or 'cab'
    this.selectedTargetSlot = 0; // 0 to 4
    this.applyToCurrentPreset = true;
    this.selectedVariations = {};
    this.variationsCache = {};
    this.bridgeStatus = { available: false };

    this.checkBridgeStatus();
    this.render();
  }

  async checkBridgeStatus() {
    this.bridgeStatus = await CompilerBridgeService.checkHealth();
    const container = this.overlay.querySelector('#bridgeStatusContainer');
    if (container) {
      container.innerHTML = this.renderBridgeBadge();
    }
  }

  open() {
    this.activeTab = 'memory';
    this.applyToCurrentPreset = true;
    this.checkBridgeStatus();
    this.render();
    this.overlay.classList.add('active');
    if (this.tones.length === 0) {
      this.fetchTones();
    }
  }

  openForReplacement({ targetType = 'amp' } = {}) {
    this.activeTab = 'browse';
    this.selectedTargetType = targetType === 'amp' ? 'amp' : 'cab';
    this.currentGear = targetType === 'amp' ? 'amp' : 'cab';
    this.selectedTargetSlot = 0;
    this.applyToCurrentPreset = true;
    this.checkBridgeStatus();
    this.render();
    this.overlay.classList.add('active');
    this.fetchTones();
  }

  close() {
    this.overlay.classList.remove('active');
  }

  async fetchTones() {
    // Only the latest search may update the grid (typing fires several searches)
    const request = (this.searchRequest = (this.searchRequest || 0) + 1);
    this.isLoading = true;
    this.searchError = null;
    this.renderGrid();

    try {
      const tones = await Tone3000Service.searchTones({
        query: this.searchQuery,
        gear: this.currentGear,
        limit: 24
      });
      if (request !== this.searchRequest) return;
      this.tones = tones;
    } catch (err) {
      if (request !== this.searchRequest) return;
      this.tones = [];
      this.searchError = err.message;
    } finally {
      if (request === this.searchRequest) {
        this.isLoading = false;
        this.renderGrid();
      }
    }
  }

  /** Enable / disable the write and download buttons of a tone card */
  setToneActionsEnabled(toneId, enabled) {
    this.overlay.querySelectorAll(`.btn-flash-tone[data-id="${toneId}"], .btn-load-tone[data-id="${toneId}"]`).forEach(btn => {
      btn.disabled = !enabled;
      btn.classList.toggle('opacity-40', !enabled);
      btn.classList.toggle('cursor-not-allowed', !enabled);
    });
  }

  async loadToneVariations(tone) {
    const toneId = tone.id;
    const selectEl = this.overlay.querySelector(`#varSelect-${toneId}`);
    const countEl = this.overlay.querySelector(`#varCount-${toneId}`);
    if (!selectEl) return;

    let models = this.variationsCache[toneId];
    if (!models) {
      try {
        models = await Tone3000Service.getToneModels(toneId);
        this.variationsCache[toneId] = models;
      } catch (err) {
        // Not cached: the next render tries again
        selectEl.innerHTML = '<option value="">File non disponibili: riprova più tardi</option>';
        this.selectedVariations[toneId] = null;
        this.setToneActionsEnabled(toneId, false);
        return;
      }
    }

    if (!models || models.length === 0) {
      selectEl.innerHTML = '<option value="">Nessun file scaricabile</option>';
      this.selectedVariations[toneId] = null;
      this.setToneActionsEnabled(toneId, false);
      return;
    }
    this.setToneActionsEnabled(toneId, true);

    if (countEl) {
      countEl.textContent = '';
      const badge = this.overlay.querySelector(`#varCountBadge-${toneId}`);
      if (badge) badge.textContent = models.length;
    }

    selectEl.innerHTML = models.map((m, idx) => `
      <option value="${idx}">
        ${idx + 1}. ${m.name}
      </option>
    `).join('');

    this.selectedVariations[toneId] = models[0];

    selectEl.onchange = (e) => {
      const selectedIndex = parseInt(e.target.value, 10);
      const chosen = models[selectedIndex] || models[0];
      this.selectedVariations[toneId] = chosen;
    };
  }

  renderBridgeBadge() {
    const online = !!this.bridgeStatus?.available;
    return `
      <span class="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border ${online ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}"
            title="${online ? 'Conversione delle catture NAM disponibile' : 'Conversione delle catture NAM momentaneamente non disponibile'}">
        <span class="w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-zinc-500'}"></span>
        Compilatore ${online ? 'online' : 'offline'}
      </span>
    `;
  }

  render() {
    const cloneNames = presetEngine.cloneSlotNames;
    const irNames = presetEngine.irSlotNames;
    const isConn = connection.isConnected;

    this.overlay.innerHTML = `
      <div class="w-full max-w-5xl h-[92vh] sm:h-[88vh] max-h-[94vh] bg-[#141518] border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-zinc-100 font-sans">
        
        <!-- SonicLink Top Header -->
        <div class="px-3 sm:px-6 py-3 border-b border-zinc-800/80 bg-[#18191e] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div class="flex items-center gap-2 sm:gap-3 flex-wrap">
            <!-- SonicLink Orange Logo Pill -->
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-zinc-950 font-black shadow-md shadow-orange-950/40">
                <svg class="w-4 h-4 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div>
                <h3 class="text-xs sm:text-sm font-black tracking-wider text-white uppercase flex items-center gap-1.5">
                  Tone3000 & Memoria
                  ${isConn ? `
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase">Pedaliera connessa</span>
                  ` : `
                    <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase">Non connessa</span>
                  `}
                </h3>
                <p class="text-[10px] text-zinc-400 hidden sm:block">5 amplificatori Clone e 5 casse IR personali</p>
              </div>
            </div>

            <!-- Segmented Control Tabs (SonicLink style) -->
            <div class="p-1 bg-zinc-950/90 border border-zinc-800 rounded-xl flex items-center gap-1 shadow-inner">
              <button class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all ${this.activeTab === 'memory' ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'}" id="tabBtnMemory">
                Sulla pedaliera
              </button>
              <button class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-bold transition-all ${this.activeTab === 'browse' ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'}" id="tabBtnBrowse">
                Libreria Tone3000
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <div id="bridgeStatusContainer">
              ${this.renderBridgeBadge()}
            </div>

            <button class="modal-close-btn p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors" title="Chiudi finestra">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Scrollable Modal Body -->
        <div class="p-3 sm:p-5 overflow-y-auto flex-1 space-y-4">
          ${this.activeTab === 'memory' ? this.renderMemoryTab(cloneNames, irNames) : this.renderBrowseTab(cloneNames, irNames)}
        </div>

        <!-- SonicLink Bottom Action Bar -->
        <div class="px-3 sm:px-6 py-2.5 border-t border-zinc-800/80 bg-[#16171b] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div class="text-[11px] text-zinc-400 flex items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
            <span class="truncate">Caricare amplificatori e casse non modifica i tuoi preset.</span>
          </div>
          <button class="modal-close-btn-bottom px-4 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-bold transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
    if (this.activeTab === 'browse') {
      this.renderGrid();
    }
  }

  renderMemoryTab(cloneNames, irNames) {
    const activeAmpFx = presetEngine.activePreset.selectedEffects[9] || presetEngine.activePreset.selectedEffects[3];
    const isAmpCloneActive = presetEngine.activePreset.ampMode === 'clone';
    const activeCabFx = presetEngine.activePreset.selectedEffects[4];

    return `
      <!-- Dual Column: 5 Clone NAM Slots + 5 User IR Slots -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-5">
        
        <!-- Left Column: 5 Clone NAM Slots (Banchi 901-905) -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between pb-1.5 border-b border-zinc-800">
            <span class="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
              Amplificatori Clone (NAM)
            </span>
            
          </div>

          <div class="space-y-2">
            ${cloneNames.map((rawName, i) => {
              const isCurrentActive = isAmpCloneActive && (activeAmpFx === 901 + i);
              let name = rawName;
              if (name === 'Audio Assa') name = 'Audio Assault Slow30';
              if (name === 'Petersburg') name = 'Petersburg Thunder';
              if (!name || name === 'Empty') name = `Slot ${i + 1} (Libero)`;

              return `
                <div class="slot-dropzone p-3 bg-[#18191d] border ${isCurrentActive ? 'border-orange-500/60 bg-orange-950/15 shadow-md shadow-orange-950/20' : 'border-zinc-800/80 hover:border-zinc-700'} rounded-xl flex flex-col gap-2 transition-all" data-type="amp" data-slot="${i}">
                  <!-- Slot Header -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2.5 min-w-0">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/20 border border-orange-500/40 text-orange-400 shrink-0 mt-0.5">
                        NAM ${i + 1}
                      </span>
                      <div class="min-w-0">
                        <div class="text-xs sm:text-sm font-bold text-zinc-100 truncate" title="${name}">${name}</div>
                        
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      ${isCurrentActive ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          In Riproduzione
                        </span>
                      ` : `
                        
                      `}
                    </div>
                  </div>

                  <!-- Slot Action Buttons -->
                  <div class="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-zinc-800/60">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <button class="btn-slot-audition px-2.5 py-1 rounded-lg ${isCurrentActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' : 'bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200'} text-[11px] font-bold transition-all flex items-center gap-1" data-type="amp" data-slot="${i}" title="Attiva e prova questo amplificatore sulla pedaliera">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        <span>${isCurrentActive ? 'Attivo' : 'Ascolta'}</span>
                      </button>

                      <button class="btn-slot-search-tone3000 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-orange-500 hover:text-black text-zinc-300 text-[11px] font-bold transition-colors flex items-center gap-1" data-type="amp" data-slot="${i}" title="Cerca una cattura online su Tone3000">
                        <svg class="w-3 h-3 text-orange-400 group-hover:text-black" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                        <span>Tone3000</span>
                      </button>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <label class="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 border border-zinc-700/60" title="Carica file .clo o .nam">
                        <svg class="w-3 h-3 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>.nam / .clo</span>
                        <input type="file" accept=".nam,.clo,.namb" class="slot-file-input hidden" data-type="amp" data-slot="${i}">
                      </label>
                      <button class="btn-slot-rename p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" data-type="amp" data-slot="${i}" title="Rinomina questo slot">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Right Column: 5 User Cabinet IR Slots (Banchi 416-420) -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between pb-1.5 border-b border-zinc-800">
            <span class="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              Casse IR personali
            </span>
            
          </div>

          <div class="space-y-2">
            ${irNames.map((name, i) => {
              const isCurrentActive = activeCabFx === 416 + i;

              return `
                <div class="slot-dropzone p-3 bg-[#18191d] border ${isCurrentActive ? 'border-amber-500/60 bg-amber-950/15 shadow-md shadow-amber-950/20' : 'border-zinc-800/80 hover:border-zinc-700'} rounded-xl flex flex-col gap-2 transition-all" data-type="cab" data-slot="${i}">
                  <!-- Slot Header -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2.5 min-w-0">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0 mt-0.5">
                        IR ${i + 1}
                      </span>
                      <div class="min-w-0">
                        <div class="text-xs sm:text-sm font-bold text-zinc-100 truncate" title="${name}">${name}</div>
                        
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      ${isCurrentActive ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          In Riproduzione
                        </span>
                      ` : `
                        
                      `}
                    </div>
                  </div>

                  <!-- Slot Action Buttons -->
                  <div class="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-zinc-800/60">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <button class="btn-slot-audition px-2.5 py-1 rounded-lg ${isCurrentActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold' : 'bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200'} text-[11px] font-bold transition-all flex items-center gap-1" data-type="cab" data-slot="${i}" title="Attiva e prova questa cassa IR sulla pedaliera">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        <span>${isCurrentActive ? 'Attivo' : 'Ascolta'}</span>
                      </button>

                      <button class="btn-slot-search-tone3000 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-300 text-[11px] font-bold transition-colors flex items-center gap-1" data-type="cab" data-slot="${i}" title="Cerca casse / IR online su Tone3000">
                        <svg class="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5z"/></svg>
                        <span>Casse IR</span>
                      </button>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <label class="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 border border-zinc-700/60" title="Carica file .wav">
                        <svg class="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        <span>.wav</span>
                        <input type="file" accept=".wav" class="slot-file-input hidden" data-type="cab" data-slot="${i}">
                      </label>
                      <button class="btn-slot-rename p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" data-type="cab" data-slot="${i}" title="Rinomina questo slot">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderBrowseTab(cloneNames, irNames) {
    const isCab = this.selectedTargetType === 'cab';

    return `
      <!-- Destination Slot Selector Bar -->
      <div class="p-3 bg-[#18191d] border border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-inner">
        <div class="flex items-center gap-2.5 flex-wrap">
          <span class="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-orange-500"></span>
            Scrivi nello Slot:
          </span>
          
          <select class="target-slot-selector px-3 py-1.5 bg-zinc-950 border border-zinc-700 focus:border-orange-500 rounded-lg text-xs font-bold text-white outline-none">
            <optgroup label="Amplificatori Clone">
              ${cloneNames.map((name, i) => `
                <option value="amp:${i}" ${!isCab && i === this.selectedTargetSlot ? 'selected' : ''}>
                  Clone ${i + 1}: ${name}
                </option>
              `).join('')}
            </optgroup>
            <optgroup label="Casse IR">
              ${irNames.map((name, i) => `
                <option value="cab:${i}" ${isCab && i === this.selectedTargetSlot ? 'selected' : ''}>
                  IR ${i + 1}: ${name}
                </option>
              `).join('')}
            </optgroup>
          </select>
        </div>

        <label class="flex items-center gap-2 cursor-pointer text-xs text-zinc-300 select-none">
          <input type="checkbox" id="checkApplyToCurrent" ${this.applyToCurrentPreset ? 'checked' : ''} class="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500/30">
          <span>Attiva subito in riproduzione sulla pedaliera</span>
        </label>
      </div>

      <!-- Search Input & Filter Pills -->
      <div class="space-y-2">
        <div class="relative">
          <svg class="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input type="text" class="tone3000-input w-full pl-10 pr-12 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 rounded-xl text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors" placeholder="Cerca catture su Tone3000 (es. Marshall, Friedman, Peavey 5150, Fender Twin, Rectifier)..." value="${String(this.searchQuery).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
          <button type="button" class="btn-clear-search ${this.searchQuery ? '' : 'hidden'} absolute right-0 top-0 h-full w-11 flex items-center justify-center rounded-r-xl text-zinc-400 hover:text-white" title="Cancella la ricerca" aria-label="Cancella la ricerca">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          ${[
            ['all', 'Tutti'], ['amp', 'Amp'], ['amp-cab', 'Amp + Cab'], ['pedal', 'Pedali'], ['outboard', 'Outboard'], ['cab', 'Cab IR']
          ].map(([gear, label]) => `
            <button class="gear-pill min-h-[36px] px-3.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${this.currentGear === gear ? 'bg-orange-500 text-black shadow-sm' : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'}" data-gear="${gear}">${label}</button>
          `).join('')}
        </div>
      </div>

      <!-- Tones Grid Container -->
      <div class="tones-grid-container flex-1 overflow-y-auto min-h-[300px]"></div>
    `;
  }

  formatCount(n) {
    if (typeof n !== 'number') return '–';
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  }

  formatAge(iso) {
    if (!iso) return '';
    const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
    if (days < 1) return 'oggi';
    if (days < 7) return `${days}g`;
    if (days < 30) return `${Math.floor(days / 7)} sett`;
    if (days < 365) return `${Math.floor(days / 30)} mesi`.replace(/^1 mesi$/, '1 mese');
    const y = Math.floor(days / 365);
    return y === 1 ? '1 anno' : `${y} anni`;
  }

  escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Tone3000-style capture card: image, title, capture type, downloads, files, author */
  renderToneCard(tone) {
    const esc = (v) => this.escapeHtml(v);
    const isIr = tone.platform === 'ir' || tone.gear === 'cab';
    const author = tone.author;
    const fallbackIcon = isIr ? '/assets/images/ir_on.svg' : (tone.gear === 'pedal' ? '/assets/images/drv_on.svg' : '/assets/images/amp_on.svg');

    return `
      <div class="tone-card p-3 bg-[#18191d] border border-zinc-800 hover:border-orange-500/40 rounded-xl flex flex-col gap-3 transition-all" data-id="${tone.id}">
        <div class="flex gap-3 sm:gap-4 min-w-0">
          <a href="${tone.url}" target="_blank" rel="noopener" class="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center" title="Apri su Tone3000">
            ${tone.image
              ? `<img src="${esc(tone.image)}" alt="" loading="lazy" class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('img'),{src:'${fallbackIcon}',className:'w-12 h-auto opacity-80'}))">`
              : `<img src="${fallbackIcon}" alt="" class="w-12 h-auto opacity-80">`}
          </a>

          <div class="min-w-0 flex-1 flex flex-col gap-1.5">
            <a href="${tone.url}" target="_blank" rel="noopener" class="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2 hover:text-orange-300" title="${esc(tone.title)}">${esc(tone.title)}</a>

            <div class="flex items-center gap-2 text-xs sm:text-sm text-zinc-400">
              <span class="truncate">${esc(tone.gearLabel || 'Capture')}</span>
              <span class="px-1.5 py-px rounded text-[10px] font-bold uppercase bg-zinc-300 text-zinc-900 shrink-0">${isIr ? 'IR' : 'NAM'}</span>
            </div>

            <div class="flex items-center gap-4 text-xs sm:text-sm text-zinc-300">
              <span class="flex items-center gap-1.5" title="Download">
                <svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                ${this.formatCount(tone.downloads)}
              </span>
              <span class="flex items-center gap-1.5" title="File disponibili">
                <svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span id="varCountBadge-${tone.id}">${this.formatCount(tone.filesCount)}</span>
              </span>
              ${typeof tone.comments === 'number' ? `
                <span class="flex items-center gap-1.5" title="Commenti">
                  <svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>
                  ${this.formatCount(tone.comments)}
                </span>
              ` : ''}
            </div>

            ${author ? `
              <div class="flex items-center gap-2 text-xs sm:text-sm text-zinc-300 min-w-0">
                ${author.avatar
                  ? `<img src="${esc(author.avatar)}" alt="" loading="lazy" class="w-6 h-6 rounded-full object-cover shrink-0 bg-zinc-800">`
                  : `<span class="w-6 h-6 rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-200 flex items-center justify-center shrink-0">${esc(author.name.charAt(0).toUpperCase())}</span>`}
                <span class="truncate">${esc(author.name)}</span>
                ${author.verified ? `<svg class="w-4 h-4 shrink-0 text-orange-400" viewBox="0 0 24 24" fill="currentColor" aria-label="Verificato"><path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.9 1.5-1 3.1 1 3.1-2.9 1.5-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.9-1.5 1-3.1-1-3.1 2.9-1.5.9-3.1 3.2.4z"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8" fill="none" stroke="#18191d" stroke-width="2"/></svg>` : ''}
                <span class="text-zinc-500 shrink-0">${this.formatAge(tone.publishedAt)}</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Files of this capture -->
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-zinc-500 shrink-0">File</span>
          <select class="tone-variation-select flex-1 min-w-0 min-h-[40px] px-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 outline-none" data-tone-id="${tone.id}" id="varSelect-${tone.id}">
            <option value="0" selected>Caricamento file...</option>
          </select>
          <span class="text-[11px] text-orange-400 font-mono font-bold shrink-0" id="varCount-${tone.id}"></span>
        </div>

        <div class="grid grid-cols-[1fr_auto] gap-2">
          <button class="btn-flash-tone min-h-[44px] px-3 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-sm font-black transition-all flex items-center justify-center gap-1.5" data-id="${tone.id}">
            <svg class="w-4 h-4 text-amber-200" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <span>Scrivi su Pedaliera</span>
          </button>
          <button class="btn-load-tone min-h-[44px] px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-zinc-800" data-id="${tone.id}" title="Scarica il file sul dispositivo">
            <svg class="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/></svg>
            <span class="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>
    `;
  }

  renderGrid() {
    const gridContainer = this.overlay.querySelector('.tones-grid-container');
    if (!gridContainer) return;

    if (this.isLoading) {
      gridContainer.innerHTML = `
        <div class="text-center py-16 text-orange-400 font-bold text-xs sm:text-sm flex flex-col items-center gap-2">
          <div class="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Ricerca catture Tone3000 in corso...</span>
        </div>
      `;
      return;
    }

    if (this.searchError) {
      gridContainer.innerHTML = `
        <div class="text-center py-14 px-4 flex flex-col items-center gap-3">
          <div class="text-sm font-bold text-rose-300">Ricerca non riuscita</div>
          <div class="text-xs text-zinc-400 max-w-sm">${this.searchError}</div>
          <button type="button" class="btn-retry-search min-h-[44px] px-5 rounded-xl bg-orange-500 hover:bg-orange-400 text-sm font-bold text-zinc-950">Riprova</button>
        </div>
      `;
      gridContainer.querySelector('.btn-retry-search').addEventListener('click', () => this.fetchTones());
      return;
    }

    if (this.tones.length === 0) {
      gridContainer.innerHTML = `
        <div class="text-center py-16 text-zinc-500 text-xs sm:text-sm">
          Nessuna cattura trovata per "${this.searchQuery}". Prova a cercare un'altra marca (es. Marshall, Fender, 5150, Mesa).
        </div>
      `;
      return;
    }

    gridContainer.innerHTML = `
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
        ${this.tones.map(tone => this.renderToneCard(tone)).join('')}
      </div>
    `;

    this.tones.forEach(tone => {
      this.loadToneVariations(tone);
    });

    // Flash Button Click Handler
    gridContainer.querySelectorAll('.btn-flash-tone').forEach(btn => {
      btn.addEventListener('click', async () => {
        const toneId = btn.dataset.id;
        const tone = this.tones.find(t => String(t.id) === String(toneId));
        if (!tone) return;

        if (!connection.isConnected) {
          notify('Pedaliera non connessa! Connetti la pedaliera via USB o Bluetooth in alto a destra.', 'warning');
          return;
        }

        const selectedVar = this.selectedVariations[toneId];
        if (!selectedVar?.url) {
          notify("Questa cattura non ha ancora un file scaricabile: attendi il caricamento dei file o scegline un'altra.", 'warning');
          return;
        }

        const modelName = selectedVar.name || tone.title;
        let targetType = this.selectedTargetType;
        let slotIndex = this.selectedTargetSlot;
        if (tone.gear === 'cab' || tone.gear === 'ir') {
          targetType = 'cab';
        }

        const modelUrl = selectedVar.url;

        // IR Path
        if (targetType === 'cab') {
          if (!modelUrl || (!modelUrl.toLowerCase().includes('.wav') && !modelUrl.toLowerCase().includes('/ir/') && !modelUrl.toLowerCase().includes('/models/'))) {
            notify(`Il profilo cassa IR ("${modelName}") non dispone di un file .wav con download diretto.\n\nPuoi caricare un file .wav dal computer o smartphone tramite la scheda "Slot Pedaliera".`, 'warning');
            return;
          }
          const irName = await this.askSlotName(modelName, `Slot User IR ${slotIndex + 1}`);
          if (!irName) return;
          try {
            this.showFlashProgressModal(`Download IR "${irName}"`, `Scrittura nello slot User IR ${slotIndex + 1}`);
            const resp = await fetch(modelUrl);
            const arrayBuffer = await resp.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const channelData = audioBuffer.getChannelData(0);

            const samples = new Float32Array(512);
            const count = Math.min(512, channelData.length);
            let maxVal = 0;
            for (let i = 0; i < count; i++) {
              if (Math.abs(channelData[i]) > maxVal) maxVal = Math.abs(channelData[i]);
            }
            const scale = maxVal > 0 ? (0.95 / maxVal) : 1.0;
            for (let i = 0; i < count; i++) samples[i] = channelData[i] * scale;

            await presetEngine.flashIRToPedal(slotIndex, samples, irName, (curr, tot, pct) => {
              this.updateFlashProgress(curr, tot, pct);
            });
            await presetEngine.activateIRSlot(slotIndex, true);
            this.hideFlashProgressModal(`User IR ${slotIndex + 1} ("${irName}") memorizzato con successo!`);
            this.render();
          } catch (err) {
            console.error('Flash IR failed:', err);
            notify(`Errore caricamento IR: ${err.message}`, 'error');
            this.hideFlashProgressModal();
          }
          return;
        }

        // Clone AMP Path
        if (targetType === 'amp') {
          await this.processAndFlashNam(modelUrl, modelName, slotIndex);
        }
      });
    });

    // Download-only button handler
    gridContainer.querySelectorAll('.btn-load-tone').forEach(btn => {
      btn.addEventListener('click', async () => {
        const toneId = btn.dataset.id;
        const tone = this.tones.find(t => String(t.id) === String(toneId));
        if (!tone) return;

        const selectedVar = this.selectedVariations[toneId];
        if (!selectedVar?.url) {
          notify("Questa cattura non ha ancora un file scaricabile: attendi il caricamento dei file o scegline un'altra.", 'warning');
          return;
        }

        const payload = {
          ...tone,
          toneTitle: tone.title,
          variationName: selectedVar.name,
          title: selectedVar.name,
          modelId: selectedVar.id,
          modelUrl: selectedVar.url,
          size: selectedVar.size || 'standard'
        };

        let targetType = this.selectedTargetType;
        let slotIndex = this.selectedTargetSlot;
        if (tone.gear === 'cab' || tone.gear === 'ir') targetType = 'cab';

        const slotLabel = targetType === 'amp' ? `NAM ${slotIndex + 1}` : `User IR ${slotIndex + 1}`;
        const extName = targetType === 'amp' ? '.nam' : '.wav';

        btn.disabled = true;
        btn.innerHTML = `<div class="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div><span>Download...</span>`;
        await this.downloadModelFile(payload, targetType);

        if (targetType === 'amp') {
          presetEngine.replaceCloneProfile(slotIndex, payload, this.applyToCurrentPreset);
          if (this.applyToCurrentPreset) await presetEngine.activateCloneSlot(slotIndex, true);
        } else {
          presetEngine.replaceUserIR(slotIndex, payload, this.applyToCurrentPreset);
          if (this.applyToCurrentPreset) await presetEngine.activateIRSlot(slotIndex, true);
        }

        btn.textContent = `✓ Salvato nei Download!`;
        btn.disabled = false;
        this.showDownloadNotice(payload.variationName, slotLabel, extName, false);
      });
    });
  }

  /**
   * Ask the name to store in the pedal slot before a flash. The field starts with the full
   * capture name (the user shortens it); writing is enabled only within the 14-character
   * pedal limit. Also used to rename a slot already in memory (`title`, `confirmLabel`, `note`).
   * Resolves with the cleaned name (printable ASCII) or null if cancelled.
   */
  askSlotName(defaultName, slotLabel, { title = 'Nome nella pedaliera', confirmLabel = 'Scrivi', note = '', max = 14 } = {}) {
    return askText({
      title,
      subtitle: slotLabel,
      value: defaultName,
      max,
      confirmLabel,
      note,
      filter: (s) => s.replace(/[^\x20-\x7E]/g, '') // printable ASCII only
    });
  }

  showFlashProgressModal(title, targetLabel) {
    let modal = document.getElementById('flashProgressModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'flashProgressModal';
      modal.className = 'fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="bg-[#18191e] border border-orange-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-150 text-zinc-100 font-sans">
        <div class="w-14 h-14 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 animate-pulse">
          <svg class="w-7 h-7 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <div>
          <h3 class="text-base font-black text-white">${title}</h3>
          <p class="text-xs text-orange-400 font-medium mt-1">${targetLabel}</p>
        </div>
        <div class="w-full space-y-2">
          <div class="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800 p-0.5 shadow-inner">
            <div id="flashProgressBar" class="h-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400 rounded-full transition-all duration-75 w-0"></div>
          </div>
          <div class="flex justify-between text-[11px] font-mono text-zinc-400">
            <span id="flashPacketCount">Invio pacchetti SysEx...</span>
            <span id="flashPercent" class="font-bold text-orange-400">0%</span>
          </div>
        </div>
        <div class="text-[11px] text-zinc-400 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>Scrittura Flash hardware via SysEx... Non scollegare.</span>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }

  updateFlashProgress(current, total, percent) {
    const bar = document.getElementById('flashProgressBar');
    const count = document.getElementById('flashPacketCount');
    const pct = document.getElementById('flashPercent');
    if (bar) bar.style.width = `${percent}%`;
    if (count) count.textContent = `Pacchetto ${current} di ${total}`;
    if (pct) pct.textContent = `${percent}%`;
  }

  hideFlashProgressModal(successMessage) {
    const modal = document.getElementById('flashProgressModal');
    if (!modal) return;
    if (successMessage) {
      modal.innerHTML = `
        <div class="bg-[#18191e] border border-emerald-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-150 text-zinc-100 font-sans">
          <div class="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <svg class="w-8 h-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div>
            <h3 class="text-base font-black text-white">Scrittura Completata!</h3>
            <p class="text-xs text-zinc-300 mt-1">${successMessage}</p>
          </div>
          <div class="text-[11px] text-emerald-400 font-bold">
            Il profilo è salvato nella memoria interna ed è subito attivo per suonare!
          </div>
        </div>
      `;
      setTimeout(() => {
        modal.style.display = 'none';
      }, 1600);
    } else {
      modal.style.display = 'none';
    }
  }

  async processAndFlashWavFile(file, slotIndex) {
    const cleanName = await this.askSlotName(file.name.replace(/\.[^/.]+$/, ''), `Slot User IR ${slotIndex + 1}`);
    if (!cleanName) return;
    this.showFlashProgressModal(`Caricamento IR "${cleanName}"`, `Scrittura nello slot User IR ${slotIndex + 1}`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);

      const samples = new Float32Array(512);
      const count = Math.min(512, channelData.length);
      let maxVal = 0;
      for (let i = 0; i < count; i++) {
        if (Math.abs(channelData[i]) > maxVal) maxVal = Math.abs(channelData[i]);
      }
      const scale = maxVal > 0 ? (0.95 / maxVal) : 1.0;
      for (let i = 0; i < count; i++) samples[i] = channelData[i] * scale;

      await presetEngine.flashIRToPedal(slotIndex, samples, cleanName, (curr, tot, pct) => {
        this.updateFlashProgress(curr, tot, pct);
      });

      await presetEngine.activateIRSlot(slotIndex, true);
      this.hideFlashProgressModal(`User IR ${slotIndex + 1} ("${cleanName}") memorizzato con successo!`);
      this.render();
    } catch (err) {
      console.error('Flash IR failed:', err);
      notify(`Errore caricamento IR: ${err.message}`, 'error');
      this.hideFlashProgressModal();
    }
  }

  async processAndFlashCloFile(fileOrBytes, name, slotIndex) {
    const cleanName = await this.askSlotName(name || 'Clone', `Slot Clone AMP ${slotIndex + 1}`);
    if (!cleanName) return;
    this.showFlashProgressModal(`Scrittura CLO "${cleanName}"`, `Scrittura nello slot Clone AMP ${slotIndex + 1}`);

    try {
      let rawBytes;
      if (fileOrBytes instanceof Uint8Array) {
        rawBytes = fileOrBytes;
      } else {
        const arrayBuffer = await fileOrBytes.arrayBuffer();
        rawBytes = new Uint8Array(arrayBuffer);
      }

      const lowModel = convertCLOToLowModel(rawBytes);
      await presetEngine.flashCloneToPedal(slotIndex, lowModel, cleanName, (curr, tot, pct) => {
        this.updateFlashProgress(curr, tot, pct);
      });
      await presetEngine.activateCloneSlot(slotIndex, true);
      this.hideFlashProgressModal(`Clone AMP ${slotIndex + 1} ("${cleanName}") memorizzato con successo!`);
      this.render();
    } catch (err) {
      console.error('Flash CLO failed:', err);
      notify(`Errore scrittura CLO: ${err.message}`, 'error');
      this.hideFlashProgressModal();
    }
  }

  async processAndFlashNam(namFileOrUrl, name, slotIndex) {
    const cleanName = await this.askSlotName(name || 'Model', `Slot Clone AMP ${slotIndex + 1}`);
    if (!cleanName) return;
    this.showFlashProgressModal(`Conversione NAM "${cleanName}"`, `Conversione in Clone AMP (~20s), poi scrittura nello slot ${slotIndex + 1}`);

    try {
      let res;
      if (typeof namFileOrUrl === 'string') {
        res = await CompilerBridgeService.convertNam({ url: namFileOrUrl, name: cleanName });
      } else {
        res = await CompilerBridgeService.convertNam({ file: namFileOrUrl, name: cleanName });
      }

      const arrayBuffer = await res.blob.arrayBuffer();
      const binaryData = new Uint8Array(arrayBuffer);

      // If it's a CLO file or Low Model
      if (binaryData.length === 2696 || binaryData.length === 8840) {
        const lowModel = convertCLOToLowModel(binaryData);
        await presetEngine.flashCloneToPedal(slotIndex, lowModel, cleanName, (curr, tot, pct) => {
          this.updateFlashProgress(curr, tot, pct);
        });
        await presetEngine.activateCloneSlot(slotIndex, true);
        this.hideFlashProgressModal(`Clone AMP ${slotIndex + 1} ("${cleanName}") memorizzato con successo!`);
        this.render();
        return;
      }

      // Unexpected format (e.g. legacy .namb from an old bridge): never flash it
      throw new Error(`Formato non flashabile (${binaryData.length} byte, attesi 2.696).`);
    } catch (err) {
      console.error('NAM convert/flash failed:', err);
      this.hideFlashProgressModal();
      const offline = /Failed to fetch|NetworkError|HTTP 50[24]/i.test(err.message);
      if (offline) {
        notify(import.meta.env?.DEV
          ? 'Server di conversione NAM non raggiungibile. Avvia "npm run dev:backend" sul PC con Sonicake Manager installato.'
          : 'Il servizio di conversione NAM non è raggiungibile in questo momento: riprova tra qualche minuto.', 'error');
      } else {
        notify(`Errore conversione/scrittura NAM: ${err.message}`, 'error');
      }
    }
  }

  showDownloadNotice(variationName, slotLabel, extName, compiledSuccess = false) {
    const existing = this.overlay.querySelector('.download-notice-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'download-notice-toast p-3.5 bg-zinc-950 border border-orange-500/40 rounded-xl text-xs text-zinc-200 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 shadow-xl shrink-0 my-2';
    
    toast.innerHTML = `
      <div class="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 font-bold mt-0.5">✓</div>
      <div class="flex-1 space-y-1">
        <div class="font-bold text-white flex items-center justify-between">
          <span>File <code>${extName}</code> salvato nei tuoi Download!</span>
          <button class="text-zinc-400 hover:text-white btn-close-toast text-xs">✕</button>
        </div>
        <p class="text-[11px] text-zinc-300 leading-relaxed">
          La variazione <strong>${variationName}</strong> è pronta sul tuo dispositivo.
        </p>
      </div>
    `;

    toast.querySelector('.btn-close-toast').addEventListener('click', () => toast.remove());
    const bodyEl = this.overlay.querySelector('.overflow-y-auto');
    if (bodyEl) {
      bodyEl.prepend(toast);
    }
  }

  async downloadModelFile(payload, targetType) {
    const ext = targetType === 'amp' ? '.nam' : '.wav';
    const cleanFileName = (payload.variationName || payload.title || 'Tone3000_Model')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim() + ext;

    const fileUrl = payload.modelUrl || payload.url;
    if (fileUrl && fileUrl.startsWith('http')) {
      try {
        const resp = await fetch(fileUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = cleanFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
          return true;
        }
      } catch (e) {
        console.warn('Fetch download failed, falling back to direct anchor:', e);
      }

      const a = document.createElement('a');
      a.href = fileUrl;
      a.download = cleanFileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }
    return false;
  }

  attachDragAndDropListeners() {
    const dropzones = this.overlay.querySelectorAll('.slot-dropzone');
    dropzones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('border-orange-500', 'bg-orange-950/20');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('border-orange-500', 'bg-orange-950/20');
      });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('border-orange-500', 'bg-orange-950/20');

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const type = zone.dataset.type;
        const slot = parseInt(zone.dataset.slot, 10);
        const lower = file.name.toLowerCase();

        if (type === 'cab' || lower.endsWith('.wav')) {
          if (connection.isConnected) {
            await this.processAndFlashWavFile(file, slot);
          } else {
            notify('Connetti prima la pedaliera via USB o Bluetooth in alto a destra.', 'warning');
          }
        } else if (type === 'amp') {
          if (connection.isConnected) {
            if (lower.endsWith('.clo')) {
              await this.processAndFlashCloFile(file, file.name.replace(/\.[^/.]+$/, ''), slot);
            } else if (lower.endsWith('.nam')) {
              await this.processAndFlashNam(file, file.name.replace(/\.[^/.]+$/, ''), slot);
            } else {
              notify('Formato non supportato. Trascina un file .clo o .nam.', 'warning');
            }
          } else {
            notify('Connetti prima la pedaliera via USB o Bluetooth in alto a destra.', 'warning');
          }
        }
      });
    });
  }

  attachEventListeners() {
    this.attachDragAndDropListeners();

    // Tab switching
    const tabBtnMem = this.overlay.querySelector('#tabBtnMemory');
    const tabBtnBrowse = this.overlay.querySelector('#tabBtnBrowse');

    if (tabBtnMem) {
      tabBtnMem.addEventListener('click', () => {
        this.activeTab = 'memory';
        this.render();
      });
    }
    if (tabBtnBrowse) {
      tabBtnBrowse.addEventListener('click', () => {
        this.activeTab = 'browse';
        this.render();
        this.fetchTones();
      });
    }

    // Memory Tab: slot Tone3000 search buttons
    this.overlay.querySelectorAll('.btn-slot-search-tone3000').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const slot = parseInt(btn.dataset.slot, 10);
        this.activeTab = 'browse';
        this.selectedTargetType = type;
        this.selectedTargetSlot = slot;
        this.currentGear = type === 'amp' ? 'amp' : 'cab';
        this.render();
        this.fetchTones();
      });
    });

    // Memory Tab: slot Audition buttons (instant hardware switch)
    this.overlay.querySelectorAll('.btn-slot-audition').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const slot = parseInt(btn.dataset.slot, 10);
        if (type === 'amp') {
          await presetEngine.activateCloneSlot(slot, true);
        } else {
          await presetEngine.activateIRSlot(slot, true);
        }
        this.render();
      });
    });

    // Memory Tab: slot file inputs (.nam / .wav / .clo)
    this.overlay.querySelectorAll('.slot-file-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const type = input.dataset.type;
        const slot = parseInt(input.dataset.slot, 10);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').trim().slice(0, 14);
        const lower = file.name.toLowerCase();

        // IR
        if (type === 'cab' || lower.endsWith('.wav')) {
          if (connection.isConnected) {
            await this.processAndFlashWavFile(file, slot);
          } else {
            presetEngine.replaceUserIR(slot, cleanName, true);
            this.render();
            notify('File IR impostato in memoria! Per scriverlo nel chip hardware, connetti la pedaliera via USB o Bluetooth.', 'info');
          }
          input.value = '';
          return;
        }

        // Clone AMP
        if (type === 'amp') {
          if (connection.isConnected) {
            if (lower.endsWith('.clo')) {
              await this.processAndFlashCloFile(file, cleanName, slot);
            } else if (lower.endsWith('.nam')) {
              await this.processAndFlashNam(file, cleanName, slot);
            } else {
              notify('Formato non supportato. Seleziona un file .clo o .nam.', 'warning');
            }
          } else {
            presetEngine.replaceCloneProfile(slot, cleanName, true);
            this.render();
            notify('Profilo Clone impostato in memoria! Per scriverlo nel chip hardware, connetti la pedaliera via USB o Bluetooth.', 'info');
          }
          input.value = '';
          return;
        }
      });
    });

    // Memory Tab: slot rename buttons
    this.overlay.querySelectorAll('.btn-slot-rename').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const slot = parseInt(btn.dataset.slot, 10);
        const engineType = type === 'amp' ? 'Clone' : 'IR';
        const slotLabel = type === 'amp' ? `Slot Clone AMP ${slot + 1}` : `Slot User IR ${slot + 1}`;
        const currentName = type === 'amp' ? presetEngine.cloneSlotNames[slot] : presetEngine.irSlotNames[slot];
        // The name is written on the pedal (native rename message): it needs the pedal connected
        if (!connection.isConnected) {
          notify('Collega la pedaliera via USB o Bluetooth per rinominare lo slot.', 'warning');
          return;
        }
        const newName = await this.askSlotName(currentName, slotLabel, {
          title: 'Rinomina',
          confirmLabel: 'Rinomina',
          max: SLOT_RENAME_MAX,
          note: "Il nome viene scritto direttamente sulla pedaliera (al massimo 10 caratteri, come nell'app ufficiale): la cattura nello slot non cambia."
        });
        if (!newName || newName === currentName) return;
        try {
          const confirmed = await presetEngine.renameSlotOnPedal(engineType, slot, newName);
          notify(confirmed
            ? `${slotLabel} rinominato in "${newName}".`
            : `${slotLabel}: nome inviato, ma la pedaliera non l'ha ancora confermato. Verifica con una sincronizzazione.`,
            confirmed ? 'success' : 'warning');
        } catch (err) {
          notify(`Rinomina non riuscita: ${err.message}`, 'error');
        }
        this.render();
      });
    });

    // Browse Tab: Target Slot dropdown selector
    const targetSelector = this.overlay.querySelector('.target-slot-selector');
    if (targetSelector) {
      targetSelector.addEventListener('change', (e) => {
        const [type, slotStr] = e.target.value.split(':');
        this.selectedTargetType = type;
        this.selectedTargetSlot = parseInt(slotStr, 10);
      });
    }

    // Browse Tab: Apply to current preset checkbox
    const applyCheck = this.overlay.querySelector('#checkApplyToCurrent');
    if (applyCheck) {
      applyCheck.addEventListener('change', (e) => {
        this.applyToCurrentPreset = e.target.checked;
      });
    }

    // Close buttons
    this.overlay.querySelectorAll('.modal-close-btn, .modal-close-btn-bottom').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Close on overlay backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Search input with debounce
    const searchInput = this.overlay.querySelector('.tone3000-input');
    const clearSearch = this.overlay.querySelector('.btn-clear-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(this.debounceTimer);
        this.searchQuery = e.target.value;
        clearSearch?.classList.toggle('hidden', !this.searchQuery);
        this.debounceTimer = setTimeout(() => this.fetchTones(), 400);
      });
    }
    // Clear button: empty the search and show the latest captures again right away
    clearSearch?.addEventListener('click', () => {
      clearTimeout(this.debounceTimer);
      this.searchQuery = '';
      searchInput.value = '';
      clearSearch.classList.add('hidden');
      searchInput.focus();
      this.fetchTones();
    });

    // Gear category filter pills
    this.overlay.querySelectorAll('.gear-pill[data-gear]').forEach(pill => {
      pill.addEventListener('click', () => {
        this.currentGear = pill.dataset.gear;
        this.overlay.querySelectorAll('.gear-pill[data-gear]').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.fetchTones();
      });
    });
  }
}
