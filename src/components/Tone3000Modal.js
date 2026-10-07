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
import { CompilerBridgeService } from '../services/compiler-bridge.js';

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
    this.bridgeStatus = { available: false, url: CompilerBridgeService.getServerUrl() };

    this.checkBridgeStatus();
    this.render();
  }

  async checkBridgeStatus() {
    this.bridgeStatus = await CompilerBridgeService.checkHealth();
    const container = this.overlay.querySelector('#bridgeStatusContainer');
    if (container) {
      container.innerHTML = this.renderBridgeBadge();
      this.attachBridgeListeners();
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

  attachBridgeListeners() {
    const configBtns = this.overlay.querySelectorAll('.btn-config-bridge');
    configBtns.forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const currentUrl = CompilerBridgeService.getServerUrl();
        const newUrl = prompt(
          'Indirizzo Server Microservizio Compilatore NAMB (es. http://localhost:8080 oppure http://IP-VPS:8080):',
          currentUrl
        );
        if (newUrl !== null) {
          CompilerBridgeService.setServerUrl(newUrl);
          await this.checkBridgeStatus();
        }
      };
    });
  }

  renderBridgeBadge() {
    if (this.bridgeStatus?.available) {
      return `
        <button class="btn-config-bridge px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/50 text-[11px] text-emerald-300 flex items-center gap-1.5 transition-colors shadow-sm" title="Server Compilatore Attivo - Clicca per configurare URL">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="font-bold hidden sm:inline">Compilatore VPS:</span>
          <span class="font-semibold">Attivo (.namb)</span>
        </button>
      `;
    } else {
      return `
        <button class="btn-config-bridge px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700/80 text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors" title="Clicca per inserire l'indirizzo del tuo server VPS o Locale">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          <span class="hidden sm:inline">Compilatore VPS: Offline</span>
          <span class="text-cyan-400 font-semibold underline text-[10px]">Configura</span>
        </button>
      `;
    }
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

          <div class="flex items-center gap-2">
            <div id="bridgeStatusContainer">
              ${this.renderBridgeBadge()}
            </div>

            <button class="modal-close-btn p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
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
    const activeAmpFx = presetEngine.activePreset.selectedEffects[9] || presetEngine.activePreset.selectedEffects[3];
    const isAmpCloneActive = presetEngine.activePreset.ampMode === 'clone';
    const activeCabFx = presetEngine.activePreset.selectedEffects[4];

    return `
      <!-- Safety & Workflow Info Banner (Option A Guide) -->
      <div class="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
          <div>
            <div class="text-sm font-bold text-white flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              Memoria Hardware Smart Box (5 NAM + 5 IR)
            </div>
            <p class="text-xs text-zinc-400 mt-0.5">
              10 banchi fisici indipendenti. Modificare o scaricare catture qui non tocca i tuoi 50 preset utente.
            </p>
          </div>
          <button class="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold whitespace-nowrap transition-all flex items-center justify-center gap-2 shadow-sm" id="btnGoToBrowse">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            Esplora Cloud Tone3000
          </button>
        </div>

        <!-- 2-Step Option A Workflow explanation -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div class="p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/40 flex items-start gap-2.5">
            <div class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">1</div>
            <div>
              <div class="font-bold text-cyan-300">Download & Ascolto Immediato</div>
              <p class="text-zinc-300/90 text-[11px] mt-0.5 leading-relaxed">
                Scaricando da Tone3000 ottieni il file audio originale (<code class="text-cyan-300">.nam</code> o <code class="text-cyan-300">.wav</code>) nei Download e la pedaliera si commuta subito sullo slot per farti ascoltare il suono in tempo reale.
              </p>
            </div>
          </div>

          <div class="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 flex items-start gap-2.5">
            <div class="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">2</div>
            <div>
              <div class="font-bold text-amber-300">Salvataggio Flash Definitivo (DSP)</div>
              <p class="text-zinc-300/90 text-[11px] mt-0.5 leading-relaxed">
                Per salvare il modello nella memoria permanente della pedaliera (così che rimanga anche a pedaliera spenta), carica il file scaricato nello slot tramite Sonicake Manager (che compila le reti neurali nel formato hardware <code class="text-amber-300">.namb</code>).
              </p>
            </div>
          </div>
        </div>
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
            <span class="text-[10px] text-zinc-500 font-mono">Banchi 901 - 905</span>
          </div>

          <div class="space-y-2.5">
            ${cloneNames.map((name, i) => {
              const meta = presetEngine.cloneSlotMetadata[i];
              const isCurrentActive = isAmpCloneActive && (activeAmpFx === 901 + i);
              const hasFileUrl = meta && (meta.modelUrl || meta.url);

              return `
                <div class="p-3.5 bg-zinc-950/50 border ${isCurrentActive ? 'border-amber-500/50 bg-amber-950/10 shadow-sm' : 'border-zinc-800 hover:border-zinc-700'} rounded-xl flex flex-col gap-2.5 transition-all">
                  <!-- Header row: Slot Badge, Title, Variation, Status -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2.5 min-w-0">
                      <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
                        NAM ${i + 1}
                      </span>
                      <div class="min-w-0">
                        <div class="text-xs sm:text-sm font-bold text-zinc-100 truncate" title="${name}">${name}</div>
                        ${meta && meta.toneTitle && meta.toneTitle !== name ? `
                          <div class="text-[11px] text-zinc-400 truncate mt-0.5">Cattura: <span class="text-zinc-300">${meta.toneTitle}</span></div>
                        ` : ''}
                        ${meta && meta.variationName && meta.variationName !== name ? `
                          <div class="text-[10px] text-amber-400/90 truncate font-mono mt-0.5">Var: ${meta.variationName}</div>
                        ` : `
                          <div class="text-[10px] text-zinc-500 mt-0.5">Profilo Neural Modeler</div>
                        `}
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      ${isCurrentActive ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          ● In Ascolto
                        </span>
                      ` : `
                        <span class="text-[10px] text-zinc-500 font-mono">Slot 90${i + 1}</span>
                      `}
                    </div>
                  </div>

                  <!-- Actions Toolbar -->
                  <div class="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-zinc-800/60">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <button class="btn-slot-audition px-2.5 py-1 rounded ${isCurrentActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' : 'bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200'} text-[11px] font-semibold transition-colors flex items-center gap-1" data-type="amp" data-slot="${i}" title="Sintonizza la pedaliera su questo slot per provarlo">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        ${isCurrentActive ? 'Attivo' : 'Ascolta'}
                      </button>

                      ${hasFileUrl ? `
                        <button class="btn-slot-redownload px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-600 hover:text-white border border-cyan-800/60 text-cyan-300 text-[11px] font-semibold transition-colors flex items-center gap-1" data-type="amp" data-slot="${i}" title="Riscarica il file .nam originale">
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/></svg>
                          Scarica .nam
                        </button>
                      ` : ''}

                      <button class="btn-slot-search-tone3000 px-2 py-1 rounded bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-300 text-[11px] font-semibold transition-colors flex items-center gap-1" data-type="amp" data-slot="${i}" title="Cerca una cattura online su Tone3000">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                        Tone3000
                      </button>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      <label class="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1" title="Carica file .nam dal PC">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
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
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Right Column: 5 User IR slots -->
        <div class="space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span class="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
              5 Slot User Cabinet IR (.wav)
            </span>
            <span class="text-[10px] text-zinc-500 font-mono">Banchi 416 - 420</span>
          </div>

          <div class="space-y-2.5">
            ${irNames.map((name, i) => {
              const meta = presetEngine.irSlotMetadata[i];
              const isCurrentActive = activeCabFx === 416 + i;
              const hasFileUrl = meta && (meta.modelUrl || meta.url);

              return `
                <div class="p-3.5 bg-zinc-950/50 border ${isCurrentActive ? 'border-cyan-500/50 bg-cyan-950/10 shadow-sm' : 'border-zinc-800 hover:border-zinc-700'} rounded-xl flex flex-col gap-2.5 transition-all">
                  <!-- Header row: Slot Badge, Title, Variation, Status -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-start gap-2.5 min-w-0">
                      <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 shrink-0 mt-0.5">
                        IR ${i + 1}
                      </span>
                      <div class="min-w-0">
                        <div class="text-xs sm:text-sm font-bold text-zinc-100 truncate" title="${name}">${name}</div>
                        ${meta && meta.toneTitle && meta.toneTitle !== name ? `
                          <div class="text-[11px] text-zinc-400 truncate mt-0.5">Cattura: <span class="text-zinc-300">${meta.toneTitle}</span></div>
                        ` : ''}
                        ${meta && meta.variationName && meta.variationName !== name ? `
                          <div class="text-[10px] text-cyan-400/90 truncate font-mono mt-0.5">Var: ${meta.variationName}</div>
                        ` : `
                          <div class="text-[10px] text-zinc-500 mt-0.5">Impulse Response cassa</div>
                        `}
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      ${isCurrentActive ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          ● In Ascolto
                        </span>
                      ` : `
                        <span class="text-[10px] text-zinc-500 font-mono">Slot 41${6 + i}</span>
                      `}
                    </div>
                  </div>

                  <!-- Actions Toolbar -->
                  <div class="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-zinc-800/60">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <button class="btn-slot-audition px-2.5 py-1 rounded ${isCurrentActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold' : 'bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200'} text-[11px] font-semibold transition-colors flex items-center gap-1" data-type="cab" data-slot="${i}" title="Sintonizza la pedaliera su questo slot per provarlo">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                        ${isCurrentActive ? 'Attivo' : 'Ascolta'}
                      </button>

                      ${hasFileUrl ? `
                        <button class="btn-slot-redownload px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-600 hover:text-white border border-cyan-800/60 text-cyan-300 text-[11px] font-semibold transition-colors flex items-center gap-1" data-type="cab" data-slot="${i}" title="Riscarica il file .wav originale">
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/></svg>
                          Scarica .wav
                        </button>
                      ` : ''}

                      <button class="btn-slot-search-tone3000 px-2 py-1 rounded bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-300 text-[11px] font-semibold transition-colors flex items-center gap-1" data-type="cab" data-slot="${i}" title="Cerca una cassa / IR su Tone3000">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                        Tone3000
                      </button>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      <label class="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1" title="Carica file .wav dal PC">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
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

      <!-- Hardware Memory Info Banner -->
      <div class="p-3 bg-cyan-950/40 border border-cyan-800/40 rounded-xl text-xs text-cyan-200/90 flex items-start gap-2.5">
        <svg class="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div class="leading-relaxed">
          <strong>Download & Memoria Hardware:</strong> Cliccando su <em>Scarica & Seleziona</em> viene scaricato il file originale (<code class="text-cyan-300">.nam</code> o <code class="text-cyan-300">.wav</code>) e commutata la pedaliera sul banco scelto. Per scrivere in modo permanente il nuovo file audio nella memoria interna del DSP Sonicake, carica il file scaricato nello slot tramite Sonicake Manager (che compila il formato neurale hardware <code class="text-cyan-300">.namb</code>).
        </div>
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
                  <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/>
                </svg>
                Scarica & Seleziona Slot
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
      btn.addEventListener('click', async () => {
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

        const slotLabel = targetType === 'amp' ? `Clone ${slotIndex + 1}` : `User IR ${slotIndex + 1}`;
        let compiledSuccess = false;
        let extName = targetType === 'amp' ? '.nam' : '.wav';

        btn.disabled = true;

        // If compiler bridge is available and it's a NAM model, compile directly to hardware .namb!
        if (targetType === 'amp' && this.bridgeStatus?.available) {
          btn.innerHTML = `
            <div class="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Compilazione hardware (.namb)...</span>
          `;
          try {
            const res = await CompilerBridgeService.convertNam({
              url: payload.modelUrl,
              name: payload.variationName
            });
            CompilerBridgeService.downloadBlob(res.blob, res.fileName);
            compiledSuccess = true;
            extName = '.namb';
            connection.log(`Compilato e scaricato file hardware "${res.fileName}" (${(res.size / 1024).toFixed(1)} KB) pronto per Sonicake Smart Box!`, 'success');
          } catch (err) {
            console.warn('Compilazione microservizio fallita, fallback su .nam standard:', err);
            connection.log(`Avviso compilazione microservizio: ${err.message}. Procedo con download .nam originale.`, 'warning');
          }
        }

        // If not compiled (or fallback), download raw file (.nam or .wav)
        if (!compiledSuccess) {
          btn.innerHTML = `
            <div class="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Download ${extName}...</span>
          `;
          await this.downloadModelFile(payload, targetType);
        }

        if (targetType === 'amp') {
          presetEngine.replaceCloneProfile(slotIndex, payload, this.applyToCurrentPreset);
          if (this.applyToCurrentPreset) {
            await presetEngine.activateCloneSlot(slotIndex, true);
          }
        } else {
          presetEngine.replaceUserIR(slotIndex, payload, this.applyToCurrentPreset);
          if (this.applyToCurrentPreset) {
            await presetEngine.activateIRSlot(slotIndex, true);
          }
        }

        btn.textContent = `✓ ${compiledSuccess ? 'Compilato (.namb)' : 'Scaricato'} & Selezionato ${slotLabel}!`;
        btn.className = 'btn-load-tone w-full py-2 px-3 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm';
        btn.disabled = false;

        connection.log(`Impostato ${slotLabel}: "${payload.variationName}" e commutata la pedaliera.`, 'success');

        this.showDownloadNotice(payload.variationName, slotLabel, extName, compiledSuccess);

        setTimeout(() => {
          btn.innerHTML = `
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/>
            </svg>
            ${this.bridgeStatus?.available && targetType === 'amp' ? 'Compila (.namb) & Seleziona' : 'Scarica & Seleziona Slot'}
          `;
          btn.className = 'btn-load-tone w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-200 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm';
        }, 2500);
      });
    });
  }

  showDownloadNotice(variationName, slotLabel, extName, compiledSuccess = false) {
    const existing = this.overlay.querySelector('.download-notice-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'download-notice-toast p-3.5 bg-zinc-950 border border-emerald-500/40 rounded-xl text-xs text-zinc-200 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-2 shadow-xl shrink-0 my-2';
    
    const bannerInfo = compiledSuccess
      ? `<div class="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] text-emerald-300 leading-normal mt-1">
          <strong>✓ Compilazione Hardware Eseguita con Successo:</strong> Il microservizio ha compilato il modello NAM nel formato hardware proprietario <code>.namb</code> (firmware Sonicake). Il file è stato generato e salvato nei download pronto per il caricamento nel chip.
        </div>`
      : `<div class="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-300/90 leading-normal mt-1">
          <strong>Per salvare il suono fisicamente nella memoria permanente:</strong> Carica il file scaricato nello slot tramite Sonicake Manager (che converte i file .nam nel formato DSP hardware).
        </div>`;

    toast.innerHTML = `
      <div class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold mt-0.5">✓</div>
      <div class="flex-1 space-y-1">
        <div class="font-bold text-white flex items-center justify-between">
          <span>File <code>${extName}</code> salvato nei tuoi Download!</span>
          <button class="text-zinc-400 hover:text-white btn-close-toast text-xs">✕</button>
        </div>
        <p class="text-[11px] text-zinc-300 leading-relaxed">
          La variazione <strong>${variationName}</strong> è stata assegnata a <strong>${slotLabel}</strong> e la pedaliera è stata commutata su questo banco.
        </p>
        ${bannerInfo}
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

  attachEventListeners() {
    this.attachBridgeListeners();

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

    // Memory Tab: slot Re-download buttons
    this.overlay.querySelectorAll('.btn-slot-redownload').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.type;
        const slot = parseInt(btn.dataset.slot, 10);
        const meta = type === 'amp' ? presetEngine.cloneSlotMetadata[slot] : presetEngine.irSlotMetadata[slot];
        if (meta && (meta.modelUrl || meta.url)) {
          const originalContent = btn.innerHTML;
          btn.innerHTML = `<div class="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>`;
          await this.downloadModelFile(meta, type);
          btn.innerHTML = originalContent;
          this.showDownloadNotice(meta.variationName || meta.toneTitle || 'File', type === 'amp' ? `NAM ${slot + 1}` : `User IR ${slot + 1}`, type === 'amp' ? '.nam' : '.wav');
        }
      });
    });

    // Memory Tab: slot local file inputs (.nam / .wav)
    this.overlay.querySelectorAll('.slot-file-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const type = input.dataset.type;
        const slot = parseInt(input.dataset.slot, 10);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').trim().slice(0, 14);
        let extName = type === 'amp' ? '.nam' : '.wav';
        let compiledSuccess = false;

        // Auto-compile to .namb if user picked a .nam file and bridge microservice is online
        if (type === 'amp' && this.bridgeStatus?.available && file.name.toLowerCase().endsWith('.nam')) {
          try {
            connection.log(`Compilazione microservizio file locale "${file.name}" in .namb hardware...`, 'info');
            const res = await CompilerBridgeService.convertNam({ file, name: cleanName });
            CompilerBridgeService.downloadBlob(res.blob, res.fileName);
            extName = '.namb';
            compiledSuccess = true;
            connection.log(`Compilato e scaricato ${res.fileName} pronto per il caricamento hardware!`, 'success');
          } catch (err) {
            console.warn('Compilazione locale fallita:', err);
          }
        }

        if (type === 'amp') {
          presetEngine.replaceCloneProfile(slot, cleanName, true);
          await presetEngine.activateCloneSlot(slot, true);
        } else {
          presetEngine.replaceUserIR(slot, cleanName, true);
          await presetEngine.activateIRSlot(slot, true);
        }
        this.render();
        this.showDownloadNotice(cleanName, type === 'amp' ? `Clone NAM ${slot + 1}` : `User IR ${slot + 1}`, extName, compiledSuccess);
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
