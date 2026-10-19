/**
 * Help & Keyboard Shortcuts Modal Component
 * Displays user guide, connection walkthrough, and shortcut cheat sheet.
 */

import { applyFeatureFlags } from '../config/features.js';

export class HelpModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.render();
  }

  open() {
    this.render();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
  }

  render() {
    this.overlay.innerHTML = `
      <div class="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Guida & Scorciatoie</h3>
              <p class="text-[11px] text-zinc-400">Istruzioni d'uso rapido e comandi da tastiera</p>
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
        <div class="p-5 overflow-y-auto space-y-5 text-sm max-h-[75vh]">
          <!-- Section 1: Keyboard Shortcuts -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <line x1="6" y1="8" x2="6" y2="8"></line>
                <line x1="10" y1="8" x2="10" y2="8"></line>
                <line x1="14" y1="8" x2="14" y2="8"></line>
                <line x1="18" y1="8" x2="18" y2="8"></line>
                <line x1="6" y1="12" x2="6" y2="12"></line>
                <line x1="18" y1="12" x2="18" y2="12"></line>
                <line x1="7" y1="16" x2="17" y2="16"></line>
              </svg>
              Scorciatoie da Tastiera
            </h4>
            <div class="bg-zinc-950/60 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/80">
              <div class="p-2.5 sm:px-3 sm:py-2 flex items-center justify-between text-xs">
                <kbd class="px-2 py-1 rounded bg-zinc-900 border border-zinc-700/80 text-cyan-400 font-mono font-bold text-[11px] shadow-sm">Ctrl + Shift + S</kbd>
                <span class="text-zinc-400 text-right">Condividi preset (link web 1-click o bundle)</span>
              </div>
              <div class="p-2.5 sm:px-3 sm:py-2 flex items-center justify-between text-xs">
                <kbd class="px-2 py-1 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono font-bold text-[11px] shadow-sm">Ctrl + S</kbd>
                <span class="text-zinc-400 text-right">Salva preset corrente su pedaliera</span>
              </div>
              <div class="p-2.5 sm:px-3 sm:py-2 flex items-center justify-between text-xs">
                <kbd class="px-2 py-1 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono font-bold text-[11px] shadow-sm">Ctrl + Z / Ctrl + Y</kbd>
                <span class="text-zinc-400 text-right">Annulla / Ripristina modifiche (Undo/Redo)</span>
              </div>
              <div data-feature="abCompare" class="p-2.5 sm:px-3 sm:py-2 flex items-center justify-between text-xs">
                <kbd class="px-2 py-1 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono font-bold text-[11px] shadow-sm">Alt + A</kbd>
                <span class="text-zinc-400 text-right">Confronto sonoro A / B istantaneo</span>
              </div>
              <div class="p-2.5 sm:px-3 sm:py-2 flex items-center justify-between text-xs">
                <kbd class="px-2 py-1 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono font-bold text-[11px] shadow-sm">F / F11</kbd>
                <span class="text-zinc-400 text-right">Modalità Live Stage a schermo intero</span>
              </div>
              <div class="p-2.5 sm:px-3 sm:py-2 flex items-center justify-between text-xs">
                <kbd class="px-2 py-1 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono font-bold text-[11px] shadow-sm">◀ / ▶ (Frecce)</kbd>
                <span class="text-zinc-400 text-right">Preset precedente / successivo</span>
              </div>
              <div class="p-2.5 sm:px-3 sm:py-2 flex items-center justify-between text-xs">
                <kbd class="px-2 py-1 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-200 font-mono font-bold text-[11px] shadow-sm">Spazio</kbd>
                <span class="text-zinc-400 text-right">Tap Tempo quando il ritmo è aperto</span>
              </div>
            </div>
          </div>

          <!-- Section 2: Hardware Connection Guide -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v10"></path>
                <path d="M18.4 6.6a9 9 0 1 1-12.77 0"></path>
              </svg>
              Connessione USB e Bluetooth
            </h4>
            <div class="space-y-2">
              <div class="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl text-xs leading-relaxed">
                <div class="font-bold text-zinc-200 mb-0.5">Collegamento USB Diretto:</div>
                <div class="text-zinc-400">Collega la pedaliera al computer tramite cavo USB-C. Clicca su <strong>USB</strong> in alto: l'app si collega e legge i tuoi preset.</div>
              </div>
              <div class="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl text-xs leading-relaxed">
                <div class="font-bold text-zinc-200 mb-0.5">Collegamento Bluetooth:</div>
                <div class="text-zinc-400">Attiva il Bluetooth sul PC/tablet. Clicca su <strong>Bluetooth</strong> in alto, seleziona la tua pedaliera Sonicake dall'elenco del browser e sincronizza senza cavi.</div>
              </div>
            </div>
          </div>

          <!-- Section 3: captures & internal memory -->
          <div class="space-y-2">
            <h4 class="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                <path d="M12 12v9"></path>
                <path d="m8 17 4 4 4-4"></path>
              </svg>
              Amplificatori e casse personali
            </h4>
            <div class="p-3 bg-zinc-950/40 border border-zinc-800 rounded-xl text-xs text-zinc-400 leading-relaxed">
              La pedaliera dispone di <strong>5 slot Clone AMP (NAM)</strong> e <strong>5 slot Cabinet IR</strong> nella memoria della pedaliera. Puoi caricarli con i tuoi file <strong>.nam</strong> / <strong>.wav</strong> oppure dalla libreria TONE3000 (accesso con il tuo account TONE3000), senza intaccare la lista dei tuoi 50 preset.
            </div>
            <a href="https://www.tone3000.com" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 min-h-[32px] text-[11px] text-zinc-400 hover:text-zinc-200">
              Powered by <img src="/assets/tone3000/tone3000-logo.svg" alt="TONE3000" class="h-3 w-auto">
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between gap-3">
          <p class="sl-disclaimer text-[10px] leading-snug text-zinc-500">Progetto indipendente e gratuito, non affiliato né approvato da Sonicake. Sonicake è un marchio dei rispettivi proprietari.</p>
          <button class="modal-close-btn-bottom shrink-0 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    `;
    applyFeatureFlags(this.overlay);

    this.attachEventListeners();
  }

  attachEventListeners() {
    this.overlay.querySelectorAll('.modal-close-btn, .modal-close-btn-bottom').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }
}
