/**
 * Save Preset Modal Component
 * Prompts user for destination slot (1-50) and preset name (max 10 characters),
 * calculates SMBus PEC CRC8, and writes directly to hardware memory.
 */

import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';

export class SaveModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.render();
  }

  open() {
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
    const currentName = presetEngine.activePreset.name;

    this.overlay.innerHTML = `
      <div class="modal-dialog" style="max-width: 440px;">
        <div class="modal-header">
          <span class="modal-title">&#128190; SAVE PRESET TO HARDWARE</span>
          <button class="modal-close-btn">&times;</button>
        </div>

        <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 6px;">
              Destination Slot (User 1-50):
            </label>
            <select class="model-select destination-slot-select" style="width: 100%;">
              ${Array.from({ length: 50 }, (_, i) => i + 1).map(slot => {
                const code = slot < 10 ? `U0${slot}` : `U${slot}`;
                const name = presetEngine.presetList[slot - 1]?.name || `Preset ${slot}`;
                return `<option value="${slot}" ${slot === currentSlot ? 'selected' : ''}>${code}: ${name}</option>`;
              }).join('')}
            </select>
          </div>

          <div>
            <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); display: block; margin-bottom: 6px;">
              Preset Name (Max 10 chars):
            </label>
            <input type="text" maxlength="10" class="tone3000-input preset-name-input" value="${currentName}" placeholder="Name (max 10 chars)">
          </div>

          ${!connection.isConnected ? `
            <div style="font-size: 11px; color: var(--led-yellow); background: rgba(255,214,0,0.1); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,214,0,0.2);">
              &#9888; Hardware not connected. Preset will be saved locally in application state.
            </div>
          ` : `
            <div style="font-size: 11px; color: var(--led-green); background: rgba(0,230,118,0.1); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(0,230,118,0.2);">
              &#10003; Connected to ${connection.deviceName}. SysEx with SMBus PEC CRC8 will be written to pedal flash.
            </div>
          `}
        </div>

        <div class="modal-footer">
          <button class="btn-action modal-cancel-btn">Cancel</button>
          <button class="btn-action btn-save modal-confirm-save-btn">Save to Pedal</button>
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

    const confirmBtn = this.overlay.querySelector('.modal-confirm-save-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const slotSelect = this.overlay.querySelector('.destination-slot-select');
        const nameInput = this.overlay.querySelector('.preset-name-input');
        const slot = parseInt(slotSelect.value, 10);
        const name = (nameInput.value || 'Preset').trim().slice(0, 10);

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving...';

        try {
          await presetEngine.savePreset(slot, name);
          confirmBtn.textContent = '✓ Saved!';
          setTimeout(() => {
            this.close();
          }, 400);
        } catch (err) {
          alert(`Save error: ${err.message}`);
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Save to Pedal';
        }
      });
    }
  }
}
