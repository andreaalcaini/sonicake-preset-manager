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
import { convertCLOToLowModel } from '../core/protocol.js';

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
    if (this.bridgeStatus.available) {
      const hwSlots = await CompilerBridgeService.getHardwareSlots();
      if (hwSlots && hwSlots.cloneSlots) {
        let changed = false;
        hwSlots.cloneSlots.forEach((name, i) => {
          if (name && (!presetEngine.cloneSlotNames[i] || presetEngine.cloneSlotNames[i].includes('User Profile') || presetEngine.cloneSlotNames[i] === 'Empty')) {
            presetEngine.cloneSlotNames[i] = name;
            changed = true;
          }
        });
        if (changed) {
          try {
            localStorage.setItem('sonicake_clone_names', JSON.stringify(presetEngine.cloneSlotNames));
          } catch (_) {}
          presetEngine.emit('userSlotsChange', { type: 'Clone', names: presetEngine.cloneSlotNames });
        }
      }
    }
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

        <!-- Direct Flash Flashing Workflow -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div class="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-start gap-2.5">
            <div class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">⚡</div>
            <div>
              <div class="font-bold text-emerald-300">Scrittura Diretta Flash 100% Automatica</div>
              <p class="text-zinc-300/90 text-[11px] mt-0.5 leading-relaxed">
                I file (.nam o .wav) vengono compilati e scritti <strong>direttamente nella memoria Flash interna</strong> della pedaliera tramite Web MIDI in pochi secondi. Sonicake Manager non serve più!
              </p>
            </div>
          </div>

          <div class="p-3 rounded-lg bg-cyan-950/30 border border-cyan-800/40 flex items-start gap-2.5">
            <div class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">🎵</div>
            <div>
              <div class="font-bold text-cyan-300">Ascolto Immediato su Pedaliera</div>
              <p class="text-zinc-300/90 text-[11px] mt-0.5 leading-relaxed">
                Appena terminata la scrittura dei pacchetti, lo slot si attiva istantaneamente per farti suonare subito con il nuovo profilo cassa o amplificatore.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Hardware Verified Models & Official Importer Banner -->
      <div class="p-4 bg-gradient-to-r from-amber-950/20 via-zinc-950 to-emerald-950/20 border border-amber-500/30 rounded-xl space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800">
          <div>
            <div class="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              Profili Clone AMP Verificati al 100% (Zero Freeze Hardware)
            </div>
            <p class="text-[11px] text-zinc-400 mt-0.5">
              Profili pre-compilati nel formato nativo Low Model (2.696 byte) testati direttamente su Smart Box.
            </p>
          </div>
          <button id="btnImportLatestClo" class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importa Ultimo CLO da Sonicake Manager
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div class="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg flex flex-col justify-between gap-2">
            <div>
              <div class="text-xs font-bold text-amber-300">Petersburg Thunder</div>
              <div class="text-[10px] text-zinc-400 mt-0.5">High Gain / Crunch boutique russo (2.696 bytes Low Model)</div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
              <select id="slotPetersburg" class="px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] text-zinc-200 outline-none">
                <option value="0">Slot 1</option>
                <option value="1">Slot 2</option>
                <option value="2">Slot 3</option>
                <option value="3">Slot 4</option>
                <option value="4">Slot 5</option>
              </select>
              <button class="btn-flash-verified flex-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all text-center" data-model="petersburg_thunder.clo" data-name="Petersburg" data-select="slotPetersburg">
                ⚡ Scrivi
              </button>
            </div>
          </div>

          <div class="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg flex flex-col justify-between gap-2">
            <div>
              <div class="text-xs font-bold text-amber-300">Audio Assault Slow30</div>
              <div class="text-[10px] text-zinc-400 mt-0.5">High Gain Moderno + 99 pedal (2.696 bytes Low Model)</div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
              <select id="slotSlow30" class="px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] text-zinc-200 outline-none">
                <option value="0">Slot 1</option>
                <option value="1" selected>Slot 2</option>
                <option value="2">Slot 3</option>
                <option value="3">Slot 4</option>
                <option value="4">Slot 5</option>
              </select>
              <button class="btn-flash-verified flex-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all text-center" data-model="slow30_high_gain.clo" data-name="Audio Assa" data-select="slotSlow30">
                ⚡ Scrivi
              </button>
            </div>
          </div>

          <div class="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg flex flex-col justify-between gap-2">
            <div>
              <div class="text-xs font-bold text-amber-300">Marshall 1959 Super Bowl</div>
              <div class="text-[10px] text-zinc-400 mt-0.5">Classic Plexi Super Lead Crunch (2.696 bytes Low Model)</div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
              <select id="slotMarshall" class="px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px] text-zinc-200 outline-none">
                <option value="0">Slot 1</option>
                <option value="1">Slot 2</option>
                <option value="2" selected>Slot 3</option>
                <option value="3">Slot 4</option>
                <option value="4">Slot 5</option>
              </select>
              <button class="btn-flash-verified flex-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all text-center" data-model="marshall_1959.clo" data-name="Marshall 1" data-select="slotMarshall">
                ⚡ Scrivi
              </button>
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
            ${cloneNames.map((rawName, i) => {
              const meta = presetEngine.cloneSlotMetadata[i];
              const isCurrentActive = isAmpCloneActive && (activeAmpFx === 901 + i);
              const hasFileUrl = meta && (meta.modelUrl || meta.url);
              let name = rawName;
              if (name === 'Audio Assa') name = 'Audio Assault Slow30';
              if (name === 'Petersburg') name = 'Petersburg Thunder';
              if (!name || name === 'Empty') name = `Slot ${i + 1} (Libero)`;

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
                        <input type="file" accept=".nam,.namb,.clo" class="slot-file-input hidden" data-type="amp" data-slot="${i}">
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
      <div class="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-xs text-emerald-200/90 flex items-start gap-2.5">
        <svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        <div class="leading-relaxed">
          <strong>⚡ Scrittura Diretta nella Pedaliera:</strong> Quando clicchi su <em>⚡ Scrivi su Pedaliera</em>, il modello viene compilato e scritto <strong>al 100% in automatico nella memoria Flash interna</strong> della pedaliera tramite Web MIDI in pochi secondi con avanzamento reale. Zero passaggi manuali!
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

            <div class="pt-2 border-t border-zinc-800/60 flex flex-col gap-1.5">
              <button class="btn-flash-tone w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm" data-id="${tone.id}">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                ⚡ Scrivi su Pedaliera
              </button>
              <button class="btn-load-tone w-full py-1 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[11px] font-semibold transition-all flex items-center justify-center gap-1" data-id="${tone.id}">
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4"/>
                </svg>
                Solo Download su PC
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

    // Attach click listeners to Flash buttons (Direct Hardware Flash via Web MIDI)
    gridContainer.querySelectorAll('.btn-flash-tone').forEach(btn => {
      btn.addEventListener('click', async () => {
        const toneId = btn.dataset.id;
        const tone = this.tones.find(t => String(t.id) === String(toneId));
        if (!tone) return;

        if (!connection.isConnected) {
          alert('Pedaliera non connessa! Connetti prima il dispositivo via USB o Bluetooth in alto a destra.');
          return;
        }

        const selectedVar = this.selectedVariations[toneId] || (tone.models && tone.models[0]) || {
          name: tone.title,
          id: tone.id,
          url: tone.url
        };

        const modelName = selectedVar.name || tone.title;
        let targetType = this.selectedTargetType;
        let slotIndex = this.selectedTargetSlot;
        if (tone.gear === 'cab' || tone.gear === 'ir') {
          targetType = 'cab';
        }

        const modelUrl = selectedVar.url;

        if (targetType === 'amp') {
          if (!modelUrl || (!modelUrl.toLowerCase().includes('.nam') && !modelUrl.toLowerCase().includes('/models/'))) {
            alert(`Il modello selezionato ("${modelName}") non dispone di un file .nam con download diretto pubblico su Tone3000.\n\nSuggerimento: Puoi scaricarlo manualmente dalla pagina web o caricare un file .nam dal tuo computer tramite il pulsante ".nam" nella scheda "Memoria".`);
            return;
          }
          await this.processAndFlashNam(modelUrl, modelName, slotIndex);
        } else {
          if (!modelUrl || (!modelUrl.toLowerCase().includes('.wav') && !modelUrl.toLowerCase().includes('/ir/') && !modelUrl.toLowerCase().includes('/models/'))) {
            alert(`Il profilo cassa IR selezionato ("${modelName}") non dispone di un file .wav con download diretto pubblico su Tone3000.\n\nPuoi caricare un file .wav dal tuo computer tramite la scheda "Memoria".`);
            return;
          }
          try {
            this.showFlashProgressModal(`Download IR "${modelName}"`, `Scrittura nello slot User IR ${slotIndex + 1}`);
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

            await presetEngine.flashIRToPedal(slotIndex, samples, modelName, (curr, tot, pct) => {
              this.updateFlashProgress(curr, tot, pct);
            });
            await presetEngine.activateIRSlot(slotIndex, true);
            this.hideFlashProgressModal(`User IR ${slotIndex + 1} ("${modelName}") memorizzato con successo!`);
            this.render();
          } catch (err) {
            console.error('Flash IR failed:', err);
            alert(`Errore caricamento IR: ${err.message}`);
            this.hideFlashProgressModal();
          }
        }
      });
    });

    // Attach click listeners to Download-only buttons
    gridContainer.querySelectorAll('.btn-load-tone').forEach(btn => {
      btn.addEventListener('click', async () => {
        const toneId = btn.dataset.id;
        const tone = this.tones.find(t => String(t.id) === String(toneId));
        if (!tone) return;

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

        let targetType = this.selectedTargetType;
        let slotIndex = this.selectedTargetSlot;
        if (tone.gear === 'cab' || tone.gear === 'ir') {
          targetType = 'cab';
        }

        const slotLabel = targetType === 'amp' ? `Clone ${slotIndex + 1}` : `User IR ${slotIndex + 1}`;
        let extName = targetType === 'amp' ? '.nam' : '.wav';

        btn.disabled = true;
        btn.innerHTML = `<div class="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div><span>Download...</span>`;
        await this.downloadModelFile(payload, targetType);

        if (targetType === 'amp') {
          presetEngine.replaceCloneProfile(slotIndex, payload, this.applyToCurrentPreset);
          if (this.applyToCurrentPreset) await presetEngine.activateCloneSlot(slotIndex, true);
        } else {
          presetEngine.replaceUserIR(slotIndex, payload, this.applyToCurrentPreset);
          if (this.applyToCurrentPreset) await presetEngine.activateIRSlot(slotIndex, true);
        }

        btn.textContent = `✓ Scaricato & Selezionato ${slotLabel}!`;
        btn.disabled = false;
        this.showDownloadNotice(payload.variationName, slotLabel, extName, false);
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

  showFlashProgressModal(title, targetLabel) {
    let modal = document.getElementById('flashProgressModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'flashProgressModal';
      modal.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-150 text-zinc-100">
        <div class="w-12 h-12 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 animate-pulse">
          <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </div>
        <div>
          <h3 class="text-base font-bold text-white">${title}</h3>
          <p class="text-xs text-zinc-400 mt-1">${targetLabel}</p>
        </div>
        <div class="w-full space-y-2">
          <div class="w-full h-3 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800 p-0.5">
            <div id="flashProgressBar" class="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-75 w-0"></div>
          </div>
          <div class="flex justify-between text-[11px] font-mono text-zinc-400">
            <span id="flashPacketCount">Invio pacchetti SysEx...</span>
            <span id="flashPercent" class="font-bold text-cyan-400">0%</span>
          </div>
        </div>
        <div class="text-[11px] text-zinc-400 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>Scrittura Flash hardware via Web MIDI... Non scollegare.</span>
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
        <div class="bg-zinc-900 border border-emerald-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-150 text-zinc-100">
          <div class="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div>
            <h3 class="text-base font-bold text-white">Scrittura Completata!</h3>
            <p class="text-xs text-zinc-300 mt-1">${successMessage}</p>
          </div>
          <div class="text-[11px] text-emerald-400/90 font-semibold">
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
    const cleanName = file.name.replace(/\.[^/.]+$/, '').trim().slice(0, 14);
    this.showFlashProgressModal(`Caricamento IR "${cleanName}"`, `Scrittura nello slot User IR ${slotIndex + 1}`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);

      // Extract 512 points and normalize peak
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
      alert(`Errore caricamento IR: ${err.message}`);
      this.hideFlashProgressModal();
    }
  }

  showNamToCloInstructionModal(name, slotIndex) {
    let modal = document.getElementById('namToCloModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'namToCloModal';
      modal.className = 'fixed inset-0 z-[10000] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4';
      document.body.appendChild(modal);
    }
    const cleanName = (name || 'Modello NAM').trim();
    const targetSlot = (typeof slotIndex === 'number' ? slotIndex : 0) + 1;

    modal.innerHTML = `
      <div class="bg-zinc-900 border border-amber-500/50 rounded-2xl p-6 max-w-lg w-full shadow-2xl flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-150 text-zinc-100">
        <!-- Header -->
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 text-xl font-bold">
            ⚡
          </div>
          <div class="flex-1">
            <h3 class="text-base font-bold text-white leading-tight">Formato Modelli Smart Box (QME-20)</h3>
            <p class="text-xs text-amber-400 font-medium mt-0.5">Protezione Hardware Zero-Freeze Attiva</p>
          </div>
          <button class="btn-close-nam-modal text-zinc-400 hover:text-white p-1 rounded-lg">✕</button>
        </div>

        <!-- Explanation -->
        <div class="p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs space-y-2 text-zinc-300 leading-relaxed">
          <p>
            La <strong>Smart Box QME-20</strong> accetta nella memoria Flash esclusivamente il formato a basso carico <strong>Low Model .clo (2.696 byte)</strong>.
          </p>
          <p class="text-zinc-400 text-[11px]">
            I file <code>.nam</code> grezzi pesano circa <strong>7.980 byte</strong>: inviarli via SysEx saturerebbe il buffer DMA provocando il blocco e la disconnessione della pedaliera.
          </p>
        </div>

        <!-- Action Options -->
        <div class="space-y-2.5 pt-1">
          <div class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Come procedere subito in 1 click:</div>

          <!-- Option 1: Import latest CLO from Sonicake Manager -->
          <button id="btnModalImportLatestClo" class="w-full p-3 rounded-xl bg-gradient-to-r from-cyan-600/30 to-cyan-500/10 hover:from-cyan-600/50 hover:to-cyan-500/20 border border-cyan-500/40 text-left transition-all flex items-center justify-between group">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 font-bold text-xs shrink-0">1</span>
              <div>
                <div class="text-xs font-bold text-cyan-200 group-hover:text-white">Importa da Sonicake Manager (Ultimo Profilo)</div>
                <div class="text-[10px] text-zinc-400">Hai appena importato "${cleanName}" in Sonicake Manager? Scrivilo subito nello Slot ${targetSlot}!</div>
              </div>
            </div>
            <span class="text-xs text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">⚡ Scrivi →</span>
          </button>

          <!-- Option 2: 1-Click Verified Zero-Freeze Models -->
          <button id="btnModalUseVerified" class="w-full p-3 rounded-xl bg-gradient-to-r from-emerald-600/20 to-emerald-500/5 hover:from-emerald-600/30 hover:to-emerald-500/15 border border-emerald-500/30 text-left transition-all flex items-center justify-between group">
            <div class="flex items-center gap-2.5">
              <span class="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-xs shrink-0">2</span>
              <div>
                <div class="text-xs font-bold text-emerald-200 group-hover:text-white">Usa Modelli Verificati al 100% (Zero-Freeze)</div>
                <div class="text-[10px] text-zinc-400">Petersburg Thunder, Slow30 High Gain, Marshall 1959 Plexi (2.696 bytes esatti)</div>
              </div>
            </div>
            <span class="text-xs text-emerald-400 font-bold">Vedi →</span>
          </button>
        </div>

        <!-- Footer -->
        <div class="pt-2 border-t border-zinc-800 flex justify-end">
          <button class="btn-close-nam-modal px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    modal.querySelectorAll('.btn-close-nam-modal').forEach(b => {
      b.addEventListener('click', () => { modal.style.display = 'none'; });
    });

    const btnImport = modal.querySelector('#btnModalImportLatestClo');
    if (btnImport) {
      btnImport.addEventListener('click', () => {
        modal.style.display = 'none';
        const btnMainImport = this.overlay.querySelector('#btnImportLatestClo');
        if (btnMainImport) btnMainImport.click();
      });
    }

    const btnVerified = modal.querySelector('#btnModalUseVerified');
    if (btnVerified) {
      btnVerified.addEventListener('click', () => {
        modal.style.display = 'none';
        this.activeTab = 'memory';
        this.render();
      });
    }
  }

  async processAndFlashNam(namFileOrUrl, name, slotIndex) {
    const cleanName = (name || 'Model').trim().slice(0, 14);
    this.showFlashProgressModal(`Preparazione "${cleanName}"`, `Controllo formato per Clone AMP ${slotIndex + 1}`);

    try {
      let res;
      if (typeof namFileOrUrl === 'string') {
        res = await CompilerBridgeService.convertNam({ url: namFileOrUrl, name: cleanName });
      } else {
        res = await CompilerBridgeService.convertNam({ file: namFileOrUrl, name: cleanName });
      }

      const arrayBuffer = await res.blob.arrayBuffer();
      const binaryData = new Uint8Array(arrayBuffer);

      // Check if it's an oversized .namb or non-CLO model (7,980 bytes or unexpected size)
      if (binaryData.length === 7980 || (binaryData.length !== 2696 && binaryData.length !== 8840 && binaryData.length !== 2770)) {
        this.hideFlashProgressModal();
        this.showNamToCloInstructionModal(cleanName, slotIndex);
        return;
      }

      await presetEngine.flashCloneToPedal(slotIndex, binaryData, cleanName, (curr, tot, pct) => {
        this.updateFlashProgress(curr, tot, pct);
      });

      await presetEngine.activateCloneSlot(slotIndex, true);
      this.hideFlashProgressModal(`Clone AMP ${slotIndex + 1} ("${cleanName}") memorizzato con successo!`);
      this.render();
    } catch (err) {
      console.error('Flash Clone failed:', err);
      this.hideFlashProgressModal();
      if (err.message && (err.message.includes('7980') || err.message.includes('Dimensione binario'))) {
        this.showNamToCloInstructionModal(cleanName, slotIndex);
      } else {
        alert(`Errore scrittura NAM: ${err.message}`);
      }
    }
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

    // Hardware Verified Models: 1-click Direct Flash
    this.overlay.querySelectorAll('.btn-flash-verified').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!connection.isConnected) {
          alert('Pedaliera non connessa! Connetti prima il dispositivo via USB o Bluetooth in alto a destra.');
          return;
        }
        const modelFile = btn.dataset.model;
        const defaultName = btn.dataset.name;
        const selectId = btn.dataset.select;
        const selectEl = this.overlay.querySelector(`#${selectId}`);
        const slot = selectEl ? parseInt(selectEl.value, 10) : 0;

        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = '...';

        try {
          this.showFlashProgressModal(`Scrittura "${defaultName}"`, `Scrittura nello slot Clone AMP ${slot + 1}`);
          const blob = await CompilerBridgeService.getVerifiedModelBlob(modelFile);
          const arrayBuffer = await blob.arrayBuffer();
          const binaryData = new Uint8Array(arrayBuffer);

          await presetEngine.flashCloneToPedal(slot, binaryData, defaultName, (curr, tot, pct) => {
            this.updateFlashProgress(curr, tot, pct);
          });
          await presetEngine.activateCloneSlot(slot, true);
          this.hideFlashProgressModal(`Clone AMP ${slot + 1} ("${defaultName}") memorizzato con successo!`);
          this.render();
        } catch (err) {
          console.error('Flash verified model failed:', err);
          alert(`Errore scrittura modello verificato: ${err.message}`);
          this.hideFlashProgressModal();
        } finally {
          btn.disabled = false;
          btn.textContent = origText;
        }
      });
    });

    // Import latest converted CLO from Sonicake Manager
    const btnImportLatest = this.overlay.querySelector('#btnImportLatestClo');
    if (btnImportLatest) {
      btnImportLatest.addEventListener('click', async () => {
        if (!connection.isConnected) {
          alert('Pedaliera non connessa! Connetti prima il dispositivo via USB o Bluetooth in alto a destra.');
          return;
        }

        btnImportLatest.disabled = true;
        const origHtml = btnImportLatest.innerHTML;
        btnImportLatest.innerHTML = `<div class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Controllo...`;

        try {
          const info = await CompilerBridgeService.getLatestCloInfo();
          if (!info || !info.available) {
            alert('Nessun file CLO trovato nella cartella Sonicake Manager. Effettua prima un\'importazione in Sonicake Manager.');
            return;
          }
          const modelTitle = info.toneName || (info.filename ? info.filename.replace(/\.clo$/i, '') : 'Clone');
          const promptMsg = `Trovato modello "${modelTitle}" in Sonicake Manager.\n\nIn quale slot Clone desideri scriverlo? (1 - 5):`;
          const chosen = prompt(promptMsg, '1');
          if (!chosen) return;
          const targetSlot = parseInt(chosen, 10) - 1;
          if (targetSlot < 0 || targetSlot > 4) return;

          this.showFlashProgressModal(`Scrittura "${modelTitle}"`, `Scrittura nello slot Clone AMP ${targetSlot + 1}`);
          const blob = await CompilerBridgeService.getLatestCloBlob();
          const arrayBuffer = await blob.arrayBuffer();
          const binaryData = new Uint8Array(arrayBuffer);

          const cleanName = modelTitle.slice(0, 14);
          await presetEngine.flashCloneToPedal(targetSlot, binaryData, cleanName, (curr, tot, pct) => {
            this.updateFlashProgress(curr, tot, pct);
          });
          await presetEngine.activateCloneSlot(targetSlot, true);
          this.hideFlashProgressModal(`Clone AMP ${targetSlot + 1} ("${cleanName}") memorizzato con successo!`);
          this.render();
        } catch (err) {
          console.error('Import latest CLO failed:', err);
          alert(`Errore importazione CLO: ${err.message}`);
          this.hideFlashProgressModal();
        } finally {
          btnImportLatest.disabled = false;
          btnImportLatest.innerHTML = origHtml;
        }
      });
    }

    // Memory Tab: slot local file inputs (.nam / .wav / .clo)
    this.overlay.querySelectorAll('.slot-file-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const type = input.dataset.type;
        const slot = parseInt(input.dataset.slot, 10);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').trim().slice(0, 14);
        const lower = file.name.toLowerCase();

        // 1. Cabinet IR (.wav)
        if (type === 'cab' || lower.endsWith('.wav')) {
          if (connection.isConnected) {
            await this.processAndFlashWavFile(file, slot);
          } else {
            presetEngine.replaceUserIR(slot, cleanName, true);
            this.render();
            alert('File IR impostato in memoria! Per memorizzarlo fisicamente nel chip Flash permanente, connetti la pedaliera via USB o Bluetooth in alto a destra.');
          }
          input.value = '';
          return;
        }

        // 2. Clone AMP (.clo / .nam)
        if (type === 'amp') {
          if (connection.isConnected) {
            if (lower.endsWith('.clo')) {
              this.showFlashProgressModal(`Scrittura CLO "${cleanName}"`, `Scrittura nello slot Clone AMP ${slot + 1}`);
              try {
                const arrayBuffer = await file.arrayBuffer();
                const rawBytes = new Uint8Array(arrayBuffer);
                const lowModel = convertCLOToLowModel(rawBytes);
                await presetEngine.flashCloneToPedal(slot, lowModel, cleanName, (curr, tot, pct) => {
                  this.updateFlashProgress(curr, tot, pct);
                });
                await presetEngine.activateCloneSlot(slot, true);
                this.hideFlashProgressModal(`Clone AMP ${slot + 1} ("${cleanName}") memorizzato con successo!`);
                this.render();
              } catch (err) {
                console.error('Flash CLO failed:', err);
                alert(`Errore scrittura CLO: ${err.message}`);
                this.hideFlashProgressModal();
              }
            } else if (lower.endsWith('.nam')) {
              await this.processAndFlashNam(file, cleanName, slot);
            } else if (lower.endsWith('.namb')) {
              this.showNamToCloInstructionModal(cleanName, slot);
            } else {
              alert('Formato file non supportato. Seleziona un file .clo o .nam.');
            }
          } else {
            presetEngine.replaceCloneProfile(slot, cleanName, true);
            this.render();
            alert('Profilo Clone impostato in memoria! Per memorizzarlo fisicamente nel chip Flash permanente, connetti la pedaliera via USB o Bluetooth in alto a destra.');
          }
          input.value = '';
          return;
        }
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
