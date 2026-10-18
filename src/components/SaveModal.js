/**
 * Save Preset Modal Component
 * Prompts user for destination slot (1-50) and preset name (max 10 characters),
 * with slot overwrite comparison and the option to remain on the current working preset.
 */

import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';
import { notify } from './ui-feedback.js';

export class SaveModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.selectedSlot = 1;
    this.stayInCurrent = false;
    this.render();
  }

  open() {
    this.selectedSlot = Math.min(50, Math.max(1, presetEngine.currentSlot));
    this.stayInCurrent = false;
    this.render();
    this.overlay.classList.add('active');
    const input = this.overlay.querySelector('.preset-name-input');
    if (input) {
      input.focus();
      input.select();
    }
  }

  close() {
    this.overlay.classList.remove('active');
  }

  render() {
    const currentSlot = Math.min(50, Math.max(1, presetEngine.currentSlot));
    const currentSlotCode = presetEngine.getSlotCode(currentSlot);
    const currentName = presetEngine.activePreset.name || 'Preset';

    const targetSlotCode = this.selectedSlot < 10 ? `U0${this.selectedSlot}` : `U${this.selectedSlot}`;
    const targetExistingName = presetEngine.presetList[this.selectedSlot - 1]?.name || `Preset ${this.selectedSlot}`;
    const isDifferentSlot = this.selectedSlot !== currentSlot;

    this.overlay.innerHTML = `
      <div class="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Salva Preset su Pedaliera</h3>
              <p class="text-[11px] text-zinc-400">Salva le impostazioni nella memoria della pedaliera</p>
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
          <!-- Destination Slot Picker -->
          <div>
            <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Slot di Memoria di Destinazione (User 1-50):
            </label>
            <select class="destination-slot-select w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50 rounded-lg text-sm text-zinc-100 outline-none transition-colors">
              ${Array.from({ length: 50 }, (_, i) => i + 1).map(slot => {
                const code = slot < 10 ? `U0${slot}` : `U${slot}`;
                const name = presetEngine.presetList[slot - 1]?.name || `Preset ${slot}`;
                const isCurrent = slot === currentSlot;
                return `<option value="${slot}" ${slot === this.selectedSlot ? 'selected' : ''}>
                  ${code}: ${name} ${isCurrent ? '(Slot di lavoro attuale)' : ''}
                </option>`;
              }).join('')}
            </select>
          </div>

          <!-- Comparison / Overwrite Warning Box -->
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
                  <strong>Avviso sovrascrittura:</strong> Lo slot <strong>${targetSlotCode}</strong> ("${targetExistingName}") nella memoria hardware verrà sovrascritto.
                </span>
              </div>
            ` : `
              <div class="text-xs text-cyan-400/90 leading-relaxed pt-2 border-t border-cyan-800/30">
                Salvataggio sullo slot di memoria attualmente aperto (${currentSlotCode}).
              </div>
            `}
          </div>

          <!-- Preset Name Input -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Nome Preset
              </label>
              <span class="text-[11px] text-zinc-500 font-mono">Max 10 caratteri</span>
            </div>
            <input type="text" maxlength="10" class="preset-name-input w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/50 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors" value="${currentName}" placeholder="Nome (max 10 car.)">
          </div>

          <!-- Stay in current slot option -->
          ${isDifferentSlot ? `
            <div class="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
              <label class="flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300 select-none">
                <input type="checkbox" id="saveModalStayCheck" ${this.stayInCurrent ? 'checked' : ''} class="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/30">
                <span>
                  <strong>Rimani sullo slot attuale (${currentSlotCode})</strong> dopo aver scritto su ${targetSlotCode}
                </span>
              </label>
            </div>
          ` : ''}

          <!-- Connection Status -->
          <div class="p-3 rounded-lg text-xs leading-relaxed border ${!connection.isConnected ? 'bg-amber-950/10 border-amber-800/30 text-amber-300' : 'bg-emerald-950/20 border-emerald-800/30 text-emerald-300'}">
            ${!connection.isConnected ? `
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Pedaliera non connessa: il preset viene salvato solo in questa sessione.</span>
              </div>
            ` : `
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Collegato a <strong>${connection.deviceName}</strong>. SysEx verrà inviato allo slot ${targetSlotCode}.</span>
              </div>
            `}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end gap-3">
          <button class="modal-cancel-btn px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors">
            Annulla
          </button>
          <button class="modal-confirm-save-btn px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold text-xs transition-colors shadow-sm">
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

    const slotSelect = this.overlay.querySelector('.destination-slot-select');
    if (slotSelect) {
      slotSelect.addEventListener('change', (e) => {
        this.selectedSlot = parseInt(e.target.value, 10);
        this.render();
      });
    }

    const stayCheck = this.overlay.querySelector('#saveModalStayCheck');
    if (stayCheck) {
      stayCheck.addEventListener('change', (e) => {
        this.stayInCurrent = e.target.checked;
      });
    }

    const confirmBtn = this.overlay.querySelector('.modal-confirm-save-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const nameInput = this.overlay.querySelector('.preset-name-input');
        const name = (nameInput.value || 'Preset').trim().slice(0, 10);

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Salvataggio in corso...';

        try {
          await presetEngine.savePresetToSlot(this.selectedSlot, name, {
            switchSlot: !this.stayInCurrent
          });
          confirmBtn.textContent = '✓ Salvato nella memoria!';
          confirmBtn.className = 'modal-confirm-save-btn px-4 py-2 rounded-lg bg-emerald-500 text-zinc-950 font-semibold text-xs transition-colors shadow-sm';
          setTimeout(() => {
            this.close();
          }, 500);
        } catch (err) {
          notify(`Errore salvataggio: ${err.message}`, 'error');
          confirmBtn.disabled = false;
          confirmBtn.textContent = `Salva su U${this.selectedSlot < 10 ? '0' : ''}${this.selectedSlot}`;
        }
      });
    }
  }
}
