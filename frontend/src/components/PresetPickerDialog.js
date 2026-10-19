/**
 * Preset Picker Dialog (SonicLink style)
 * Bottom sheet on phones, centered card on desktop. Lists the 50 user presets with search,
 * shows a live summary of the chosen action and resolves with the picked slot (or null).
 */

import { presetEngine } from '../core/preset-engine.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param {Object} opts
 * @param {string} opts.title             Dialog title
 * @param {string} [opts.source]          Optional "from" card: { code, name, label }
 * @param {number} [opts.excludeSlot]     Slot shown but not selectable (e.g. the preset being swapped)
 * @param {number} [opts.initialSlot]     Pre-selected slot
 * @param {string} opts.confirmLabel      Main button label
 * @param {(slot:number)=>string} opts.summary  HTML summary for the chosen slot
 * @param {string} [opts.note]            Small reassurance line under the summary
 * @returns {Promise<number|null>}
 */
export function pickPreset({ title, source = null, excludeSlot = null, initialSlot = null, confirmLabel, summary, note = '' }) {
  return new Promise((resolve) => {
    let selected = initialSlot && initialSlot !== excludeSlot ? initialSlot : null;
    let query = '';
    const presets = presetEngine.presetList.slice(0, 50);

    const root = document.createElement('div');
    root.className = 'fixed inset-0 z-[10000] flex items-end lg:items-center justify-center bg-black/70 backdrop-blur-sm';
    root.innerHTML = `
      <div class="picker-panel w-full lg:max-w-md max-h-[88dvh] lg:max-h-[80vh] flex flex-col bg-[#18181b] border border-zinc-800 rounded-t-2xl lg:rounded-2xl shadow-2xl overflow-hidden" role="dialog" aria-modal="true">
        <div class="lg:hidden w-10 h-1 rounded-full bg-zinc-700 mx-auto mt-2"></div>

        <div class="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <h3 class="text-lg font-bold text-white">${esc(title)}</h3>
          <button class="picker-close sl-icon-btn !w-10 !h-10 text-zinc-400 hover:text-white" title="Chiudi">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        ${source ? `
          <div class="mx-4 mb-3 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#2a2a2f]">
            <span class="text-[11px] uppercase tracking-wider text-zinc-500 shrink-0">${esc(source.label || 'Preset')}</span>
            <span class="font-bold text-orange-400 tabular-nums shrink-0">${esc(source.code)}</span>
            <span class="text-zinc-100 truncate">${esc(source.name)}</span>
          </div>
        ` : ''}

        <div class="px-4 pb-2">
          <div class="relative">
            <svg class="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input type="text" class="picker-search w-full min-h-[44px] pl-9 pr-3 rounded-lg bg-[#0f0f11] border border-zinc-800 focus:border-orange-500 text-sm text-zinc-100 placeholder-zinc-500 outline-none" placeholder="Cerca per nome o numero..." autocomplete="off">
          </div>
        </div>

        <div class="picker-list flex-1 overflow-y-auto px-2 pb-2"></div>

        <div class="border-t border-zinc-800 bg-[#141416] px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
          <div class="picker-summary min-h-[44px] flex items-center justify-center text-sm text-zinc-400 text-center"></div>
          ${note ? `<p class="text-[11px] text-zinc-500 text-center mt-1">${esc(note)}</p>` : ''}
          <div class="grid grid-cols-2 gap-2 mt-3">
            <button class="picker-cancel min-h-[48px] rounded-lg bg-[#2a2a2f] hover:bg-[#34343a] text-zinc-200 font-bold">Annulla</button>
            <button class="picker-confirm min-h-[48px] rounded-lg bg-orange-500 hover:bg-orange-400 text-[#160a02] font-black disabled:opacity-35 disabled:cursor-default disabled:hover:bg-orange-500">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const listEl = root.querySelector('.picker-list');
    const summaryEl = root.querySelector('.picker-summary');
    const confirmBtn = root.querySelector('.picker-confirm');
    const searchEl = root.querySelector('.picker-search');

    const renderList = () => {
      const q = query.toLowerCase();
      const rows = presets.filter(p => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || String(p.slot) === q);
      listEl.innerHTML = rows.length === 0
        ? '<div class="py-10 text-center text-sm text-zinc-500">Nessun preset trovato.</div>'
        : rows.map(p => {
          const isSource = p.slot === excludeSlot;
          const isSel = p.slot === selected;
          return `
            <button class="picker-row w-full min-h-[52px] flex items-center gap-3 px-3 my-0.5 rounded-lg border text-left transition
              ${isSel ? 'bg-orange-500/10 border-orange-500/70' : 'border-transparent hover:bg-[#232327]'}
              ${isSource ? 'opacity-45 cursor-default' : ''}" data-slot="${p.slot}" ${isSource ? 'disabled' : ''}>
              <span class="w-11 shrink-0 font-bold tabular-nums ${isSel ? 'text-orange-400' : 'text-zinc-500'}">${esc(p.code)}</span>
              <span class="flex-1 min-w-0 truncate ${isSel ? 'text-white font-semibold' : 'text-zinc-200'}">${esc(p.name)}</span>
              ${isSource ? '<span class="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">Questo</span>' : ''}
              ${isSel ? '<svg class="w-5 h-5 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5L20 7"/></svg>' : ''}
              ${p.slot === presetEngine.currentSlot && !isSel ? '<span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Preset attivo"></span>' : ''}
            </button>
          `;
        }).join('');
      listEl.querySelectorAll('.picker-row:not([disabled])').forEach(row => {
        row.addEventListener('click', () => {
          selected = parseInt(row.dataset.slot, 10);
          renderList();
          renderSummary();
        });
        row.addEventListener('dblclick', () => finish(parseInt(row.dataset.slot, 10)));
      });
    };

    const renderSummary = () => {
      confirmBtn.disabled = !selected;
      summaryEl.innerHTML = selected ? summary(selected) : 'Seleziona un preset dall\'elenco';
    };

    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
      if (e.key === 'Enter' && selected) { e.preventDefault(); finish(selected); }
    };

    root.addEventListener('click', (e) => { if (e.target === root) finish(null); });
    root.querySelector('.picker-close').addEventListener('click', () => finish(null));
    root.querySelector('.picker-cancel').addEventListener('click', () => finish(null));
    confirmBtn.addEventListener('click', () => selected && finish(selected));
    searchEl.addEventListener('input', () => { query = searchEl.value.trim(); renderList(); });
    document.addEventListener('keydown', onKey, true);

    renderList();
    renderSummary();
    root.querySelector(`.picker-row[data-slot="${selected}"]`)?.scrollIntoView({ block: 'center' });
    if (window.matchMedia('(min-width: 1024px)').matches) searchEl.focus();
  });
}

/** Two preset "chips" joined by an arrow, used in summaries */
export function presetPairHtml(slotA, slotB, arrow = '⇄') {
  const chip = (slot) => {
    const p = presetEngine.presetList[slot - 1];
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#2a2a2f] max-w-[42%]">
      <span class="font-bold text-orange-400 tabular-nums">${esc(p.code)}</span>
      <span class="text-zinc-100 truncate">${esc(p.name)}</span>
    </span>`;
  };
  return `<span class="flex items-center justify-center gap-2 w-full">${chip(slotA)}<span class="text-orange-400 text-lg font-bold shrink-0">${arrow}</span>${chip(slotB)}</span>`;
}
