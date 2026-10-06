/**
 * Signal Chain Component
 * Displays the reorderable 9-module pedalboard rack, bypass switches,
 * live LED indicators, and Amp/Clone mode switcher.
 */

import { presetEngine } from '../core/preset-engine.js';
import { MODULE_LIBRARY_DATA } from '../data/module-library.js';
import { MODULE_NAMES } from '../core/protocol.js';

export class SignalChain {
  constructor(containerElement, onSelectModule) {
    this.container = containerElement;
    this.onSelectModule = onSelectModule;
    this.selectedModuleId = 3; // Default to AMP

    // Subscribe to preset state changes
    presetEngine.onStateChange(() => this.render());
    this.render();
  }

  setSelectedModule(moduleId) {
    this.selectedModuleId = moduleId;
    this.render();
  }

  render() {
    const preset = presetEngine.activePreset;
    const order = preset.order || [0, 1, 2, 3, 4, 5, 6, 7, 8];

    this.container.innerHTML = `
      <div class="signal-chain-wrapper">
        <div class="rack-top-bar">
          <div class="chain-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12h16M4 6h16M4 18h16"/>
            </svg>
            Signal Chain & Routing
          </div>
          
          <div class="chain-controls">
            <!-- Amp Mode (Factory vs Clone/NAM) -->
            <div class="amp-mode-toggle">
              <button class="amp-mode-btn factory-btn ${preset.ampMode === 'factory' ? 'active' : ''}" data-mode="factory">
                Factory Amp
              </button>
              <button class="amp-mode-btn clone-btn ${preset.ampMode === 'clone' ? 'active' : ''}" data-mode="clone">
                Clone / NAM
              </button>
            </div>

            <!-- Patch Volume -->
            <div class="preset-volume-widget">
              <span class="preset-volume-label">Vol</span>
              <input type="range" class="preset-volume-slider" min="0" max="100" value="${preset.volume}">
              <span class="preset-volume-val">${preset.volume}</span>
            </div>
          </div>
        </div>

        <div class="signal-chain-container">
          <div class="jack-node input">
            <span>IN</span>
          </div>

          ${order.map((modId, index) => this.renderModuleCard(modId, index, order.length)).join('')}

          <div class="jack-node output">
            <span>OUT</span>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderModuleCard(modId, index, totalModules) {
    const preset = presetEngine.activePreset;
    const isBypassed = !preset.states[modId];
    const isSelected = this.selectedModuleId === modId;
    const modTag = MODULE_NAMES[modId] || `MOD ${modId}`;

    // Get current effect name
    const fxId = modId === 3 && preset.ampMode === 'clone' 
      ? preset.selectedEffects[9] 
      : preset.selectedEffects[modId];

    const fxDef = MODULE_LIBRARY_DATA.effectLibrary[fxId];
    const fxName = fxDef ? fxDef.name : (modId === 3 && preset.ampMode === 'clone' ? 'User Profile 1' : 'Off');

    // Official icon name
    const iconName = this.getModuleIconPath(modId, preset.ampMode);

    return `
      <div class="module-card ${isBypassed ? 'bypassed' : ''} ${isSelected ? 'selected' : ''}" data-module-id="${modId}">
        <div class="card-top">
          <span class="module-tag">${modTag}</span>
          <div class="card-move-btns">
            ${index > 0 ? `<button class="btn-move btn-move-left" data-index="${index}" title="Move Left">&larr;</button>` : ''}
            ${index < totalModules - 1 ? `<button class="btn-move btn-move-right" data-index="${index}" title="Move Right">&rarr;</button>` : ''}
          </div>
        </div>

        <div class="card-center">
          <img src="${iconName}" alt="${modTag}" class="module-icon-img" onerror="this.style.display='none'">
          <span class="effect-model-name" title="${fxName}">${fxName}</span>
        </div>

        <div class="card-bottom">
          <div class="module-bypass-toggle" data-module-id="${modId}">
            <div class="module-led"></div>
            <span class="bypass-status-text">${isBypassed ? 'OFF' : 'ON'}</span>
          </div>
        </div>
      </div>
    `;
  }

  getModuleIconPath(modId, ampMode) {
    const iconMap = {
      0: 'nr_on.svg',
      1: 'fx1_on.svg',
      2: 'drv_on.svg',
      3: ampMode === 'clone' ? 'effects.svg' : 'drv_on.svg',
      4: 'ir_on.svg',
      5: 'eq_on.svg',
      6: 'fx2_on.svg',
      7: 'dly_on.svg',
      8: 'rvb_on.svg'
    };
    const filename = iconMap[modId] || 'effects.svg';
    return `/assets/images/${filename}`;
  }

  attachEventListeners() {
    // Select module card
    this.container.querySelectorAll('.module-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.module-bypass-toggle') || e.target.closest('.btn-move')) {
          return; // Let child handler handle it
        }
        const modId = parseInt(card.dataset.moduleId, 10);
        this.selectedModuleId = modId;
        this.render();
        if (this.onSelectModule) {
          this.onSelectModule(modId);
        }
      });
    });

    // Toggle module bypass
    this.container.querySelectorAll('.module-bypass-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const modId = parseInt(toggle.dataset.moduleId, 10);
        const currentState = presetEngine.activePreset.states[modId];
        presetEngine.setModuleBypass(modId, !currentState);
      });
    });

    // Reorder modules left/right
    this.container.querySelectorAll('.btn-move-left').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const order = [...presetEngine.activePreset.order];
        if (idx > 0) {
          const temp = order[idx];
          order[idx] = order[idx - 1];
          order[idx - 1] = temp;
          presetEngine.setChainOrder(order);
        }
      });
    });

    this.container.querySelectorAll('.btn-move-right').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const order = [...presetEngine.activePreset.order];
        if (idx < order.length - 1) {
          const temp = order[idx];
          order[idx] = order[idx + 1];
          order[idx + 1] = temp;
          presetEngine.setChainOrder(order);
        }
      });
    });

    // Amp Mode toggle buttons
    this.container.querySelectorAll('.amp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        presetEngine.setAmpMode(mode);
      });
    });

    // Preset volume slider
    const volSlider = this.container.querySelector('.preset-volume-slider');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.container.querySelector('.preset-volume-val').textContent = val;
        presetEngine.setPresetVolume(val);
      });
    }
  }
}
