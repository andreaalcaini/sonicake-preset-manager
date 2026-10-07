/**
 * Tone3000 Cloud Explorer & Internal File Memory Manager Component
 * Manages the Sonicake Smart Box's internal saved files memory:
 * - 5 Clone AMP (Neural Amp Modeler .nam) slots
 * - 5 User Cabinet IR (.wav) slots
 * Allows browsing Tone3000 or uploading local files directly into internal memory slots
 * WITHOUT affecting or overwriting the user's 50 working presets!
 */

import { Tone3000Service } from '../services/tone3000.js';
import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';

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
    this.applyToCurrentPreset = false;
    this.selectedVariations = {};
    this.variationsCache = {};

    this.render();
  }

  open() {
    this.activeTab = 'memory';
    this.applyToCurrentPreset = false;
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
    this.applyToCurrentPreset = false;
    this.render();
    this.overlay.classList.add('active');
    this.fetchTones();
  }

  close() {
    this.overlay.classList.remove('active');
  }

  async fetchTones() {
    this.isLoading = true;
    this.renderGrid();

    try {
      this.tones = await Tone3000Service.searchTones({
        query: this.searchQuery,
        gear: this.currentGear,
        limit: 24
      });
    } catch (err) {
      console.warn('Tone3000 search error:', err);
    } finally {
      this.isLoading = false;
      this.renderGrid();
    }
  }

  async loadToneVariations(tone) {
    const toneId = tone.id;
    const selectEl = this.overlay.querySelector(`#varSelect-${toneId}`);
    const countEl = this.overlay.querySelector(`#varCount-${toneId}`);
    if (!selectEl) return;

    let models = this.variationsCache[toneId];
    if (!models) {
      if (tone.models && Array.isArray(tone.models) && tone.models.length > 0) {
        models = tone.models;
      } else {
        models = await Tone3000Service.getToneModels(toneId);
      }
      this.variationsCache[toneId] = models;
    }

    if (!models || models.length === 0) {
      models = [{
        id: tone.id,
        name: tone.title,
        size: 'standard',
        url: tone.url
      }];
    }

    if (countEl) {
      countEl.textContent = `${models.length} var.`;
    }

    selectEl.innerHTML = models.map((m, idx) => `
      <option value="${idx}">
        ${idx + 1}. ${m.name}
      </option>
    `).join('');

    // Default select first variation
    this.selectedVariations[toneId] = models[0];

    selectEl.onchange = (e) => {
      const selectedIndex = parseInt(e.target.value, 10);
      const chosen = models[selectedIndex] || models[0];
      this.selectedVariations[toneId] = chosen;
    };
  }

  render() {
    const cloneNames = presetEngine.cloneSlotNames;
    const irNames = presetEngine.irSlotNames;

    this.overlay.innerHTML = `
      <div class="w-full max-w-5xl h-[88vh] max-h-[92vh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-zinc-100">
        <!-- Header -->
        <div class="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shrink-0">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                  <path d="M12 12v9"></path>
                  <path d="m8 17 4 4 4-4"></path>
                </svg>
              </div>
              <div>
                <h3 class="text-sm font-bold tracking-tight text-white uppercase">Tone3000 & Memoria File</h3>
                <p class="text-[11px] text-zinc-400 hidden sm:block">Gestione slot hardware NAM & Cabinet IR</p>
              </div>
            </div>

            <!-- Segmented Control Tabs -->
            <div class="p-1 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center gap-1">
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${this.activeTab === 'memory' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}" id="tabBtnMemory">
                Slot Hardware (10)
              </button>
              <button class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${this.activeTab === 'browse' ? 'bg-cyan-500 text-zinc-950 font-bold shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}" id="tabBtnBrowse">
                Tone3000 Online
              </button>
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
        <div class="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          ${this.activeTab === 'memory' ? this.renderMemoryTab(cloneNames, irNames) : this.renderBrowseTab(cloneNames, irNames)}
        </div>

        <!-- Footer -->
        <div class="px-4 sm:px-6 py-3 border-t border-zinc-800/80 bg-zinc-950/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div class="text-[11px] text-zinc-400 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span><strong>Protezione preset:</strong> Gestisce solo i 10 file della memoria interna (5 NAM + 5 IR). I tuoi 50 preset utente non vengono toccati.</span>
          </div>
          <button class="modal-close-btn-bottom px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors">
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
    return `
      <!-- Safety info banner -->
      <div class="p-3.5 bg-zinc-950/60 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div class="text-xs sm:text-sm font-bold text-white">Memoria File Interna Hardware Smart Box</div>
          <p class="text-[11px] text-zinc-400 mt-0.5">
            10 banchi hardware per file utente (5 profili NAM e 5 Cabinet IR). Gestiscili o rimpiazzali senza toccare i tuoi preset.
          </p>
        </div>
        <button class="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold whitespace-nowrap transition-colors flex items-center justify-center gap-1.5" id="btnGoToBrowse">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          Cerca su Tone3000
        </button>
      </div>

      <!-- Dual column container -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <!-- Left Column: 5 Clone NAM slots -->
        <div class="space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span class="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-400"></span>
              5 Slot Clone AMP / NAM
            </span>
            <span class="text-[10px] text-zinc-500 font-mono">Slot 901 - 905</span>
          </div>

          <div class="space-y-2">
            ${cloneNames.map((name, i) => `
              <div class="p-3 bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-between gap-2.5 transition-colors">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                    NAM ${i + 1}
                  </span>
                  <div class="min-w-0">
                    <div class="text-xs sm:text-sm font-semibold text-zinc-100 truncate" title="${name}">${name}</div>
                    <div class="text-[10px] text-zinc-500">Profilo Neural Modeler</div>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <button class="btn-slot-search-tone3000 px-2 py-1 rounded bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-300 text-[11px] font-semibold transition-colors" data-type="amp" data-slot="${i}" title="Cerca su Tone3000">
                    Tone3000
                  </button>
                  <label class="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold cursor-pointer transition-colors" title="Carica file .nam dal PC">
                    .nam
                    <input type="file" accept=".nam" class="slot-file-input hidden" data-type="amp" data-slot="${i}">
                  </label>
                  <button class="btn-slot-rename p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" data-type="amp" data-slot="${i}" title="Rinomina">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Right Column: 5 User IR slots -->
        <div class="space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span class="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
              5 Slot User Cabinet IR (.wav)
            </span>
            <span class="text-[10px] text-zinc-500 font-mono">Slot 416 - 420</span>
          </div>

          <div class="space-y-2">
            ${irNames.map((name, i) => `
              <div class="p-3 bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-between gap-2.5 transition-colors">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0">
                    IR ${i + 1}
                  </span>
                  <div class="min-w-0">
                    <div class="text-xs sm:text-sm font-semibold text-zinc-100 truncate" title="${name}">${name}</div>
                    <div class="text-[10px] text-zinc-500">Impulse Response cassa</div>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <button class="btn-slot-search-tone3000 px-2 py-1 rounded bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-300 text-[11px] font-semibold transition-colors" data-type="cab" data-slot="${i}" title="Cerca su Tone3000">
                    Tone3000
                  </button>
                  <label class="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold cursor-pointer transition-colors" title="Carica file .wav dal PC">
                    .wav
                    <input type="file" accept=".wav" class="slot-file-input hidden" data-type="cab" data-slot="${i}">
                  </label>
                  <button class="btn-slot-rename p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" data-type="cab" data-slot="${i}" title="Rinomina">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderBrowseTab(cloneNames, irNames) {
    const isCab = this.selectedTargetType === 'cab';

    return `
      <!-- Target Slot Selection Bar -->
      <div class="p-3.5 bg-zinc-950/60 border border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-xs font-bold text-zinc-300 uppercase tracking-wider">Salva nello Slot Hardware:</span>
          
          <select class="target-slot-selector px-3 py-1.5 bg-zinc-900 border border-zinc-700 focus:border-cyan-500 rounded-lg text-xs font-medium text-white outline-none">
            <optgroup label="--- 5 Slot Clone AMP / NAM ---">
              ${cloneNames.map((name, i) => `
                <option value="amp:${i}" ${!isCab && i === this.selectedTargetSlot ? 'selected' : ''}>
                  NAM Slot ${i + 1}: ${name}
                </option>
              `).join('')}
            </optgroup>
            <optgroup label="--- 5 Slot User Cabinet IR ---">
              ${irNames.map((name, i) => `
                <option value="cab:${i}" ${isCab && i === this.selectedTargetSlot ? 'selected' : ''}>
                  User IR Slot ${i + 1}: ${name}
                </option>
              `).join('')}
            </optgroup>
          </select>
        </div>

        <!-- Optional audition checkbox -->
        <label class="flex items-center gap-2 cursor-pointer text-xs text-zinc-400 select-none">
          <input type="checkbox" id="checkApplyToCurrent" ${this.applyToCurrentPreset ? 'checked' : ''} class="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/30">
          <span>Applica anche al suono attivo in riproduzione nell'editor</span>
        </label>
      </div>

      <!-- Search & Filters -->
      <div class="space-y-2.5">
        <div class="relative">
          <svg class="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input type="text" class="tone3000-input w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/50 rounded-xl text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors" placeholder="Cerca catture su Tone3000 (es. Marshall, Friedman, Dumble, Dual Rectifier, Bogner)..." value="${this.searchQuery}">
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button class="gear-pill px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${this.currentGear === 'all' ? 'bg-cyan-500 text-zinc-950 font-bold' : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'}" data-gear="all">Tutti</button>
          <button class="gear-pill px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${this.currentGear === 'amp' ? 'bg-cyan-500 text-zinc-950 font-bold' : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'}" data-gear="amp">Amps (NAM)</button>
          <button class="gear-pill px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${this.currentGear === 'pedal' ? 'bg-cyan-500 text-zinc-950 font-bold' : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'}" data-gear="pedal">Pedali</button>
          <button class="gear-pill px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${this.currentGear === 'full-rig' ? 'bg-cyan-500 text-zinc-950 font-bold' : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'}" data-gear="full-rig">Full Rig</button>
          <button class="gear-pill px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${this.currentGear === 'cab' ? 'bg-cyan-500 text-zinc-950 font-bold' : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800'}" data-gear="cab">Cabs / IR</button>
        </div>
      </div>

      <!-- Tones Grid Container -->
      <div class="tones-grid-container flex-1 overflow-y-auto min-h-[300px]"></div>
    `;
  }

  renderGrid() {
    const gridContainer = this.overlay.querySelector('.tones-grid-container');
    if (!gridContainer) return;

    if (this.isLoading) {
      gridContainer.innerHTML = `
        <div class="text-center py-16 text-cyan-400 font-semibold text-xs sm:text-sm flex flex-col items-center gap-2">
          <div class="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
          <span>Ricerca catture Tone3000 in corso...</span>
        </div>
      `;
      return;
    }

    if (this.tones.length === 0) {
      gridContainer.innerHTML = `
        <div class="text-center py-16 text-zinc-500 text-xs sm:text-sm">
          Nessuna cattura trovata per "${this.searchQuery}". Prova un altro modello o marca.
        </div>
      `;
      return;
    }

    gridContainer.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${this.tones.map(tone => `
          <div class="tone-card p-3.5 bg-zinc-950/40 border border-zinc-800 hover:border-zinc-700 rounded-xl flex flex-col justify-between gap-3 transition-all" data-id="${tone.id}">
            <div>
              <div class="flex items-start justify-between gap-2 mb-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-zinc-700/80 text-cyan-400">
                  ${tone.gear || 'NAM'}
                </span>
                <a href="${tone.url}" target="_blank" class="text-zinc-500 hover:text-zinc-300 text-xs" title="Scheda online Tone3000">
                  ↗
                </a>
              </div>

              <h4 class="text-xs sm:text-sm font-bold text-white line-clamp-1" title="${tone.title}">${tone.title}</h4>
              <p class="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">${tone.description || 'Nessuna descrizione'}</p>

              <!-- Creator Variations Selector -->
              <div class="mt-3 p-2 bg-zinc-900/60 border border-zinc-800 rounded-lg space-y-1">
                <div class="flex items-center justify-between text-[10px]">
                  <span class="text-zinc-400 font-semibold">Variazione Creatore:</span>
                  <span class="text-amber-400 font-mono font-bold" id="varCount-${tone.id}">...</span>
                </div>
                <select class="tone-variation-select w-full px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-[11px] text-zinc-200 outline-none" data-tone-id="${tone.id}" id="varSelect-${tone.id}">
                  <option value="0" selected>Caricamento variazioni...</option>
                </select>
              </div>
            </div>

            <div class="pt-2 border-t border-zinc-800/60 flex items-center justify-end">
              <button class="btn-load-tone w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-200 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm" data-id="${tone.id}">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Salva in Memoria
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Asynchronously load creator variations for all visible tone cards
    this.tones.forEach(tone => {
      this.loadToneVariations(tone);
    });

    // Attach click listeners to Load buttons
    gridContainer.querySelectorAll('.btn-load-tone').forEach(btn => {
      btn.addEventListener('click', () => {
        const toneId = btn.dataset.id;
        const tone = this.tones.find(t => String(t.id) === String(toneId));
        if (!tone) return;

        // Retrieve selected variation
        const selectedVar = this.selectedVariations[toneId] || (tone.models && tone.models[0]) || {
          name: tone.title,
          id: tone.id,
          url: tone.url
        };

        const payload = {
          ...tone,
          toneTitle: tone.title,
          variationName: selectedVar.name,
          title: selectedVar.name,
          modelId: selectedVar.id,
          modelUrl: selectedVar.url,
          size: selectedVar.size || 'standard'
        };

        // Determine destination slot & type
        let targetType = this.selectedTargetType;
        let slotIndex = this.selectedTargetSlot;

        // Auto-match if user picked a cab but targetType is amp, or vice-versa
        if (tone.gear === 'cab' || tone.gear === 'ir') {
          targetType = 'cab';
        }

        if (targetType === 'amp') {
          presetEngine.replaceCloneProfile(slotIndex, payload, this.applyToCurrentPreset);
        } else {
          presetEngine.replaceUserIR(slotIndex, payload, this.applyToCurrentPreset);
        }

        const slotLabel = targetType === 'amp' ? `Clone ${slotIndex + 1}` : `User IR ${slotIndex + 1}`;
        btn.textContent = `✓ Salvato in ${slotLabel}!`;
        btn.className = 'btn-load-tone w-full py-2 px-3 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm';

        setTimeout(() => {
          btn.innerHTML = `
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            Salva in Memoria
          `;
          btn.className = 'btn-load-tone w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-200 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm';
        }, 1800);
      });
    });
  }

  attachEventListeners() {
    // Tab switching
    const tabBtnMem = this.overlay.querySelector('#tabBtnMemory');
    const tabBtnBrowse = this.overlay.querySelector('#tabBtnBrowse');
    const btnGoToBrowse = this.overlay.querySelector('#btnGoToBrowse');

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
    if (btnGoToBrowse) {
      btnGoToBrowse.addEventListener('click', () => {
        this.activeTab = 'browse';
        this.render();
        this.fetchTones();
      });
    }

    // Memory Tab: slot Tone3000 buttons
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

    // Memory Tab: slot local file inputs (.nam / .wav)
    this.overlay.querySelectorAll('.slot-file-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const type = input.dataset.type;
        const slot = parseInt(input.dataset.slot, 10);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').trim().slice(0, 14);

        if (type === 'amp') {
          presetEngine.replaceCloneProfile(slot, cleanName, false);
        } else {
          presetEngine.replaceUserIR(slot, cleanName, false);
        }
        this.render();
      });
    });

    // Memory Tab: slot rename buttons
    this.overlay.querySelectorAll('.btn-slot-rename').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const slot = parseInt(btn.dataset.slot, 10);
        const currentName = type === 'amp' ? presetEngine.cloneSlotNames[slot] : presetEngine.irSlotNames[slot];
        const newName = prompt(`Rinomina ${type === 'amp' ? 'Clone Profile' : 'User IR'} ${slot + 1} (max 14 caratteri):`, currentName);
        if (newName && newName.trim()) {
          if (type === 'amp') {
            presetEngine.replaceCloneProfile(slot, newName.trim(), false);
          } else {
            presetEngine.replaceUserIR(slot, newName.trim(), false);
          }
          this.render();
        }
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
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(this.debounceTimer);
        this.searchQuery = e.target.value;
        this.debounceTimer = setTimeout(() => this.fetchTones(), 400);
      });
    }

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
