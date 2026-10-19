/**
 * Module Editor Component
 * Renders parameter controls with skeuomorphic rotary hardware knobs,
 * model selector dropdown, description, switches, and direct Tone3000 replacement.
 */

import { presetEngine } from '../core/preset-engine.js';
import { MODULE_LIBRARY_DATA } from '../data/module-library.js';
import { MODULE_NAMES, isFixedChainModule, toChainUnits, moveChainModule } from '../core/protocol.js';
import { T3K_LOGO, T3K_MARK } from '../config/tone3000.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const desktopQuery = window.matchMedia('(min-width: 1024px)');

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
    desktopQuery.addEventListener('change', () => this.render());

    this.render();
  }

  setModule(moduleId) {
    this.currentModuleId = moduleId;
    this.render();
  }

  render() {
    if (this.dragKnob || this.sliderActive) return;
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
      let customName = presetEngine.cloneSlotNames[currentFxId - 901] || effectDef.name;
      if (customName === 'Audio Assa') customName = 'Audio Assault Slow30';
      if (customName === 'Petersburg') customName = 'Petersburg Thunder';
      displayFxName = customName;
    } else if (effectiveModuleId === 4 && currentFxId >= 416 && currentFxId <= 420) {
      displayFxName = presetEngine.irSlotNames[currentFxId - 416] || effectDef.name;
    }

    // Get available effect models for this module category
    const availableEffects = this.getAvailableEffectsForModule(this.currentModuleId);

    // Current parameter values for this module
    const currentParams = preset.parameters[effectiveModuleId] || {};

    const canReplaceWithTone3000 = (this.currentModuleId === 3 || this.currentModuleId === 4);
    const loadedTone = canReplaceWithTone3000 ? presetEngine.activeToneSource(this.currentModuleId) : null;
    const isOn = !!preset.states[this.currentModuleId];
    const order = preset.order || [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const units = toChainUnits(order);
    const unitPos = units.indexOf(this.currentModuleId);
    const useSliders = !desktopQuery.matches;
    const params = effectDef.alg || [];

    this.container.innerHTML = `
      <div class="sl-editor">
        <!-- Module on/off + effect model selector (SonicLink style) -->
        <div class="sl-module-row">
          <button class="sl-switch module-power ${isOn ? 'on' : ''}" title="${isOn ? 'Modulo attivo: tocca per bypass' : 'Modulo in bypass: tocca per attivare'}"></button>
          <label class="sl-selector" title="${effectDef.descriptionEn || ''}">
            <span class="sl-selector-text">${moduleName} - ${displayFxName}</span>
            <img src="/assets/ui/dropdown.svg" alt="">
            <select class="model-select" data-module-id="${this.currentModuleId}">
              ${this.renderModelSelectOptions(availableEffects, currentFxId)}
            </select>
          </label>
        </div>

        ${isAmpModule || canReplaceWithTone3000 ? `
          <div class="sl-chip-row">
            ${isAmpModule ? `
              <div class="sl-segmented">
                <button class="amp-mode-btn ${preset.ampMode === 'factory' ? 'active' : ''}" data-mode="factory">Factory</button>
                <button class="amp-mode-btn ${preset.ampMode === 'clone' ? 'active' : ''}" data-mode="clone">Clone</button>
              </div>
            ` : ''}
            ${canReplaceWithTone3000 ? `
              <button class="sl-pill-btn btn-browse-tone3000" title="${isAmpModule ? 'Carica una cattura NAM dalla libreria TONE3000 in uno slot Clone' : 'Carica un IR dalla libreria TONE3000 in uno slot User IR'}" aria-label="Libreria TONE3000">
                <img src="${T3K_LOGO}" alt="TONE3000" class="h-3.5 w-auto">
              </button>
            ` : ''}
          </div>
        ` : ''}

        ${loadedTone ? this.renderLoadedTone(loadedTone) : ''}

        <!-- Position in the chain (DRV-AMP-IR-EQ is a fixed block, like on SonicLink) -->
        <div class="sl-chip-row">
          <span class="sl-section-label">Posizione</span>
          ${isFixedChainModule(this.currentModuleId) ? `
            <span class="text-sm text-zinc-400">Fissa nel blocco DRV · AMP · IR · EQ</span>
          ` : `
            <button class="sl-pill-btn btn-chain-move" data-dir="-1" ${unitPos <= 0 ? 'disabled' : ''} title="Sposta prima nella catena">
              <img src="/assets/ui/btn_previous.svg" alt="" class="w-4 h-4">
            </button>
            <span class="text-sm text-zinc-400 tabular-nums">${unitPos + 1} / ${units.length}</span>
            <button class="sl-pill-btn btn-chain-move" data-dir="1" ${unitPos >= units.length - 1 ? 'disabled' : ''} title="Sposta dopo nella catena">
              <img src="/assets/ui/btn_next.svg" alt="" class="w-4 h-4">
            </button>
          `}
        </div>

        <!-- Interactive EQ Visualizer Curve (Module 5 EQ) -->
        ${effectiveModuleId === 5 ? this.renderEqVisualizer(currentFxId, currentParams, effectDef) : ''}

        ${params.length === 0
          ? '<div class="text-zinc-500 text-sm py-6 text-center">Nessun parametro regolabile per questo modulo.</div>'
          : useSliders
            ? `<div class="sl-params">${params.map(param => this.renderParameterRow(effectiveModuleId, param, currentParams[param.algId])).join('')}</div>`
            : `<div class="controls-panel grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4 p-4 rounded-md bg-[#0b0b0c] justify-items-center">
                ${params.map(param => this.renderParameterControl(effectiveModuleId, param, currentParams[param.algId])).join('')}
              </div>`
        }
      </div>
    `;

    this.attachEventListeners();
    this.updateAllKnobVisuals();
  }

  /** Mobile parameter row: LABEL ──slider── value (SonicLink layout) */
  renderParameterRow(moduleId, param, rawValue) {
    const min = param.min !== undefined ? param.min : 0;
    const max = param.max !== undefined ? param.max : 100;
    const val = rawValue !== undefined ? rawValue : (param.defaultValue !== undefined ? param.defaultValue : 50);

    if (param.widgetType === 1) {
      const isActive = val > 0;
      return `
        <div class="sl-param switch-control" data-module-id="${moduleId}" data-alg-id="${param.algId}">
          <span class="sl-param-label" title="${param.name}">${param.name}</span>
          <span class="flex-1"></span>
          <button class="sl-switch small toggle-switch-btn ${isActive ? 'on' : ''}" data-val="${val}"></button>
        </div>
      `;
    }

    if (param.widgetType === 2 && param.options) {
      return `
        <div class="sl-param" data-module-id="${moduleId}" data-alg-id="${param.algId}">
          <span class="sl-param-label" title="${param.name}">${param.name}</span>
          <select class="param-option-select" data-module-id="${moduleId}" data-alg-id="${param.algId}">
            ${param.options.map((opt, i) => `<option value="${i}" ${i === val ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>
        </div>
      `;
    }

    const fill = max > min ? ((val - min) / (max - min)) * 100 : 0;
    return `
      <div class="sl-param slider-control" data-module-id="${moduleId}" data-alg-id="${param.algId}" data-min="${min}" data-max="${max}">
        <span class="sl-param-label" title="${param.name}">${param.name}</span>
        <input type="range" class="sl-range white param-slider" min="${min}" max="${max}" step="1" value="${val}" style="--fill:${fill}%">
        <span class="sl-param-val">${val}${param.unit ? param.unit : ''}</span>
      </div>
    `;
  }

  /**
   * Capture loaded from TONE3000 in this block (API design requirements): tone image, T3K mark,
   * title, gear type, format, creator and license; "Dettagli" opens the tone details.
   */
  renderLoadedTone(tone) {
    return `
      <div class="t3k-loaded-tone flex items-center gap-3 p-2.5 rounded-xl bg-[#18191d] border border-zinc-800">
        ${tone.image ? `<img src="${esc(tone.image)}" alt="" loading="lazy" class="w-12 h-12 rounded-lg object-cover shrink-0 bg-zinc-800">` : ''}
        <div class="min-w-0 flex-1">
          <div class="flex items-start gap-1.5 min-w-0">
            <img src="${T3K_MARK}" alt="TONE3000" class="h-3 w-auto shrink-0 mt-1">
            <span class="text-sm font-bold text-zinc-100 leading-snug line-clamp-2">${esc(tone.toneTitle)}</span>
          </div>
          <!-- Creator and license are never cut off (TONE3000 API terms) -->
          <div class="text-[11px] text-zinc-400 leading-snug break-words">
            ${[tone.gearLabel, tone.format ? String(tone.format).toUpperCase() : null, tone.creator ? `@${tone.creator}` : null, tone.license].filter(Boolean).map(esc).join(' · ')}
          </div>
        </div>
        <button type="button" class="btn-t3k-tone-details sl-pill-btn shrink-0" data-tone-id="${esc(tone.toneId)}">Dettagli</button>
      </div>
    `;
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
    // AMP Module (3): Include BOTH 22 Factory Amps AND 5 Clone / NAM Profiles!
    if (moduleId === 3) {
      const cloneList = [];
      for (let i = 0; i < 5; i++) {
        const id = 901 + i;
        let customName = presetEngine.cloneSlotNames[i];
        if (customName === 'Audio Assa') customName = 'Audio Assault Slow30';
        if (customName === 'Petersburg') customName = 'Petersburg Thunder';
        if (!customName || customName === 'Empty') customName = `Slot ${i + 1} (Libero)`;
        cloneList.push({
          id,
          name: `NAM ${i + 1}: ${customName}`,
          category: 'Profili Clone / NAM (5)'
        });
      }

      const factoryList = [];
      for (let id = 301; id <= 322; id++) {
        const def = MODULE_LIBRARY_DATA.effectLibrary[id];
        if (def) {
          factoryList.push({ id, name: def.name, category: 'Amps Factory (22)' });
        }
      }

      const preset = presetEngine.activePreset;
      if (preset && preset.ampMode === 'clone') {
        return [...cloneList, ...factoryList];
      }
      return [...factoryList, ...cloneList];
    }

    // IR Module (4): Include BOTH 15 Factory Cabinets AND 5 User IRs!
    if (moduleId === 4) {
      const list = [];
      // Factory Cabs 401 to 415
      for (let id = 401; id <= 415; id++) {
        const def = MODULE_LIBRARY_DATA.effectLibrary[id];
        if (def) list.push({ id, name: def.name, category: 'Cabinet Factory (15)' });
      }
      // User IRs 416 to 420
      for (let i = 0; i < 5; i++) {
        const id = 416 + i;
        let customName = presetEngine.irSlotNames[i];
        if (!customName || customName === 'Empty') customName = `User IR ${i + 1}`;
        list.push({
          id,
          name: `IR ${i + 1}: ${customName}`,
          category: 'User IR (5)'
        });
      }
      return list;
    }

    // Clone Module (9)
    if (moduleId === 9) {
      const list = [];
      for (let i = 0; i < 5; i++) {
        const id = 901 + i;
        let customName = presetEngine.cloneSlotNames[i];
        if (customName === 'Audio Assa') customName = 'Audio Assault Slow30';
        if (customName === 'Petersburg') customName = 'Petersburg Thunder';
        if (!customName || customName === 'Empty') customName = `Slot ${i + 1} (Libero)`;
        list.push({
          id,
          name: `NAM ${i + 1}: ${customName}`,
          category: 'Profili Clone / NAM (5)'
        });
      }
      return list;
    }

    // Standard modules (NR, FX1, DRV, EQ, FX2, DLY, RVB)
    const list = [];
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
    return `/assets/ui/${iconMap[modId] || 'effects.svg'}`;
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
    const defaultVal = param.defaultValue !== undefined ? param.defaultValue : (Number.isInteger(min) && Number.isInteger(max) ? Math.round((min + max) / 2) : parseFloat(((min + max) / 2).toFixed(1)));

    return `
      <div class="knob-control" data-module-id="${moduleId}" data-alg-id="${param.algId}" data-min="${min}" data-max="${max}" data-default="${defaultVal}" data-val="${val}">
        <span class="knob-label" title="Doppio clic o Alt+Clic per ripristinare al centro (ore 12)">${param.name}</span>
        
        <div class="rotary-knob" data-alg-id="${param.algId}" title="Doppio clic o Alt+Clic per ripristinare al centro (ore 12)">
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

        <div class="knob-value-display" title="Doppio clic per modificare valore, Alt+Clic per centrare">${val}${param.unit ? ' ' + param.unit : ''}</div>
      </div>
    `;
  }

  attachEventListeners() {
    // Module power (bypass) switch
    this.container.querySelector('.module-power')?.addEventListener('click', () => {
      const modId = this.currentModuleId;
      presetEngine.setModuleBypass(modId, !presetEngine.activePreset.states[modId]);
    });

    // Move a free module earlier / later; it hops over the DRV-AMP-IR-EQ block as one unit
    this.container.querySelectorAll('.btn-chain-move').forEach(btn => {
      btn.addEventListener('click', () => {
        const order = presetEngine.activePreset.order || [0, 1, 2, 3, 4, 5, 6, 7, 8];
        const next = moveChainModule(order, this.currentModuleId, parseInt(btn.dataset.dir, 10));
        if (next) presetEngine.setChainOrder(next);
      });
    });

    // Mobile parameter sliders
    this.container.querySelectorAll('.slider-control').forEach(row => {
      const slider = row.querySelector('.param-slider');
      const valEl = row.querySelector('.sl-param-val');
      const modId = parseInt(row.dataset.moduleId, 10);
      const algId = parseInt(row.dataset.algId, 10);
      const min = parseFloat(row.dataset.min);
      const max = parseFloat(row.dataset.max);
      const start = () => { this.sliderActive = true; };
      const end = () => {
        if (!this.sliderActive) return;
        this.sliderActive = false;
        this.render();
      };
      slider.addEventListener('pointerdown', start);
      slider.addEventListener('touchstart', start, { passive: true });
      slider.addEventListener('pointerup', end);
      slider.addEventListener('touchend', end);
      slider.addEventListener('change', end);
      slider.addEventListener('input', () => {
        const v = parseInt(slider.value, 10);
        slider.style.setProperty('--fill', `${max > min ? ((v - min) / (max - min)) * 100 : 0}%`);
        if (valEl) valEl.textContent = v;
        presetEngine.setParameter(modId, algId, v);
      });
    });

    // Mobile option selects
    this.container.querySelectorAll('.param-option-select').forEach(sel => {
      sel.addEventListener('change', () => {
        presetEngine.setParameter(parseInt(sel.dataset.moduleId, 10), parseInt(sel.dataset.algId, 10), parseInt(sel.value, 10));
      });
    });

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

    // TONE3000 library for this block (entry point next to the signal block)
    const btnTone3000 = this.container.querySelector('.btn-browse-tone3000');
    if (btnTone3000) {
      btnTone3000.addEventListener('click', () => {
        const targetType = this.currentModuleId === 3 ? 'amp' : 'cab';
        if (window.app && window.app.tone3000Modal) {
          window.app.tone3000Modal.openForReplacement({ targetType });
        }
      });
    }
    // Details of the TONE3000 capture loaded in this block
    this.container.querySelector('.btn-t3k-tone-details')?.addEventListener('click', (e) => {
      const targetType = this.currentModuleId === 3 ? 'amp' : 'cab';
      window.app?.tone3000Modal?.openToneDetails(e.currentTarget.dataset.toneId, targetType);
    });

    // Rotary Knobs Mouse Drag, Wheel & DAW-Style Reset to Center (Double-Click / Alt+Click)
    this.container.querySelectorAll('.knob-control').forEach(knobCtrl => {
      const knob = knobCtrl.querySelector('.rotary-knob');
      const valDisplay = knobCtrl.querySelector('.knob-value-display');

      // DAW behavior: Alt + Click on knob resets to center immediately
      knob.addEventListener('mousedown', (e) => {
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          this.dragKnob = null;
          this.resetKnobToCenter(knobCtrl);
          return;
        }
        e.preventDefault();
        this.dragKnob = knobCtrl;
        this.startY = e.clientY;
        this.startVal = parseFloat(knobCtrl.dataset.val);
      });

      // DAW behavior: Double-click on knob resets to center (12 o'clock position)
      knob.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dragKnob = null;
        this.resetKnobToCenter(knobCtrl);
      });

      // Also reset on double-click of knob-control container (excluding value display)
      knobCtrl.addEventListener('dblclick', (e) => {
        if (e.target.closest('.knob-value-display') || e.target.closest('.knob-value-input')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this.dragKnob = null;
        this.resetKnobToCenter(knobCtrl);
      });

      knob.addEventListener('touchstart', (e) => {
        if (!e.touches || !e.touches[0]) return;
        this.dragKnob = knobCtrl;
        this.startY = e.touches[0].clientY;
        this.startVal = parseFloat(knobCtrl.dataset.val);
      }, { passive: true });

      // Touch double-tap reset to center
      let lastTap = 0;
      knob.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 350) {
          e.preventDefault();
          this.dragKnob = null;
          this.resetKnobToCenter(knobCtrl);
        }
        lastTap = now;
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

      // Alt+Click on value display resets to center
      valDisplay.addEventListener('click', (e) => {
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          this.resetKnobToCenter(knobCtrl);
        }
      });

      // Double-click on value readout to type exact value
      valDisplay.addEventListener('dblclick', (e) => {
        e.stopPropagation();
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

    // EQ Visualizer Interactive Curve Node Dragging (Module 5 EQ)
    const eqHandles = this.container.querySelectorAll('.eq-node-handle');
    eqHandles.forEach(handle => {
      const algId = parseInt(handle.dataset.algId, 10);
      const startDrag = (clientY) => {
        const currentParams = presetEngine.activePreset.parameters[5] || {};
        const startGain = currentParams[algId] !== undefined ? currentParams[algId] : 0;

        const onMove = (moveY) => {
          const deltaY = clientY - moveY;
          let nextGain = Math.round(startGain + (deltaY / 60) * 50);
          nextGain = Math.max(-50, Math.min(50, nextGain));
          presetEngine.setParameter(5, algId, nextGain);
        };

        const onMouseMove = (e) => onMove(e.clientY);
        const onTouchMove = (e) => {
          if (e.touches && e.touches[0]) onMove(e.touches[0].clientY);
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onUp);
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onUp);
          window.removeEventListener('touchcancel', onUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onUp);
        window.addEventListener('touchcancel', onUp);
      };

      handle.addEventListener('mousedown', (e) => {
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          presetEngine.setParameter(5, algId, 0);
          return;
        }
        e.preventDefault();
        startDrag(e.clientY);
      });

      // DAW behavior: Double-click EQ node resets band gain to flat center (0 dB)
      handle.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        presetEngine.setParameter(5, algId, 0);
      });

      handle.addEventListener('touchstart', (e) => {
        if (!e.touches || !e.touches[0]) return;
        startDrag(e.touches[0].clientY);
      }, { passive: true });
    });
  }

  resetKnobToCenter(knobCtrl) {
    if (!knobCtrl) return;
    const min = parseFloat(knobCtrl.dataset.min);
    const max = parseFloat(knobCtrl.dataset.max);
    
    // In any DAW (Ableton, FL Studio, Logic Pro, Cubase, Reaper, Neural DSP),
    // double-clicking a knob restores it to its center / 12 o'clock position
    let centerVal = (min + max) / 2;
    if (Number.isInteger(min) && Number.isInteger(max)) {
      centerVal = Math.round(centerVal);
    } else {
      centerVal = parseFloat(centerVal.toFixed(1));
    }

    centerVal = Math.max(min, Math.min(max, centerVal));

    // Tactile spring snap animation
    const knob = knobCtrl.querySelector('.rotary-knob');
    if (knob) {
      knob.classList.add('knob-resetting');
      setTimeout(() => knob.classList.remove('knob-resetting'), 220);
    }

    this.updateKnobValue(knobCtrl, centerVal);
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

  renderEqVisualizer(currentFxId, currentParams, effectDef) {
    let bands = [];
    if (currentFxId === 503) {
      // Bass EQ (503)
      bands = [
        { name: '50Hz', freq: 50, algId: 0 },
        { name: '120Hz', freq: 120, algId: 1 },
        { name: '400Hz', freq: 400, algId: 2 },
        { name: '800Hz', freq: 800, algId: 3 },
        { name: '4.5kHz', freq: 4500, algId: 4 }
      ];
    } else if (currentFxId === 502) {
      // GT EQ 2 (502)
      bands = [
        { name: '100Hz', freq: 100, algId: 0 },
        { name: '500Hz', freq: 500, algId: 1 },
        { name: '1kHz', freq: 1000, algId: 2 },
        { name: '3kHz', freq: 3000, algId: 3 },
        { name: '6kHz', freq: 6000, algId: 4 }
      ];
    } else {
      // GT EQ 1 (501 / Default)
      bands = [
        { name: '125Hz', freq: 125, algId: 0 },
        { name: '400Hz', freq: 400, algId: 1 },
        { name: '800Hz', freq: 800, algId: 2 },
        { name: '1.6kHz', freq: 1600, algId: 3 },
        { name: '4kHz', freq: 4000, algId: 4 }
      ];
    }

    const width = 760;
    const height = 180;
    const padX = 42;
    const padY = 22;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;
    const centerY = padY + plotH / 2;

    const minFreq = 20;
    const maxFreq = 20000;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    const freqToX = (f) => padX + ((Math.log10(f) - logMin) / (logMax - logMin)) * plotW;
    const gainToY = (g) => centerY - (g / 50) * (plotH / 2);

    // Compute curve path with 120 interpolated sample points
    const pointsCount = 120;
    const pathPoints = [];
    for (let i = 0; i <= pointsCount; i++) {
      const frac = i / pointsCount;
      const f = Math.pow(10, logMin + frac * (logMax - logMin));
      let totalGain = 0;

      bands.forEach(b => {
        const bandGain = (currentParams[b.algId] !== undefined ? currentParams[b.algId] : 0);
        const dist = Math.log10(f) - Math.log10(b.freq);
        const weight = Math.exp(- (dist * dist) / (2 * 0.17 * 0.17));
        totalGain += bandGain * weight;
      });

      const x = padX + frac * plotW;
      const y = Math.max(padY, Math.min(height - padY, centerY - (totalGain / 50) * (plotH / 2)));
      pathPoints.push({ x, y });
    }

    const dPath = pathPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const dArea = `${dPath} L ${pathPoints[pathPoints.length - 1].x.toFixed(1)} ${centerY} L ${pathPoints[0].x.toFixed(1)} ${centerY} Z`;

    const gridFreqs = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000];
    const gridDbs = [12, 6, 0, -6, -12];

    return `
      <div class="eq-visualizer-card p-3 rounded-md bg-[#0b0b0c] shadow-inner flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs px-1">
          <span class="font-mono font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 16l4-8 4 6 4-10"/></svg>
            <span>Curva EQ</span>
          </span>
          <span class="hidden lg:inline text-[11px] text-zinc-500 font-mono">Trascina i nodi per regolare il guadagno (-50..+50 dB)</span>
        </div>

        <div class="relative w-full overflow-hidden select-none">
          <svg viewBox="0 0 ${width} ${height}" class="w-full h-auto max-h-48 rounded-lg bg-zinc-900/90 border border-zinc-800/80">
            <defs>
              <linearGradient id="eqFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.3"/>
                <stop offset="50%" stop-color="#06b6d4" stop-opacity="0.05"/>
                <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.25"/>
              </linearGradient>
            </defs>

            <!-- Horizontal dB Grid Lines -->
            ${gridDbs.map(db => {
              const y = centerY - (db / 15) * (plotH / 2);
              const isZero = db === 0;
              return `
                <line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="${isZero ? '#52525b' : '#27272a'}" stroke-width="${isZero ? '1.5' : '1'}" stroke-dasharray="${isZero ? '' : '3,3'}"/>
                <text x="${padX - 8}" y="${y + 3}" text-anchor="end" class="text-[9px] fill-zinc-500 font-mono">${db > 0 ? '+' : ''}${db}dB</text>
              `;
            }).join('')}

            <!-- Vertical Freq Grid Lines -->
            ${gridFreqs.map(f => {
              const x = freqToX(f);
              const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
              return `
                <line x1="${x}" y1="${padY}" x2="${x}" y2="${height - padY}" stroke="#27272a" stroke-width="1" stroke-dasharray="3,3"/>
                <text x="${x}" y="${height - padY + 14}" text-anchor="middle" class="text-[9px] fill-zinc-500 font-mono">${label}</text>
              `;
            }).join('')}

            <!-- Area Fill -->
            <path d="${dArea}" fill="url(#eqFillGrad)"/>

            <!-- Response Curve Line -->
            <path d="${dPath}" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round"/>

            <!-- Interactive Band Nodes -->
            ${bands.map(b => {
              const gain = (currentParams[b.algId] !== undefined ? currentParams[b.algId] : 0);
              const cx = freqToX(b.freq);
              const cy = gainToY(gain);
              return `
                <g class="eq-node-handle cursor-grab active:cursor-grabbing" data-alg-id="${b.algId}" data-band-name="${b.name}" data-cx="${cx}" data-freq="${b.freq}">
                  <circle cx="${cx}" cy="${cy}" r="12" fill="transparent" class="hover:fill-cyan-500/20 transition-all"/>
                  <circle cx="${cx}" cy="${cy}" r="6" fill="#06b6d4" stroke="#ecfeff" stroke-width="2" class="filter drop-shadow"/>
                  <rect x="${cx - 24}" y="${cy < centerY ? cy - 24 : cy + 10}" width="48" height="15" rx="3" fill="#09090b" fill-opacity="0.8" stroke="#3f3f46" stroke-width="0.5"/>
                  <text x="${cx}" y="${cy < centerY ? cy - 13 : cy + 21}" text-anchor="middle" class="text-[9px] font-bold font-mono fill-cyan-300">
                    ${gain > 0 ? '+' : ''}${gain}
                  </text>
                </g>
              `;
            }).join('')}
          </svg>
        </div>
      </div>
    `;
  }
}
