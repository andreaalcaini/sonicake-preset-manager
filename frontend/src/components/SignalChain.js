/**
 * Signal Chain Component
 * SonicLink-style pedal chain: Preset VOL bar + pixel pedal tiles (on/off artwork)
 * laid out in 2 rows on phones (5 + 4) and a single 9-pedal row on desktop.
 * Tap selects a module, double-tap toggles its bypass.
 */

import { presetEngine } from '../core/preset-engine.js';
import { MODULE_LIBRARY_DATA } from '../data/module-library.js';
import { MODULE_NAMES, isFixedChainModule } from '../core/protocol.js';
import { T3K_MARK } from '../config/tone3000.js';

const ICON_KEYS = ['nr', 'fx1', 'drv', 'amp', 'ir', 'eq', 'fx2', 'dly', 'rvb'];
const desktopQuery = window.matchMedia('(min-width: 1024px)');

export class SignalChain {
  constructor(containerElement, onSelectModule) {
    this.container = containerElement;
    this.onSelectModule = onSelectModule;
    this.selectedModuleId = 3; // Default to AMP
    this.volDragging = false;

    presetEngine.onStateChange(() => this.render());
    presetEngine.onUserSlotsChange(() => this.render());
    desktopQuery.addEventListener('change', () => this.render());
    this.render();
  }

  setSelectedModule(moduleId) {
    this.selectedModuleId = moduleId;
    this.render();
  }

