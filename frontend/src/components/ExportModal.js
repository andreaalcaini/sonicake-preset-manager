/**
 * Export & Download Preset Modal Component
 * Allows downloading the active preset as native .prst binary,
 * human-readable JSON, or downloading a complete 50-preset backup.
 */

import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';
import { notify } from './ui-feedback.js';

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

export class ExportModal {
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
    const currentSlot = presetEngine.currentSlot;
    const slotCode = presetEngine.getSlotCode(currentSlot);
    const presetName = presetEngine.activePreset.name || 'Preset';
    const safeBaseName = `${slotCode}_${presetName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    this.overlay.innerHTML = `
      <div class="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
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
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Scarica / Esporta Preset</h3>
              <p class="text-[11px] text-zinc-400">Salva copie di backup sul tuo computer</p>
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
        <div class="p-5 overflow-y-auto space-y-4 text-sm">
          <!-- Active preset info card -->
          <div class="flex items-center justify-between p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-xl">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono font-bold text-xs tracking-wider">
                ${slotCode}
              </span>
              <div>
                <div class="text-sm font-bold text-white">${presetName}</div>
                <div class="text-[11px] text-zinc-400">Preset correntemente caricato</div>
              </div>
            </div>
          </div>

          <!-- Download Options List -->
          <div class="space-y-2.5">
            <!-- Option 1: Native .prst -->
            <div class="export-option-card flex items-center justify-between p-3.5 bg-zinc-950/40 hover:bg-zinc-800/40 border border-zinc-800 hover:border-zinc-700 rounded-xl cursor-pointer transition-all group" id="btnDownloadPrst">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-mono font-bold text-xs">
                  PRST
                </div>
                <div>
                  <div class="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">Formato Nativo Sonicake (.prst)</div>
                  <div class="text-[11px] text-zinc-400">Compatibile 100% con app SonicLink e pedaliera</div>
                </div>
              </div>
              <span class="btn-status px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 group-hover:bg-amber-500 group-hover:text-zinc-950 group-hover:border-amber-500 text-xs font-semibold text-zinc-300 transition-all">
                Scarica
              </span>
            </div>

            <!-- Option 2: JSON -->
            <div class="export-option-card flex items-center justify-between p-3.5 bg-zinc-950/40 hover:bg-zinc-800/40 border border-zinc-800 hover:border-zinc-700 rounded-xl cursor-pointer transition-all group" id="btnDownloadJson">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono font-bold text-xs">
                  JSON
                </div>
                <div>
                  <div class="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-cyan-400 transition-colors">Formato Parametri Completo (.json)</div>
                  <div class="text-[11px] text-zinc-400">File modificabile compatibile con PocketEdit ed editor web</div>
                </div>
              </div>
              <span class="btn-status px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 group-hover:bg-cyan-500 group-hover:text-zinc-950 group-hover:border-cyan-500 text-xs font-semibold text-zinc-300 transition-all">
                Scarica
              </span>
            </div>

            <!-- Option 3: Full Backup of 50 presets -->
            <div class="export-option-card flex items-center justify-between p-3.5 bg-zinc-950/40 hover:bg-zinc-800/40 border border-zinc-800 hover:border-zinc-700 rounded-xl cursor-pointer transition-all group" id="btnDownloadBackup">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs">
                  ALL
                </div>
                <div>
                  <div class="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-emerald-400 transition-colors">Backup Completo 50 Preset User (.json)</div>
                  <div class="text-[11px] text-zinc-400">Esporta tutti i preset utente letti dalla pedaliera</div>
                </div>
              </div>
              <span class="btn-status px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 group-hover:bg-emerald-500 group-hover:text-zinc-950 group-hover:border-emerald-500 text-xs font-semibold text-zinc-300 transition-all">
                Backup
              </span>
            </div>

