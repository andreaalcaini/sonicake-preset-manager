/**
 * Module Editor Component
 * Renders parameter controls with skeuomorphic rotary hardware knobs,
 * model selector dropdown, description, switches, and direct Tone3000 replacement.
 */

import { presetEngine } from '../core/preset-engine.js';
import { MODULE_LIBRARY_DATA } from '../data/module-library.js';
import { MODULE_NAMES } from '../core/protocol.js';

export class ModuleEditor {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentModuleId = 3; // Default to AMP
    this.dragKnob = null;
    this.startY = 0;
    this.startVal = 0;

    // Global mouse event listeners for smooth rotary knob dragging
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', () => this.handleMouseUp());

    // Subscribe to engine state & user slot changes
    presetEngine.onStateChange(() => this.render());
    presetEngine.onUserSlotsChange(() => this.render());

    this.render();
  }

  setModule(moduleId) {
    this.currentModuleId = moduleId;
    this.render();
  }

  render() {
    const preset = presetEngine.activePreset;
    const isCloneMode = this.currentModuleId === 3 && preset.ampMode === 'clone';
    const effectiveModuleId = isCloneMode ? 9 : this.currentModuleId;
    const moduleName = isCloneMode ? 'Clone Amp (NAM)' : (MODULE_NAMES[this.currentModuleId] || `Module ${this.currentModuleId}`);

    // Get current effect model
    const currentFxId = preset.selectedEffects[effectiveModuleId] || 
      (effectiveModuleId === 0 ? 1 : (effectiveModuleId === 9 ? 901 : 101));

    const effectDef = MODULE_LIBRARY_DATA.effectLibrary[currentFxId] || {
      name: 'Unknown',
      descriptionEn: '',
      alg: []
    };

    // Override display name if custom user slot
    let displayFxName = effectDef.name;
    if (effectiveModuleId === 9 && currentFxId >= 901 && currentFxId <= 905) {
      displayFxName = presetEngine.cloneSlotNames[currentFxId - 901] || effectDef.name;
    } else if (effectiveModuleId === 4 && currentFxId >= 416 && currentFxId <= 420) {
      displayFxName = presetEngine.irSlotNames[currentFxId - 416] || effectDef.name;
    }

    // Get available effect models for this module category
    const availableEffects = this.getAvailableEffectsForModule(effectiveModuleId);

    // Current parameter values for this module
    const currentParams = preset.parameters[effectiveModuleId] || {};

    const canReplaceWithTone3000 = (this.currentModuleId === 3 || this.currentModuleId === 4);

    this.container.innerHTML = `
      <div class="module-editor-container">
        <!-- Module Header & Model Select -->
        <div class="module-editor-header">
          <div class="module-info">
            <img src="${this.getModuleIconPath(this.currentModuleId, preset.ampMode)}" alt="${moduleName}" class="module-header-icon" onerror="this.style.display='none'">
            <div class="module-header-details">
              <span class="module-header-title">${moduleName}: ${displayFxName}</span>
              <p class="module-header-desc">${effectDef.descriptionEn || 'Audio effect processor module.'}</p>
            </div>
          </div>

          <div class="model-selector-wrap" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span class="model-selector-label">Model:</span>
            <select class="model-select" data-module-id="${effectiveModuleId}">
              ${availableEffects.map(fx => `
                <option value="${fx.id}" ${fx.id === currentFxId ? 'selected' : ''}>
                  ${fx.name}
                </option>
              `).join('')}
            </select>

            ${canReplaceWithTone3000 ? `
              <button class="btn-action btn-tone3000 btn-browse-tone3000" style="padding: 6px 14px; font-size: 11px;" title="Cerca e sostituisci questo ${this.currentModuleId === 3 ? 'Amplificatore' : 'Cabinet/IR'} su Tone3000">
                ⚡ Sostituisci da Tone3000
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Parameters Controls Grid -->
        <div class="controls-panel">
          ${effectDef.alg && effectDef.alg.length > 0 
            ? effectDef.alg.map(param => this.renderParameterControl(effectiveModuleId, param, currentParams[param.algId])).join('')
            : '<div style="color: var(--text-muted); font-size: 13px;">No adjustable parameters for this module.</div>'
          }
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.updateAllKnobVisuals();
  }

  getAvailableEffectsForModule(moduleId) {
    const list = [];

    // Clone Module (9)
    if (moduleId === 9) {
      for (let i = 0; i < 5; i++) {
        const id = 901 + i;
        const customName = presetEngine.cloneSlotNames[i];
        list.push({
          id,
          name: customName ? `Profile ${i + 1}: ${customName}` : (MODULE_LIBRARY_DATA.effectLibrary[id]?.name || `User Profile ${i + 1}`)
        });
      }
      return list;
    }

    // IR Module (4)
    if (moduleId === 4) {
      // Factory Cabs 401 to 415
      for (let id = 401; id <= 415; id++) {
        const def = MODULE_LIBRARY_DATA.effectLibrary[id];
        if (def) list.push({ id, name: def.name });
      }
      // User IRs 416 to 420
      for (let i = 0; i < 5; i++) {
        const id = 416 + i;
        const customName = presetEngine.irSlotNames[i];
        list.push({
          id,
          name: customName ? `IR ${i + 1}: ${customName}` : (MODULE_LIBRARY_DATA.effectLibrary[id]?.name || `User IR ${i + 1}`)
        });
      }
      return list;
    }

    // Standard modules
    const modConfig = MODULE_LIBRARY_DATA.modules?.find(m => m.moduleId === moduleId);
    if (modConfig && modConfig.effects) {
      modConfig.effects.forEach(fxRef => {
        const fullDef = MODULE_LIBRARY_DATA.effectLibrary[fxRef.id];
        if (fullDef) {
          list.push({ id: fxRef.id, name: fullDef.name });
        }
      });
    } else {
      for (const [idStr, fx] of Object.entries(MODULE_LIBRARY_DATA.effectLibrary)) {
        const id = parseInt(idStr, 10);
        if (moduleId === 0 && id === 1) list.push({ id, name: fx.name });
        else if (moduleId === 1 && id >= 101 && id <= 199) list.push({ id, name: fx.name });
        else if (moduleId === 2 && id >= 201 && id <= 299) list.push({ id, name: fx.name });
        else if (moduleId === 3 && id >= 301 && id <= 399) list.push({ id, name: fx.name });
        else if (moduleId === 5 && id >= 501 && id <= 599) list.push({ id, name: fx.name });
        else if (moduleId === 6 && id >= 601 && id <= 699) list.push({ id, name: fx.name });
        else if (moduleId === 7 && id >= 701 && id <= 799) list.push({ id, name: fx.name });
        else if (moduleId === 8 && id >= 801 && id <= 899) list.push({ id, name: fx.name });
      }
    }
    return list;
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
    return `/assets/images/${iconMap[modId] || 'effects.svg'}`;
  }

  renderParameterControl(moduleId, param, rawValue) {
    const min = param.min !== undefined ? param.min : 0;
    const max = param.max !== undefined ? param.max : 100;
    const val = rawValue !== undefined ? rawValue : (param.defaultValue !== undefined ? param.defaultValue : 50);

    // Switch Widget (Toggle)
    if (param.widgetType === 1) {
      const isActive = val > 0;
      return `
        <div class="switch-control" data-module-id="${moduleId}" data-alg-id="${param.algId}">
          <span class="knob-label">${param.name}</span>
          <div class="toggle-switch-btn ${isActive ? 'active' : ''}" data-val="${val}">
            <div class="toggle-switch-thumb"></div>
          </div>
          <span class="knob-value-display">${isActive ? 'ON' : 'OFF'}</span>
        </div>
      `;
    }

    // Dropdown Widget
    if (param.widgetType === 2 && param.options) {
      return `
        <div class="switch-control" data-module-id="${moduleId}" data-alg-id="${param.algId}">
          <span class="knob-label">${param.name}</span>
          <select class="model-select" style="min-width: 100px; padding: 6px 10px;" data-module-id="${moduleId}" data-alg-id="${param.algId}">
            ${param.options.map((opt, i) => `
              <option value="${i}" ${i === val ? 'selected' : ''}>${opt}</option>
            `).join('')}
          </select>
        </div>
      `;
    }

    // Default: Skeuomorphic Rotary Knob
    const radius = 28;
    const circumference = 2 * Math.PI * radius; // ~175.93

    return `
      <div class="knob-control" data-module-id="${moduleId}" data-alg-id="${param.algId}" data-min="${min}" data-max="${max}" data-val="${val}">
        <span class="knob-label">${param.name}</span>
        
        <div class="rotary-knob" data-alg-id="${param.algId}">
          <svg class="knob-arc-svg" viewBox="0 0 64 64">
            <circle class="knob-track-bg" cx="32" cy="32" r="${radius}" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * 0.25}"/>
            <circle class="knob-track-fill" cx="32" cy="32" r="${radius}" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"/>
          </svg>
          <div class="knob-cap">
            <div class="knob-pointer"></div>
          </div>
        </div>

        <div class="knob-value-display" title="Double click to edit">${val}${param.unit ? ' ' + param.unit : ''}</div>
      </div>
    `;
  }

  attachEventListeners() {
    // Model Select
    const modelSelect = this.container.querySelector('.model-select[data-module-id]');
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        const modId = parseInt(modelSelect.dataset.moduleId, 10);
        const fxId = parseInt(e.target.value, 10);
        presetEngine.setEffectType(modId, fxId);
      });
    }

    // Browse & Replace on Tone3000 button
    const btnTone3000 = this.container.querySelector('.btn-browse-tone3000');
    if (btnTone3000) {
      btnTone3000.addEventListener('click', () => {
        const targetType = this.currentModuleId === 3 ? 'amp' : 'cab';
        if (window.app && window.app.tone3000Modal) {
          window.app.tone3000Modal.openForReplacement({ targetType });
        }
      });
    }

    // Rotary Knobs Mouse Drag & Wheel
    this.container.querySelectorAll('.knob-control').forEach(knobCtrl => {
      const knob = knobCtrl.querySelector('.rotary-knob');
      const valDisplay = knobCtrl.querySelector('.knob-value-display');

      knob.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.dragKnob = knobCtrl;
        this.startY = e.clientY;
        this.startVal = parseFloat(knobCtrl.dataset.val);
      });

      // Mouse Wheel Support
      knobCtrl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const min = parseFloat(knobCtrl.dataset.min);
        const max = parseFloat(knobCtrl.dataset.max);
        let val = parseFloat(knobCtrl.dataset.val);
        const step = (max - min) / 100;
        val += (e.deltaY < 0 ? 1 : -1) * (step >= 1 ? 1 : 0.1);
        val = Math.max(min, Math.min(max, val));
        
        this.updateKnobValue(knobCtrl, val);
      });

      // Double-click to type exact value
      valDisplay.addEventListener('dblclick', () => {
        const currentVal = knobCtrl.dataset.val;
        valDisplay.innerHTML = `<input type="number" class="knob-value-input" value="${currentVal}">`;
        const input = valDisplay.querySelector('input');
        input.focus();
        input.select();

        const finishEdit = () => {
          let num = parseFloat(input.value);
          const min = parseFloat(knobCtrl.dataset.min);
          const max = parseFloat(knobCtrl.dataset.max);
          if (!isNaN(num)) {
            num = Math.max(min, Math.min(max, num));
            this.updateKnobValue(knobCtrl, num);
          } else {
            valDisplay.textContent = currentVal;
          }
        };

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finishEdit();
          if (e.key === 'Escape') valDisplay.textContent = currentVal;
        });
      });
    });

    // Switch Toggles
    this.container.querySelectorAll('.toggle-switch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.switch-control');
        const modId = parseInt(parent.dataset.moduleId, 10);
        const algId = parseInt(parent.dataset.algId, 10);
        const currentVal = parseInt(btn.dataset.val, 10);
        const nextVal = currentVal > 0 ? 0 : 1;

        presetEngine.setParameter(modId, algId, nextVal);
      });
    });
  }

  handleMouseMove(e) {
    if (!this.dragKnob) return;
    const deltaY = this.startY - e.clientY;
    const min = parseFloat(this.dragKnob.dataset.min);
    const max = parseFloat(this.dragKnob.dataset.max);
    const range = max - min;

    const sensitivity = range / 200;
    let nextVal = this.startVal + (deltaY * sensitivity);
    nextVal = Math.max(min, Math.min(max, nextVal));

    this.updateKnobValue(this.dragKnob, nextVal);
  }

  handleMouseUp() {
    this.dragKnob = null;
  }

  updateKnobValue(knobCtrl, value) {
    const roundVal = Math.round(value);
    knobCtrl.dataset.val = roundVal;

    const modId = parseInt(knobCtrl.dataset.moduleId, 10);
    const algId = parseInt(knobCtrl.dataset.algId, 10);

    this.updateKnobVisual(knobCtrl, roundVal);
    presetEngine.setParameter(modId, algId, roundVal);
  }

  updateAllKnobVisuals() {
    this.container.querySelectorAll('.knob-control').forEach(knobCtrl => {
      const val = parseFloat(knobCtrl.dataset.val);
      this.updateKnobVisual(knobCtrl, val);
    });
  }

  updateKnobVisual(knobCtrl, value) {
    const min = parseFloat(knobCtrl.dataset.min);
    const max = parseFloat(knobCtrl.dataset.max);
    const percent = Math.max(0, Math.min(1, (value - min) / (max - min)));

    const angle = -135 + (percent * 270);

    const cap = knobCtrl.querySelector('.knob-cap');
    if (cap) {
      cap.style.transform = `rotate(${angle}deg)`;
    }

    const fillCircle = knobCtrl.querySelector('.knob-track-fill');
    if (fillCircle) {
      const radius = 28;
      const circumference = 2 * Math.PI * radius;
      const maxArcLength = circumference * 0.75;
      const currentArc = percent * maxArcLength;
      const offset = circumference - currentArc;
      fillCircle.style.strokeDashoffset = offset;
    }

    const valDisplay = knobCtrl.querySelector('.knob-value-display');
    if (valDisplay && !valDisplay.querySelector('input')) {
      valDisplay.textContent = Math.round(value);
    }
  }
}
