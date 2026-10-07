/**
 * Slot Transfer & Memory Overwrite Modal Component
 * Allows user to take the current edited sound OR import a file (.prst / .json)
 * and choose ANY target hardware memory slot (U01 - U50) to save or overwrite it,
 * independently of the preset they are currently working on.
 */

import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';
import { PrstParser } from '../core/prst-parser.js';

export class SlotTransferModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.sourceType = 'current'; // 'current' or 'file'
    this.loadedFilePreset = null;
    this.targetSlot = 1;
    this.stayInCurrent = true;
    this.render();
  }

  open() {
    this.targetSlot = presetEngine.currentSlot <= 50 ? presetEngine.currentSlot : 1;
    this.sourceType = 'current';
    this.loadedFilePreset = null;
    this.stayInCurrent = true;
    this.render();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
  }

  render() {
    const currentSlot = presetEngine.currentSlot;
    const currentSlotCode = presetEngine.getSlotCode(currentSlot);
    const currentName = presetEngine.activePreset.name || 'Preset';

    const sourceName = this.sourceType === 'file' && this.loadedFilePreset
      ? this.loadedFilePreset.name
      : currentName;

    const targetSlotCode = this.targetSlot < 10 ? `U0${this.targetSlot}` : `U${this.targetSlot}`;
    const targetExistingName = presetEngine.presetList[this.targetSlot - 1]?.name || `Preset ${this.targetSlot}`;
    const isDifferentSlot = this.targetSlot !== currentSlot;

    this.overlay.innerHTML = `
      <div class="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8-4-4m0 0L8 8m4-4v12"></path>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Carica in Slot Memoria</h3>
              <p class="text-[11px] text-zinc-400">Scrivi o sovrascrivi qualsiasi slot U01-U50</p>
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
          <!-- 1. Source Preset Selection -->
          <div>
            <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              1. Scegli il Preset Sorgente:
            </label>
            <div class="space-y-2">
              <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${this.sourceType === 'current' ? 'bg-amber-500/10 border-amber-500/40 text-white' : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'}">
                <input type="radio" name="sourceType" value="current" ${this.sourceType === 'current' ? 'checked' : ''} class="mt-0.5 w-4 h-4 text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500/30">
                <div>
                  <div class="text-xs sm:text-sm font-semibold text-zinc-200">Suono in Modifica (${currentSlotCode}: ${currentName})</div>
                  <div class="text-[11px] text-zinc-400 mt-0.5">Usa la catena ed i parametri attualmente attivi nell'editor</div>
                </div>
              </label>

              <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${this.sourceType === 'file' ? 'bg-amber-500/10 border-amber-500/40 text-white' : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'}">
                <input type="radio" name="sourceType" value="file" ${this.sourceType === 'file' ? 'checked' : ''} class="mt-0.5 w-4 h-4 text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-amber-500/30">
                <div class="flex-1 min-w-0">
                  <div class="text-xs sm:text-sm font-semibold text-zinc-200">Carica da File PC (.prst / .json)</div>
                  <div class="text-[11px] text-zinc-400 mt-0.5 mb-2">Scegli un preset salvato sul computer</div>
                  
                  <div class="flex items-center gap-2 flex-wrap">
                    <input type="file" id="slotTransferFileInput" accept=".prst,.json" class="hidden">
                    <button type="button" class="px-2.5 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold transition-colors" id="btnBrowseFile">
                      Sfoglia File...
                    </button>
                    <span id="slotTransferFileName" class="text-xs font-mono truncate max-w-[220px] ${this.loadedFilePreset ? 'text-emerald-400' : 'text-zinc-500'}">
                      ${this.loadedFilePreset ? `✓ ${this.loadedFilePreset.fileName}` : 'Nessun file selezionato'}
                    </span>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <!-- 2. Target Memory Slot Selection -->
          <div>
            <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              2. Slot di Destinazione (U01 - U50):
            </label>
            <select class="target-slot-select w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50 rounded-lg text-sm text-zinc-100 outline-none transition-colors">
              ${Array.from({ length: 50 }, (_, i) => i + 1).map(slot => {
                const code = slot < 10 ? `U0${slot}` : `U${slot}`;
                const name = presetEngine.presetList[slot - 1]?.name || `Preset ${slot}`;
                const isWorking = slot === currentSlot;
                return `<option value="${slot}" ${slot === this.targetSlot ? 'selected' : ''}>
                  ${code}: ${name} ${isWorking ? '(Slot di lavoro attuale)' : ''}
                </option>`;
              }).join('')}
            </select>
          </div>

          <!-- Slot Comparison & Overwrite Warning Box -->
          <div class="rounded-xl p-3.5 border ${isDifferentSlot ? 'bg-amber-950/20 border-amber-800/40' : 'bg-cyan-950/20 border-cyan-800/40'}">
            <div class="flex items-center justify-between text-xs mb-2">
              <div class="flex items-center gap-1.5">
                <span class="text-zinc-400">Slot attuale:</span>
                <span class="font-bold text-zinc-200">${currentSlotCode} (${currentName})</span>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-zinc-400">Destinazione:</span>
                <span class="font-bold text-amber-400">${targetSlotCode} (${targetExistingName})</span>
              </div>
            </div>

            ${isDifferentSlot ? `
              <div class="flex items-start gap-2 text-xs text-amber-300/90 leading-relaxed pt-2 border-t border-amber-800/30">
                <svg class="w-4 h-4 shrink-0 mt-0.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>
                  <strong>Avviso di sovrascrittura:</strong> Lo slot <strong>${targetSlotCode}</strong> ("${targetExistingName}") nella memoria hardware verrà sovrascritto. Il preset su cui stai lavorando (<strong>${currentSlotCode}</strong>) non verrà toccato.
                </span>
              </div>
            ` : `
              <div class="text-xs text-cyan-400/90 leading-relaxed pt-2 border-t border-cyan-800/30">
                Stai salvando sullo slot di memoria attualmente aperto (${currentSlotCode}).
              </div>
            `}
          </div>

          <!-- 3. Preset Name Input -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                3. Nome Preset nello Slot
              </label>
              <span class="text-[11px] text-zinc-500 font-mono">Max 10 car.</span>
            </div>
            <input type="text" maxlength="10" class="target-preset-name-input w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors" value="${sourceName}" placeholder="Nome (max 10 car.)">
          </div>

          <!-- 4. Behavior after saving -->
          <div class="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
            <label class="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 select-none">
              <input type="checkbox" id="checkStayInCurrent" ${this.stayInCurrent ? 'checked' : ''} class="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/30">
              <span>
                <strong>Rimani sullo slot attuale (${currentSlotCode})</strong> dopo aver salvato su ${targetSlotCode}
              </span>
            </label>
          </div>

          <!-- Connection Status -->
          <div class="p-3 rounded-lg text-xs leading-relaxed border ${!connection.isConnected ? 'bg-amber-950/10 border-amber-800/30 text-amber-300' : 'bg-emerald-950/20 border-emerald-800/30 text-emerald-300'}">
            ${!connection.isConnected ? `
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Hardware non connesso: il preset verrà registrato nello slot della memoria locale.</span>
              </div>
            ` : `
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Pedaliera <strong>${connection.deviceName}</strong> collegata. SysEx verrà inviato allo slot ${targetSlotCode}.</span>
              </div>
            `}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end gap-3">
          <button class="modal-cancel-btn px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors">
            Annulla
          </button>
          <button class="modal-confirm-transfer-btn px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold text-xs transition-colors shadow-sm">
            Salva su ${targetSlotCode}
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

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Radio change
    this.overlay.querySelectorAll('input[name="sourceType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.sourceType = e.target.value;
        this.render();
      });
    });

    // File input browse button
    const btnBrowse = this.overlay.querySelector('#btnBrowseFile');
    const fileInput = this.overlay.querySelector('#slotTransferFileInput');
    if (btnBrowse && fileInput) {
      btnBrowse.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          if (file.name.endsWith('.prst')) {
            const buffer = await file.arrayBuffer();
            const parsed = PrstParser.parse(buffer);
            this.loadedFilePreset = {
              name: parsed.name || file.name.replace('.prst', '').slice(0, 10),
              fileName: file.name,
              type: 'prst',
              data: parsed
            };
          } else if (file.name.endsWith('.json')) {
            const text = await file.text();
            const json = JSON.parse(text);
            this.loadedFilePreset = {
              name: (json.presetName || json.name || file.name.replace('.json', '')).slice(0, 10),
              fileName: file.name,
              type: 'json',
              data: json
            };
          } else {
            alert('Formato non supportato. Seleziona un file .prst o .json.');
            return;
          }
          this.sourceType = 'file';
          this.render();
        } catch (err) {
          alert(`Errore lettura file: ${err.message}`);
        }
      });
    }

    // Target Slot change
    const slotSelect = this.overlay.querySelector('.target-slot-select');
    if (slotSelect) {
      slotSelect.addEventListener('change', (e) => {
        this.targetSlot = parseInt(e.target.value, 10);
        this.render();
      });
    }

    // Stay in current checkbox
    const stayCheck = this.overlay.querySelector('#checkStayInCurrent');
    if (stayCheck) {
      stayCheck.addEventListener('change', (e) => {
        this.stayInCurrent = e.target.checked;
      });
    }

    // Confirm button
    const confirmBtn = this.overlay.querySelector('.modal-confirm-transfer-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const nameInput = this.overlay.querySelector('.target-preset-name-input');
        const targetName = (nameInput?.value || 'Preset').trim().slice(0, 10);

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Salvataggio in corso...';

        try {
          if (this.sourceType === 'file' && this.loadedFilePreset) {
            // Write loaded file preset to chosen slot
            const presetData = this.preparePresetDataFromFile(this.loadedFilePreset, targetName);
            await presetEngine.writePresetDataToSlot(this.targetSlot, targetName, presetData, {
              switchSlot: !this.stayInCurrent
            });
          } else {
            // Write current sound to chosen slot
            await presetEngine.savePresetToSlot(this.targetSlot, targetName, {
              switchSlot: !this.stayInCurrent
            });
          }

          confirmBtn.textContent = '✓ Salvato con successo!';
          confirmBtn.style.background = 'var(--led-green)';

          setTimeout(() => {
            this.close();
          }, 600);
        } catch (err) {
          alert(`Errore salvataggio nello slot: ${err.message}`);
          confirmBtn.disabled = false;
          confirmBtn.textContent = `💾 Salva / Sovrascrivi su U${this.targetSlot < 10 ? '0' : ''}${this.targetSlot}`;
        }
      });
    }
  }

  preparePresetDataFromFile(filePreset, targetName) {
    if (filePreset.type === 'json') {
      const j = filePreset.data;
      return {
        name: targetName,
        ampMode: (j.ampMode || 'Normal').toLowerCase() === 'clone' ? 'clone' : 'factory',
        volume: j.presetVolume !== undefined ? j.presetVolume : (j.volume !== undefined ? j.volume : 75),
        states: j.states || {},
        selectedEffects: j.selectedEffects || {},
        parameters: j.parameters || {},
        order: Array.isArray(j.order) && j.order.length === 9 ? j.order : [0, 1, 2, 3, 4, 5, 6, 7, 8]
      };
    } else {
      // prst format
      const p = filePreset.data;
      return {
        name: targetName,
        ampMode: 'factory',
        volume: 75,
        states: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true },
        selectedEffects: { 0: 1, 1: 101, 2: 201, 3: 301, 4: 401, 5: 501, 6: 601, 7: 701, 8: 801 },
        parameters: {},
        order: p.order || [0, 1, 2, 3, 4, 5, 6, 7, 8]
      };
    }
  }
}