            <!-- Option 4: Full Sonic Bundle with Tone3000 -->
            <div class="export-option-card flex items-center justify-between p-3.5 bg-zinc-950/40 hover:bg-zinc-800/40 border border-zinc-800 hover:border-zinc-700 rounded-xl cursor-pointer transition-all group" id="btnDownloadSonicBundle">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-mono font-bold text-xs">
                  BNDL
                </div>
                <div>
                  <div class="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-purple-400 transition-colors">Bundle Condivisibile (.sonicbundle)</div>
                  <div class="text-[11px] text-zinc-400">Include catena, parametri e riferimenti alle catture NAM/IR</div>
                </div>
              </div>
              <span class="btn-status px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 group-hover:bg-purple-500 group-hover:text-zinc-950 group-hover:border-purple-500 text-xs font-semibold text-zinc-300 transition-all">
                Bundle
              </span>
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

    // 1. Download .prst
    const prstCard = this.overlay.querySelector('#btnDownloadPrst');
    if (prstCard) {
      prstCard.addEventListener('click', async () => {
        // A .prst is the exact preset stored on the pedal, read with the native export
        const slot = presetEngine.currentSlot;
        if (!connection.isConnected) {
          notify('Collega prima la pedaliera: il file .prst viene letto direttamente dal preset salvato.', 'warning');
          return;
        }
        if (slot > 50) {
          notify('Si possono esportare solo i preset utente (U01-U50).', 'warning');
          return;
        }
        try {
          const { bytes } = await presetEngine.exportPrstFromSlot(slot);
          triggerDownload(new Blob([bytes], { type: 'application/octet-stream' }), `${safeBaseName}.prst`, 'application/octet-stream');
          this.showDownloadSuccess(prstCard, '✓ Scaricato!');
        } catch (err) {
          notify(`Errore export .prst: ${err.message}`, 'error');
        }
      });
    }

    // 2. Download JSON
    const jsonCard = this.overlay.querySelector('#btnDownloadJson');
    if (jsonCard) {
      jsonCard.addEventListener('click', () => {
        try {
          const jsonObj = presetEngine.exportActivePresetJson();
          const jsonStr = JSON.stringify(jsonObj, null, 2);
          triggerDownload(jsonStr, `${safeBaseName}.json`, 'application/json');
          this.showDownloadSuccess(jsonCard, '✓ Scaricato!');
        } catch (err) {
          notify(`Errore export JSON: ${err.message}`, 'error');
        }
      });
    }

    // 3. Download Full Backup
    const backupCard = this.overlay.querySelector('#btnDownloadBackup');
    if (backupCard) {
      backupCard.addEventListener('click', () => {
        try {
          const backupObj = presetEngine.exportAllPresetsBackupJson();
          const backupStr = JSON.stringify(backupObj, null, 2);
          const dateStr = new Date().toISOString().split('T')[0];
          triggerDownload(backupStr, `Sonicake_Pedaliera_UserPresets_Backup_${dateStr}.json`, 'application/json');
          this.showDownloadSuccess(backupCard, '✓ Backup Salvato!');
        } catch (err) {
          notify(`Errore backup: ${err.message}`, 'error');
        }
      });
    }

    // 4. Download Sonic Bundle
    const bundleCard = this.overlay.querySelector('#btnDownloadSonicBundle');
    if (bundleCard) {
      bundleCard.addEventListener('click', () => {
        try {
          const bundle = presetEngine.getPresetBundle();
          const bundleStr = JSON.stringify(bundle, null, 2);
          triggerDownload(bundleStr, `${safeBaseName}.sonicbundle`, 'application/json');
          this.showDownloadSuccess(bundleCard, '✓ Bundle Salvato!');
        } catch (err) {
          notify(`Errore export bundle: ${err.message}`, 'error');
        }
      });
    }

  }

  showDownloadSuccess(cardElement, text) {
    const btn = cardElement.querySelector('.btn-status') || cardElement.querySelector('.btn-action');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = text;
      btn.className = 'btn-status px-3 py-1.5 rounded-lg bg-emerald-500 text-zinc-950 text-xs font-semibold shadow-sm transition-all';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.className = 'btn-status px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 group-hover:bg-amber-500 group-hover:text-zinc-950 group-hover:border-amber-500 text-xs font-semibold text-zinc-300 transition-all';
      }, 1500);
    }
  }
}
