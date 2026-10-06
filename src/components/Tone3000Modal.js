/**
 * Tone3000 Cloud Explorer Modal Component
 * Allows browsing, searching, and 1-click loading/replacing of Neural Amp Modeler (.nam) captures
 * and Cabinet IRs directly into the Sonicake Smart Box editor.
 */

import { Tone3000Service } from '../services/tone3000.js';
import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';

export class Tone3000Modal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.searchQuery = '';
    this.currentGear = 'all';
    this.tones = [];
    this.isLoading = false;
    this.debounceTimer = null;
    this.replacementMode = null; // null or { targetType: 'amp' | 'cab' }
    this.selectedTargetSlot = 0; // 0 to 4 (slots 1 to 5)

    this.render();
  }

  open() {
    this.replacementMode = null;
    this.overlay.classList.add('active');
    this.render();
    if (this.tones.length === 0) {
      this.fetchTones();
    }
  }

  openForReplacement({ targetType = 'amp' } = {}) {
    this.replacementMode = { targetType };
    this.currentGear = targetType === 'amp' ? 'amp' : 'cab';
    this.selectedTargetSlot = 0;
    this.overlay.classList.add('active');
    this.render();
    this.fetchTones();
  }

  close() {
    this.replacementMode = null;
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

  render() {
    const isReplacing = !!this.replacementMode;
    const targetType = this.replacementMode?.targetType;

    const modalTitle = isReplacing 
      ? (targetType === 'amp' ? 'SOSTITUISCI AMPLIFICATORE CLONE / NAM' : 'SOSTITUISCI CABINET / USER IR')
      : 'TONE3000 CLOUD EXPLORER';

    const slotNames = targetType === 'amp' ? presetEngine.cloneSlotNames : presetEngine.irSlotNames;
    const slotLabel = targetType === 'amp' ? 'Clone Profile (NAM)' : 'User IR';

    this.overlay.innerHTML = `
      <div class="modal-dialog tone3000-modal">
        <div class="modal-header">
          <div class="tone3000-header-wrap">
            <span class="modal-title">${modalTitle}</span>
            <span class="tone3000-badge">${isReplacing ? 'SOSTITUZIONE DIRETTA' : 'NEURAL AMP MODELER'}</span>
          </div>
          <button class="modal-close-btn">&times;</button>
        </div>

        <div class="modal-body">
          ${isReplacing ? `
            <div style="background: rgba(255, 0, 128, 0.1); border: 1px solid rgba(255, 0, 128, 0.3); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
              <div>
                <strong style="color: #ff0080; font-size: 13px;">Seleziona slot di destinazione nella pedaliera:</strong>
                <p style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  Scegli quale memoria ${slotLabel} sostituire con il suono scelto da Tone3000.
                </p>
              </div>

              <select class="model-select target-slot-selector" style="min-width: 220px; border-color: #ff0080;">
                ${slotNames.map((name, i) => `
                  <option value="${i}" ${i === this.selectedTargetSlot ? 'selected' : ''}>
                    ${slotLabel} ${i + 1}: ${name}
                  </option>
                `).join('')}
              </select>
            </div>
          ` : ''}

          <div class="tone3000-search-bar">
            <div class="tone3000-input-wrap">
              <svg class="tone3000-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input type="text" class="tone3000-input" placeholder="Cerca catture su Tone3000 (es. Friedman, Marshall, Dumble, Dual Rectifier)..." value="${this.searchQuery}">
            </div>

            <div class="gear-filters">
              <button class="gear-pill ${this.currentGear === 'all' ? 'active' : ''}" data-gear="all">Tutti</button>
              <button class="gear-pill ${this.currentGear === 'amp' ? 'active' : ''}" data-gear="amp">Amps (NAM)</button>
              <button class="gear-pill ${this.currentGear === 'pedal' ? 'active' : ''}" data-gear="pedal">Pedali</button>
              <button class="gear-pill ${this.currentGear === 'full-rig' ? 'active' : ''}" data-gear="full-rig">Full Rig</button>
              <button class="gear-pill ${this.currentGear === 'cab' ? 'active' : ''}" data-gear="cab">Cabs / IR</button>
            </div>
          </div>

          <div class="tones-grid-container">
            <!-- Grid rendered dynamically -->
          </div>
        </div>

        <div class="modal-footer">
          <span style="font-size: 11px; color: var(--text-muted); margin-right: auto;">
            Integrazione diretta con api.tone3000.com (Libreria open-source Neural Amp Modeler)
          </span>
          <button class="btn-action modal-close-btn-bottom">Chiudi</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.renderGrid();
  }

  renderGrid() {
    const gridContainer = this.overlay.querySelector('.tones-grid-container');
    if (!gridContainer) return;

    if (this.isLoading) {
      gridContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 0; color: var(--accent-cyan); font-weight: 600;">
          <div style="margin-bottom: 12px; font-size: 28px;">&#9881;</div>
          Ricerca catture Tone3000 in corso...
        </div>
      `;
      return;
    }

    if (this.tones.length === 0) {
      gridContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 0; color: var(--text-muted);">
          Nessuna cattura trovata per "${this.searchQuery}". Prova con un altro modello o marca.
        </div>
      `;
      return;
    }

    const isReplacing = !!this.replacementMode;
    const targetType = this.replacementMode?.targetType;

    const actionButtonText = isReplacing 
      ? (targetType === 'amp' ? '⚡ Sostituisci Profilo NAM' : '⚡ Sostituisci User IR')
      : 'Carica su Smart Box';

    gridContainer.innerHTML = `
      <div class="tones-grid">
        ${this.tones.map(tone => `
          <div class="tone-card" data-id="${tone.id}">
            <div class="tone-thumb-wrap">
              ${tone.image 
                ? `<img src="${tone.image}" alt="${tone.title}" class="tone-thumb-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` 
                : ''}
              <div class="tone-thumb-placeholder" style="${tone.image ? 'display:none;' : ''}">&#127928;</div>
              <span class="tone-gear-tag">${tone.gear}</span>
            </div>

            <div class="tone-body">
              <h4 class="tone-card-title" title="${tone.title}">${tone.title}</h4>
              <p class="tone-card-desc">${tone.description}</p>
            </div>

            <div class="tone-footer">
              <button class="btn-load-tone" data-id="${tone.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                ${actionButtonText}
              </button>
              <a href="${tone.url}" target="_blank" class="btn-external-tone" title="Apri su Tone3000">
                &nearr;
              </a>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Attach click listeners to Load / Replace buttons
    gridContainer.querySelectorAll('.btn-load-tone').forEach(btn => {
      btn.addEventListener('click', () => {
        const toneId = btn.dataset.id;
        const tone = this.tones.find(t => t.id === toneId);
        if (!tone) return;

        if (isReplacing) {
          const slotSelect = this.overlay.querySelector('.target-slot-selector');
          const slotIndex = slotSelect ? parseInt(slotSelect.value, 10) : this.selectedTargetSlot;

          if (targetType === 'amp') {
            presetEngine.replaceCloneProfile(slotIndex, tone);
          } else if (targetType === 'cab') {
            presetEngine.replaceUserIR(slotIndex, tone);
          }

          btn.textContent = '✓ Sostituito!';
          btn.style.background = 'var(--led-green)';
          setTimeout(() => {
            this.close();
          }, 500);
        } else {
          presetEngine.applyTone3000(tone);
          btn.textContent = '✓ Caricato!';
          btn.style.background = 'var(--led-green)';
          setTimeout(() => {
            this.close();
          }, 500);
        }
      });
    });
  }

  attachEventListeners() {
    // Target slot selector
    const slotSelect = this.overlay.querySelector('.target-slot-selector');
    if (slotSelect) {
      slotSelect.addEventListener('change', (e) => {
        this.selectedTargetSlot = parseInt(e.target.value, 10);
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
    this.overlay.querySelectorAll('.gear-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this.currentGear = pill.dataset.gear;
        this.overlay.querySelectorAll('.gear-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.fetchTones();
      });
    });
  }
}
