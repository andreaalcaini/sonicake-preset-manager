/**
 * Module Editor Component
 * Renders parameter controls with skeuomorphic rotary hardware knobs,
 * model selector dropdown, description, and switches.
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

    // Subscribe to engine state changes
    presetEngine.onStateChange(() => this.render());
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
    const moduleName = isCloneMode ? 'Clone Amp' : (MODULE_NAMES[this.currentModuleId] || `Module ${this.currentModuleId}`);

    // Get current effect model
    const currentFxId = preset.selectedEffects[effectiveModuleId] || 
      (effectiveModuleId === 0 ? 1 : 101);

    const effectDef = MODULE_LIBRARY_DATA.effectLibrary[currentFxId] || {
      name: 'Unknown',
      descriptionEn: '',
      alg: []
    };

    // Get available effect models for this module category
    const availableEffects = this.getAvailableEffectsForModule(effectiveModuleId);

    // Current parameter values for this module
    const currentParams = preset.parameters[effectiveModuleId] || {};

    this.container.innerHTML = `
      <div class="module-editor-container">
        <!-- Module Header & Model Select -->
        <div class="module-editor-header">
          <div class="module-info">
            <img src="${this.getModuleIconPath(this.currentModuleId, preset.ampMode)}" alt="${moduleName}" class="module-header-icon" onerror="this.style.display='none'">
            <div class="module-header-details">
              <span class="module-header-title">${moduleName}: ${effectDef.name}</span>
              <p class="module-header-desc">${effectDef.descriptionEn || 'Custom sound processor module.'}</p>
            </div>
          </div>

          <div class="model-selector-wrap">
            <span class="model-selector-label">Model:</span>
            <select class="model-select" data-module-id="${effectiveModuleId}">
              ${availableEffects.map(fx => `
                <option value="${fx.id}" ${fx.id === currentFxId ? 'selected' : ''}>
                  ${fx.name}
                </option>
              `).join('')}
            </select>
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
    const modConfig = MODULE_LIBRARY_DATA.modules?.find(m => m.moduleId === moduleId);
    if (modConfig && modConfig.effects) {
      modConfig.effects.forEach(fxRef => {
        const fullDef = MODULE_LIBRARY_DATA.effectLibrary[fxRef.id];
        if (fullDef) {
          list.push({ id: fxRef.id, name: fullDef.name });
        }
      });
    } else {
      // Fallback search in effectLibrary by ID prefix
      for (const [idStr, fx] of Object.entries(MODULE_LIBRARY_DATA.effectLibrary)) {
        const id = parseInt(idStr, 10);
        if (moduleId === 0 && id === 1) list.push({ id, name: fx.name });
        else if (moduleId === 1 && id >= 101 && id <= 199) list.push({ id, name: fx.name });
        else if (moduleId === 2 && id >= 201 && id <= 299) list.push({ id, name: fx.name });
        else if (moduleId === 3 && id >= 301 && id <= 399) list.push({ id, name: fx.name });
        else if (moduleId === 4 && id >= 401 && id <= 499) list.push({ id, name: fx.name });
        else if (moduleId === 5 && id >= 501 && id <= 599) list.push({ id, name: fx.name });
        else if (moduleId === 6 && id >= 601 && id <= 699) list.push({ id, name: fx.name });
        else if (moduleId === 7 && id >= 701 && id <= 799) list.push({ id, name: fx.name });
        else if (moduleId === 8 && id >= 801 && id <= 899) list.push({ id, name: fx.name });
        else if (moduleId === 9 && id >= 901 && id <= 999) list.push({ id, name: fx.name });
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
    const deltaY = this.startY - e.clientY; // Drag UP increases value
    const min = parseFloat(this.dragKnob.dataset.min);
    const max = parseFloat(this.dragKnob.dataset.max);
    const range = max - min;

    // 200px drag covers entire range
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

    // Update visuals
    this.updateKnobVisual(knobCtrl, roundVal);

    // Update engine
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

    // Angle: -135deg to +135deg (270 degrees total)
    const angle = -135 + (percent * 270);

    // Rotate cap
    const cap = knobCtrl.querySelector('.knob-cap');
    if (cap) {
      cap.style.transform = `rotate(${angle}deg)`;
    }

    // Arc progress fill
    const fillCircle = knobCtrl.querySelector('.knob-track-fill');
    if (fillCircle) {
      const radius = 28;
      const circumference = 2 * Math.PI * radius; // 175.93
      // The arc covers 270/360 = 75% of circle
      const maxArcLength = circumference * 0.75;
      const currentArc = percent * maxArcLength;
      const offset = circumference - currentArc;
      fillCircle.style.strokeDashoffset = offset;
    }

    // Numeric display
    const valDisplay = knobCtrl.querySelector('.knob-value-display');
    if (valDisplay && !valDisplay.querySelector('input')) {
      valDisplay.textContent = Math.round(value);
    }
  }
}
