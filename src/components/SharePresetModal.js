/**
 * Share Preset Modal Component
 * Generates 1-click shareable web links (#preset=...) and downloadable .sonicbundle files
 * that include the full signal chain, all 9 module states/params,
 * and embedded Tone3000 model metadata (requesting destination slot on import).
 */

import { presetEngine } from '../core/preset-engine.js';
import { encodePresetBundle, decodePresetBundle } from '../utils/bundle-encoder.js';
import { MODULE_NAMES } from '../core/protocol.js';

function triggerDownload(content, filename, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export class SharePresetModal {
  constructor(overlayElement, importModal) {
    this.overlay = overlayElement;
    this.importModal = importModal;
    this.currentBundle = null;
    this.currentShareUrl = '';
  }

  open() {
    this.generateBundle();
    this.render();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
  }

  generateBundle() {
    this.currentBundle = presetEngine.getPresetBundle();
    const encoded = encodePresetBundle(this.currentBundle);
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    this.currentShareUrl = `${origin}${pathname}#preset=${encoded}`;
  }

  render() {
    const p = this.currentBundle ? this.currentBundle.preset : presetEngine.activePreset;
    const toneModel = this.currentBundle ? this.currentBundle.tone3000Model : null;
    const currentSlot = presetEngine.currentSlot;
    const slotCode = presetEngine.getSlotCode(currentSlot);
    const presetName = p.name || 'Preset';
    const safeBaseName = `${slotCode}_${presetName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    this.overlay.innerHTML = `
      <div class="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Condividi Preset & Bundle</h3>
              <p class="text-[11px] text-zinc-400">Genera link diretto 1-click o file completo</p>
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
          <!-- Active preset info banner -->
          <div class="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono font-bold text-xs tracking-wider">
                ${slotCode}
              </span>
              <div>
                <div class="text-sm font-bold text-white">${presetName}</div>
                <div class="text-[11px] text-zinc-400">
                  Vol: ${p.volume !== undefined ? p.volume : 75}% • Amp: ${p.ampMode === 'clone' ? 'Clone NAM' : 'Factory'}
                </div>
              </div>
            </div>

            <!-- Signal chain mini-badges -->
            <div class="flex gap-1 flex-wrap">
              ${(p.order || [0,1,2,3,4,5,6,7,8]).map(modId => {
                const isOn = p.states && p.states[modId];
                return `
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${isOn ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-zinc-900/60 text-zinc-600 border-zinc-800'}">
                    ${MODULE_NAMES[modId]}
                  </span>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Embedded Tone3000 Banner -->
          ${toneModel ? `
            <div class="p-3.5 bg-purple-950/20 border border-purple-800/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div class="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  Include Modello Tone3000 (${toneModel.type === 'amp' ? 'Clone NAM' : 'Cabinet IR'})
                </div>
                <div class="text-xs sm:text-sm font-bold text-white mt-1">
                  ${toneModel.toneTitle}
                </div>
                <div class="text-[11px] text-amber-400/90 mt-0.5">
                  Variazione: "${toneModel.variationName}"
                </div>
              </div>
              <div class="text-[11px] text-zinc-400 sm:text-right max-w-[200px]">
                Chi apre il bundle potrà scegliere lo slot di destinazione.
              </div>
            </div>
          ` : `
            <div class="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Preset autonomo: utilizza modelli factory predefiniti della pedaliera.</span>
            </div>
          `}

          <!-- Sharing Methods List -->
          <div class="space-y-3">
            <!-- Option 1: Shareable Web Link -->
            <div class="p-3.5 bg-zinc-950/40 border border-zinc-800 rounded-xl space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                  </svg>
                  Link Diretto di Condivisione (1-Click)
                </span>
                <span class="text-[10px] text-cyan-400 font-semibold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">Zero app esterne</span>
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <input type="text" readonly value="${this.currentShareUrl}" class="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-cyan-400 outline-none select-all" id="shareUrlInput">
                <button class="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-zinc-950 text-xs font-semibold whitespace-nowrap transition-colors flex items-center justify-center gap-1.5" id="btnCopyShareUrl">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copia Link
                </button>
              </div>
              <p class="text-[11px] text-zinc-500 leading-relaxed">
                Incolla questo link su WhatsApp, Discord o forum. Chiunque ci clicchi aprirà direttamente questo suono!
              </p>
            </div>

            <!-- Option 2: Download .sonicbundle file -->
            <div class="p-3.5 bg-zinc-950/40 border border-zinc-800 rounded-xl flex items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-mono font-bold text-xs">
                  BNDL
                </div>
                <div>
                  <div class="text-xs sm:text-sm font-bold text-zinc-100">File Bundle Completo (.sonicbundle)</div>
                  <div class="text-[11px] text-zinc-400">Include catena, parametri e riferimenti Tone3000</div>
                </div>
              </div>
              <button class="px-3.5 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold whitespace-nowrap transition-colors" id="btnDownloadBundle">
                Scarica File
              </button>
            </div>

            <!-- Option 3: Import Shared Link or Bundle -->
            <div class="p-3.5 bg-zinc-950/30 border border-dashed border-zinc-800 rounded-xl flex items-center justify-between gap-3">
              <div>
                <div class="text-xs sm:text-sm font-semibold text-zinc-300">Ricevuto un bundle da un amico?</div>
                <div class="text-[11px] text-zinc-500">Carica un file .sonicbundle per importare parametri e slot</div>
              </div>
              <label class="px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors">
                Importa
                <input type="file" accept=".sonicbundle,.json" id="inputImportBundleFile" class="hidden">
              </label>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end">
          <button class="modal-close-btn px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners(safeBaseName);
  }

  attachEventListeners(safeBaseName) {
    this.overlay.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // 1. Copy URL
    const btnCopy = this.overlay.querySelector('#btnCopyShareUrl');
    const inputUrl = this.overlay.querySelector('#shareUrlInput');
    if (btnCopy && inputUrl) {
      btnCopy.addEventListener('click', async () => {
        try {
          inputUrl.select();
          await navigator.clipboard.writeText(inputUrl.value);
          btnCopy.innerHTML = '✓ Copiato!';
          btnCopy.className = 'px-3.5 py-2 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-semibold whitespace-nowrap transition-colors flex items-center justify-center gap-1.5 shadow-sm';
          setTimeout(() => {
            btnCopy.innerHTML = `
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copia Link
            `;
            btnCopy.className = 'px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-zinc-950 text-xs font-semibold whitespace-nowrap transition-colors flex items-center justify-center gap-1.5';
          }, 2000);
        } catch (e) {
          // Fallback for older contexts
          inputUrl.select();
          document.execCommand('copy');
          btnCopy.textContent = '✓ Copiato!';
          setTimeout(() => {
            btnCopy.textContent = 'Copia Link';
          }, 2000);
        }
      });
    }

    // 2. Download Bundle
    const btnDownload = this.overlay.querySelector('#btnDownloadBundle');
    if (btnDownload && this.currentBundle) {
      btnDownload.addEventListener('click', () => {
        try {
          const jsonStr = JSON.stringify(this.currentBundle, null, 2);
          triggerDownload(jsonStr, `${safeBaseName}.sonicbundle`, 'application/json');
          btnDownload.textContent = '✓ Scaricato!';
          btnDownload.className = 'px-3.5 py-2 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-semibold whitespace-nowrap transition-colors shadow-sm';
          setTimeout(() => {
            btnDownload.textContent = 'Scarica File';
            btnDownload.className = 'px-3.5 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold whitespace-nowrap transition-colors';
          }, 2000);
        } catch (err) {
          alert(`Errore download bundle: ${err.message}`);
        }
      });
    }

    // 3. Import File
    const fileInput = this.overlay.querySelector('#inputImportBundleFile');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target.result);
            this.close();
            if (this.importModal) {
              this.importModal.open(parsed, () => {
                alert(`Preset "${parsed.preset.name}" caricato con successo!`);
              });
            }
          } catch (err) {
            alert(`File bundle non valido: ${err.message}`);
          }
        };
        reader.readAsText(file);
      });
    }
  }
}