  render() {
    if (this.volDragging) return;
    const preset = presetEngine.activePreset;
    const order = preset.order || [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const rows = desktopQuery.matches ? [order] : [order.slice(0, 5), order.slice(5)];
    const vol = preset.volume ?? 75;
    const master = presetEngine.masterVolume;

    this.container.innerHTML = `
      <div class="sl-vol-row !pb-0" title="Volume generale della pedaliera (vale per tutti i preset)">
        <span class="sl-row-label">Master</span>
        <input type="range" class="sl-range master-volume-slider" min="0" max="100" value="${master ?? 50}" style="--fill:${master ?? 0}%">
        <span class="sl-row-value master-volume-val">${master ?? '–'}</span>
        <span class="w-12 shrink-0"></span>
      </div>
      <div class="sl-vol-row">
        <span class="sl-row-label">Preset VOL</span>
        <input type="range" class="sl-range preset-volume-slider" min="0" max="100" value="${vol}" style="--fill:${vol}%">
        <span class="sl-row-value preset-volume-val">${vol}</span>
        <button class="sl-save-btn btn-save-preset" title="Salva preset sulla pedaliera (Ctrl+S)">
          <img src="/assets/ui/home_btn_save.svg" alt="Salva">
        </button>
      </div>

      <div class="sl-chain-panel">
        <div class="sl-chain-inner">
          ${rows.map((row, r) => `
            <div class="sl-chain-row ${r === rows.length - 1 ? 'row-2' : ''}" style="grid-template-columns: repeat(${desktopQuery.matches ? 9 : 5}, minmax(0, 1fr));">
              ${row.map((modId, i) => this.renderTile(modId, this.blockEdges(row, i))).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  getEffectName(modId) {
    const preset = presetEngine.activePreset;
    if (modId === 3 && preset.ampMode === 'clone') {
      const cloneFxId = preset.selectedEffects[9] || 901;
      let name = presetEngine.cloneSlotNames[cloneFxId - 901];
      if (!name || name === 'Empty') name = `Clone ${cloneFxId - 900}`;
      return name;
    }
    const fxId = preset.selectedEffects[modId] || 0;
    if (modId === 4 && fxId >= 416 && fxId <= 420) {
      const name = presetEngine.irSlotNames[fxId - 416];
      return !name || name === 'Empty' ? `User IR ${fxId - 415}` : name;
    }
    return MODULE_LIBRARY_DATA.effectLibrary[fxId]?.name || 'Off';
  }

  /** Dashed SonicLink frame around the fixed DRV-AMP-IR-EQ block, split per visual row */
  blockEdges(row, i) {
    if (!isFixedChainModule(row[i])) return '';
    const left = i === 0 || !isFixedChainModule(row[i - 1]);
    const right = i === row.length - 1 || !isFixedChainModule(row[i + 1]);
    return `blk${left ? ' blk-l' : ''}${right ? ' blk-r' : ''}`;
  }

  renderTile(modId, blockClass = '') {
    const preset = presetEngine.activePreset;
    const isOn = !!preset.states[modId];
    const isSelected = this.selectedModuleId === modId;
    const tag = MODULE_NAMES[modId] || `MOD ${modId}`;
    const fxName = this.getEffectName(modId);
    const isClone = modId === 3 && preset.ampMode === 'clone';
    const icon = `/assets/ui/${ICON_KEYS[modId] || 'amp'}_${isOn ? 'on' : 'off'}.svg`;
    // Capture loaded from TONE3000: tone image + T3K mark in the block (API design requirements)
    const t3k = (modId === 3 || modId === 4) ? presetEngine.activeToneSource(modId) : null;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    return `
      <button class="sl-tile ${blockClass} ${isSelected ? 'is-selected' : ''}" data-module-id="${modId}" title="${tag} · ${esc(fxName)}${t3k ? ` (TONE3000: ${esc(t3k.toneTitle)})` : ''}${isOn ? '' : ' (bypass)'} — doppio tocco per on/off">
        ${t3k ? `<span class="sl-tile-t3k"><img src="${T3K_MARK}" alt="TONE3000" draggable="false"></span>` : (isClone ? '<span class="sl-tile-badge">NAM</span>' : '')}
        ${t3k && t3k.image ? `<img class="sl-tile-tone" src="${esc(t3k.image)}" alt="" draggable="false" loading="lazy">` : ''}
        <img class="sl-tile-icon" src="${icon}" alt="${tag}" draggable="false">
        <img class="sl-tile-pointer" src="/assets/ui/effects_pointer.svg" alt="" draggable="false">
        <span class="sl-tile-name">${fxName}</span>
      </button>
    `;
  }

  attachEventListeners() {
    this.container.querySelectorAll('.sl-tile').forEach(tile => {
      const modId = parseInt(tile.dataset.moduleId, 10);
      tile.addEventListener('click', () => {
        if (this.selectedModuleId === modId) return;
        this.selectedModuleId = modId;
        this.render();
        this.onSelectModule?.(modId);
      });
      tile.addEventListener('dblclick', (e) => {
        e.preventDefault();
        presetEngine.setModuleBypass(modId, !presetEngine.activePreset.states[modId]);
      });
    });

    this.container.querySelector('.btn-save-preset')?.addEventListener('click', () => {
      window.app?.saveModal?.open();
    });

    // Preset volume (double-click resets to 75) and pedal master volume
    this.bindVolumeSlider('.preset-volume-slider', '.preset-volume-val', (v) => presetEngine.setPresetVolume(v), 75);
    this.bindVolumeSlider('.master-volume-slider', '.master-volume-val', (v) => presetEngine.setMasterVolume(v), null);
  }

  bindVolumeSlider(sliderSel, valueSel, apply, resetValue) {
    const slider = this.container.querySelector(sliderSel);
    const valEl = this.container.querySelector(valueSel);
    if (!slider) return;

    const setVal = (val) => {
      slider.value = val;
      slider.style.setProperty('--fill', `${val}%`);
      if (valEl) valEl.textContent = val;
      apply(val);
    };
    const startDrag = () => { this.volDragging = true; };
    const endDrag = () => {
      if (!this.volDragging) return;
      this.volDragging = false;
      this.render();
    };
    slider.addEventListener('pointerdown', startDrag);
    slider.addEventListener('touchstart', startDrag, { passive: true });
    slider.addEventListener('change', endDrag);
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('touchend', endDrag);
    slider.addEventListener('input', (e) => setVal(parseInt(e.target.value, 10)));
    if (resetValue !== null) {
      slider.addEventListener('dblclick', () => setVal(resetValue));
      valEl?.addEventListener('dblclick', () => setVal(resetValue));
    }
  }
}
