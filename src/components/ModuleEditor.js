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

    // Global mouse & touch event listeners for smooth rotary knob dragging
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', () => this.handleMouseUp());
    window.addEventListener('touchmove', (e) => {
      if (!this.dragKnob || !e.touches || !e.touches[0]) return;
      this.handleMouseMove(e.touches[0]);
    }, { passive: true });
    window.addEventListener('touchend', () => this.handleMouseUp());
    window.addEventListener('touchcancel', () => this.handleMouseUp());

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
    const isAmpModule = this.currentModuleId === 3;
    const isCloneMode = isAmpModule && preset.ampMode === 'clone';
    const effectiveModuleId = isCloneMode ? 9 : this.currentModuleId;
    const moduleName = isCloneMode ? 'Clone Amp (NAM)' : (MODULE_NAMES[this.currentModuleId] || `Module ${this.currentModuleId}`);

    // Get current effect model
    let currentFxId = preset.selectedEffects[effectiveModuleId];
    if (!currentFxId) {
      if (effectiveModuleId === 0) currentFxId = 1;
      else if (effectiveModuleId === 9) currentFxId = 901;
      else if (effectiveModuleId === 3) currentFxId = 301;
      else currentFxId = 101;
    }

    const effectDef = MODULE_LIBRARY_DATA.effectLibrary[currentFxId] || {
      name: 'Unknown',
      descriptionEn: '',
      alg: []
    };

    // Override display name if custom user slot
    let displayFxName = effectDef.name;
    if (isCloneMode && currentFxId >= 901 && currentFxId <= 905) {
      displayFxName = presetEngine.cloneSlotNames[currentFxId - 901] || effectDef.name;
    } else if (effectiveModuleId === 4 && currentFxId >= 416 && currentFxId <= 420) {
      displayFxName = presetEngine.irSlotNames[currentFxId - 416] || effectDef.name;
    }

    // Get available effect models for this module category
    const availableEffects = this.getAvailableEffectsForModule(this.currentModuleId);

    // Current parameter values for this module
    const currentParams = preset.parameters[effectiveModuleId] || {};

    const canReplaceWithTone3000 = (this.currentModuleId === 3 || this.currentModuleId === 4);

    this.container.innerHTML = `
      <div class="flex flex-col gap-3">
        <!-- Module Header & Model Select -->
        <div class="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-zinc-950/90 border border-zinc-800/80 shadow-sm">
          <div class="flex items-center gap-3 min-w-0">
            <img src="${this.getModuleIconPath(this.currentModuleId, preset.ampMode)}" alt="${moduleName}" class="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" onerror="this.style.display='none'">
            <div class="min-w-0">
              <span class="text-xs sm:text-sm font-bold text-zinc-100 flex items-center gap-2 truncate">
                <span class="text-zinc-400 font-mono text-[11px]">${moduleName}</span>
                <span>${displayFxName}</span>
              </span>
              <p class="text-[11px] text-zinc-400 truncate max-w-[280px] sm:max-w-md">${effectDef.descriptionEn || 'Processore segnale audio.'}</p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            ${isAmpModule ? `
              <div class="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
                <button class="amp-mode-btn factory-btn px-2.5 py-1 rounded-md font-semibold transition ${preset.ampMode === 'factory' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-zinc-400 hover:text-zinc-200'}" data-mode="factory">
                  Factory
                </button>
                <button class="amp-mode-btn clone-btn px-2.5 py-1 rounded-md font-semibold transition ${preset.ampMode === 'clone' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'text-zinc-400 hover:text-zinc-200'}" data-mode="clone">
                  Clone
                </button>
              </div>
            ` : ''}

            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-mono font-bold uppercase text-zinc-400">Modello:</span>
              <select class="model-select bg-zinc-900 border border-zinc-800 focus:border-cyan-500 text-zinc-100 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none cursor-pointer max-w-[200px] sm:max-w-[260px]" data-module-id="${this.currentModuleId}">
                ${this.renderModelSelectOptions(availableEffects, currentFxId)}
              </select>
            </div>

            ${canReplaceWithTone3000 ? `
              <button class="btn-action btn-browse-tone3000 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-900 border border-zinc-800 hover:border-rose-500 text-rose-400 hover:text-white transition" title="${isAmpModule ? 'Sostituisci profilo NAM con Tone3000' : 'Sostituisci Cabinet IR con Tone3000'}">
                <svg class="w-3.5 h-3.5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                <span>${isAmpModule ? 'Sostituisci Clone' : 'Sostituisci IR'}</span>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Parameters Controls Responsive Grid -->
        <div class="controls-panel grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
          ${effectDef.alg && effectDef.alg.length > 0 
            ? effectDef.alg.map(param => this.renderParameterControl(effectiveModuleId, param, currentParams[param.algId])).join('')
            : '<div class="text-zinc-500 text-xs py-8 col-span-full text-center">Nessun parametro regolabile per questo modulo.</div>'
          }
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.updateAllKnobVisuals();
  }

  renderModelSelectOptions(availableEffects, currentFxId) {
    const hasCategory = availableEffects.some(e => e.category);
    if (!hasCategory) {
      return availableEffects.map(fx => `
        <option value="${fx.id}" ${fx.id === currentFxId ? 'selected' : ''}>
          ${fx.name}
        </option>
      `).join('');
    }

    // Group by category
    const groups = {};
    availableEffects.forEach(fx => {
      const cat = fx.category || 'Generale';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(fx);
    });

    return Object.entries(groups).map(([groupName, items]) => `
      <optgroup label="── ${groupName} ──">
        ${items.map(fx => `
          <option value="${fx.id}" ${fx.id === currentFxId ? 'selected' : ''}>
            ${fx.name}
          </option>
        `).join('')}
      </optgroup>
    `).join('');
  }

  getAvailableEffectsForModule(moduleId) {
    const list = [];

    // AMP Module (3): Include BOTH 22 Factory Amps AND 5 Clone / NAM Profiles!
    if (moduleId === 3) {
      // 22 Factory Amps
      for (let id = 301; id <= 322; id++) {
        const def = MODULE_LIBRARY_DATA.effectLibrary[id];
        if (def) {
          list.push({ id, name: def.name, category: 'Amps Factory (22)' });
        }
      }
      // 5 Clone / NAM Profiles
      for (let i = 0; i < 5; i++) {
        const id = 901 + i;
        const customName = presetEngine.cloneSlotNames[i];
        list.push({
          id,
          name: customName ? `Profile ${i + 1}: ${customName}` : (MODULE_LIBRARY_DATA.effectLibrary[id]?.name || `User Profile ${i + 1}`),
          category: 'Profili Clone / NAM (5)'
        });
      }
      return list;
    }

    // IR Module (4): Include BOTH 15 Factory Cabinets AND 5 User IRs!
    if (moduleId === 4) {
      // Factory Cabs 401 to 415
      for (let id = 401; id <= 415; id++) {
        const def = MODULE_LIBRARY_DATA.effectLibrary[id];
        if (def) list.push({ id, name: def.name, category: 'Cabinet Factory (15)' });
      }
      // User IRs 416 to 420
      for (let i = 0; i < 5; i++) {
        const id = 416 + i;
        const customName = presetEngine.irSlotNames[i];
        list.push({
          id,
          name: customName ? `IR ${i + 1}: ${customName}` : (MODULE_LIBRARY_DATA.effectLibrary[id]?.name || `User IR ${i + 1}`),
          category: 'User IR (5)'
        });
      }
      return list;
    }

    // Clone Module (9)
    if (moduleId === 9) {
      for (let i = 0; i < 5; i++) {
        const id = 901 + i;
        const customName = presetEngine.cloneSlotNames[i];
        list.push({
          id,
          name: customName ? `Profile ${i + 1}: ${customName}` : (MODULE_LIBRARY_DATA.effectLibrary[id]?.name || `User Profile ${i + 1}`),
          category: 'Profili Clone / NAM (5)'
        });
      }
      return list;
    }

    // Standard modules (NR, FX1, DRV, EQ, FX2, DLY, RVB)
    const modConfig = MODULE_LIBRARY_DATA.modules?.find(m => m.moduleId === moduleId);
    if (modConfig && modConfig.effects) {
      modConfig.effects.forEach(fxRef => {
        const fxId = typeof fxRef === 'object' && fxRef !== null ? fxRef.id : fxRef;
        const fullDef = MODULE_LIBRARY_DATA.effectLibrary[fxId];
        if (fullDef) {
          list.push({ id: fxId, name: fullDef.name });
        }
      });
    } else {
      for (const [idStr, fx] of Object.entries(MODULE_LIBRARY_DATA.effectLibrary)) {
        const id = parseInt(idStr, 10);
        if (moduleId === 0 && id === 1) list.push({ id, name: fx.name });
        else if (moduleId === 1 && id >= 101 && id <= 199) list.push({ id, name: fx.name });
        else if (moduleId === 2 && id >= 201 && id <= 299) list.push({ id, name: fx.name });
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

    // Amp Mode Toggle (Factory vs Clone/NAM)
    this.container.querySelectorAll('.amp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        presetEngine.setAmpMode(mode);
      });
    });

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

      knob.addEventListener('touchstart', (e) => {
        if (!e.touches || !e.touches[0]) return;
        this.dragKnob = knobCtrl;
        this.startY = e.touches[0].clientY;
        this.startVal = parseFloat(knobCtrl.dataset.val);
      }, { passive: true });

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
