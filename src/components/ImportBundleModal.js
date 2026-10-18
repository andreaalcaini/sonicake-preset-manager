/**
 * Import Bundle & Destination Slot Modal Component
 * Triggered when a shared link or .sonicbundle is opened containing an embedded Tone3000 model.
 * Asks the user which internal hardware memory slot (Clone 1-5 or User IR 1-5)
 * to save the downloaded model into, without touching their other presets!
 */

import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';

export class ImportBundleModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.bundle = null;
    this.selectedAmpSlot = 0;
    this.selectedCabSlot = 0;
    this.onSuccessCallback = null;
  }

  open(bundle, onSuccess) {
    this.bundle = bundle;
    this.onSuccessCallback = onSuccess;
    this.selectedAmpSlot = (bundle.tone3000Model && bundle.tone3000Model.type === 'amp') 
      ? Math.min(4, Math.max(0, bundle.tone3000Model.originalSlot || 0)) 
      : 0;
    this.selectedCabSlot = (bundle.tone3000Model && bundle.tone3000Model.type === 'cab') 
      ? Math.min(4, Math.max(0, bundle.tone3000Model.originalSlot || 0)) 
      : 0;

    this.render();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
    this.bundle = null;
  }

  render() {
    if (!this.bundle || !this.bundle.preset) return;

    const p = this.bundle.preset;
    const toneModel = this.bundle.tone3000Model;
    const isAmpModel = toneModel && toneModel.type === 'amp';
    const isCabModel = toneModel && toneModel.type === 'cab';

    const cloneNames = presetEngine.cloneSlotNames;
    const irNames = presetEngine.irSlotNames;

    this.overlay.innerHTML = `
      <div class="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Preset Condiviso Ricevuto</h3>
              <p class="text-[11px] text-zinc-400">Importa suono e assegna lo slot per i file Tone3000</p>
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
          <!-- Preset Info Card -->
          <div class="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl flex items-center justify-between">
            <div>
              <div class="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">Nome Preset</div>
              <div class="text-base font-bold text-white mt-0.5">${p.name || 'Preset'}</div>
            </div>
            <div>
              <span class="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                ✓ Catena inclusa
              </span>
            </div>
          </div>

          ${toneModel ? `
            <!-- Tone3000 Callout Card -->
            <div class="p-3.5 bg-purple-950/20 border border-purple-800/40 rounded-xl space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                  Include Modello Tone3000
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                  ${isAmpModel ? 'Clone AMP (NAM)' : 'Cabinet IR (.wav)'}
                </span>
              </div>

              <div class="text-sm font-bold text-white">
                ${toneModel.toneTitle || toneModel.slotName || 'Modello Tone3000'}
              </div>
              <div class="text-xs text-amber-400/90 font-medium">
                Variazione originale: "${toneModel.variationName || toneModel.toneTitle}"
              </div>
            </div>

            <!-- Destination Slot Selector Prompt -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  In quale slot della memoria interna vuoi salvarlo?
                </label>
                <span class="text-[11px] text-zinc-500">I 50 preset non cambiano</span>
              </div>

              <div class="space-y-2">
                ${isAmpModel ? cloneNames.map((name, i) => `
                  <label class="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${this.selectedAmpSlot === i ? 'bg-amber-500/10 border-amber-500/50' : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'}">
                    <div class="flex items-center gap-3">
                      <input type="radio" name="ampSlotChoice" value="${i}" ${this.selectedAmpSlot === i ? 'checked' : ''} class="w-4 h-4 text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500/30">
                      <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                        NAM ${i + 1}
                      </span>
                      <div>
                        <div class="text-xs sm:text-sm font-semibold text-zinc-200">Slot ${i + 1}: ${name}</div>
                        <div class="text-[11px] text-zinc-500">${name.startsWith('User Profile') ? 'Disponibile / Vuoto' : 'Contiene modello personalizzato'}</div>
                      </div>
                    </div>
                    ${this.selectedAmpSlot === i ? '<span class="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Scelto</span>' : ''}
                  </label>
                `).join('') : ''}

                ${isCabModel ? irNames.map((name, i) => `
                  <label class="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${this.selectedCabSlot === i ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'}">
                    <div class="flex items-center gap-3">
                      <input type="radio" name="cabSlotChoice" value="${i}" ${this.selectedCabSlot === i ? 'checked' : ''} class="w-4 h-4 text-cyan-500 bg-zinc-900 border-zinc-700 focus:ring-cyan-500/30">
                      <span class="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                        IR ${i + 1}
                      </span>
                      <div>
                        <div class="text-xs sm:text-sm font-semibold text-zinc-200">Slot ${i + 1}: ${name}</div>
                        <div class="text-[11px] text-zinc-500">${name.startsWith('User IR') ? 'Disponibile / Vuoto' : 'Contiene IR personalizzato'}</div>
                      </div>
                    </div>
                    ${this.selectedCabSlot === i ? '<span class="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Scelto</span>' : ''}
                  </label>
                `).join('') : ''}
              </div>
            </div>
          ` : `
            <div class="p-3.5 bg-emerald-950/20 border border-emerald-800/30 rounded-xl text-xs text-emerald-300">
              <div class="font-bold text-white text-sm">Modelli Factory Standard</div>
              <div class="text-zinc-400 mt-1">Questo preset utilizza amplificatori e cabinet factory già presenti nella pedaliera. Verrà caricato istantaneamente.</div>
            </div>
          `}
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between gap-3">
          <button class="modal-cancel-btn px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors">
            Annulla
          </button>
          <button class="btn-confirm-import px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold text-xs transition-colors shadow-sm">
            Salva Modello & Carica Preset
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    this.overlay.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    this.overlay.querySelectorAll('input[name="ampSlotChoice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.selectedAmpSlot = parseInt(e.target.value, 10);
        this.render();
      });
    });

    this.overlay.querySelectorAll('input[name="cabSlotChoice"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.selectedCabSlot = parseInt(e.target.value, 10);
        this.render();
      });
    });

    const confirmBtn = this.overlay.querySelector('.btn-confirm-import');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        if (!this.bundle) return;

        try {
          presetEngine.applyPresetBundle(this.bundle, {
            ampSlot: this.selectedAmpSlot,
            cabSlot: this.selectedCabSlot
          });

          if (this.onSuccessCallback) {
            this.onSuccessCallback(this.bundle);
          }

          this.close();
        } catch (err) {
          alert(`Errore caricamento bundle: ${err.message}`);
        }
      });
    }
  }
}
