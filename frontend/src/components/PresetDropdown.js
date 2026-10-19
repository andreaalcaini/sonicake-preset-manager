/**
 * Preset dropdown under the header preset bar (desktop).
 * Quick preset switch with search and User / Factory tabs; on narrow screens the bar keeps
 * opening the preset drawer instead.
 */

import { presetEngine } from '../core/preset-engine.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class PresetDropdown {
  constructor(anchor) {
    this.anchor = anchor;
    this.panel = null;
    this.query = '';
    this.tab = 'user';
    this.highlight = -1;
    this.onDocPointer = (e) => {
      if (!this.panel?.contains(e.target) && !this.anchor.contains(e.target)) this.close();
    };
    this.onKey = (e) => this.handleKey(e);
    this.onResize = () => this.close();
    this.anchor.setAttribute('aria-haspopup', 'listbox');
    this.anchor.setAttribute('aria-expanded', 'false');
  }

  get isOpen() { return !!this.panel; }

  toggle() { this.isOpen ? this.close() : this.open(); }

  open() {
    if (this.isOpen) return;
    this.query = '';
    this.tab = presetEngine.currentSlot > 50 ? 'factory' : 'user';
    this.panel = document.createElement('div');
    this.panel.className = 'sl-preset-dropdown';
    this.panel.innerHTML = `
      <div class="sl-pd-head">
        <div class="relative">
          <svg class="sl-pd-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" class="sl-pd-search" placeholder="Cerca preset..." autocomplete="off" spellcheck="false" aria-label="Cerca preset">
        </div>
        <div class="sl-pd-tabs" role="tablist">
          <button type="button" class="sl-pd-tab" data-tab="user" role="tab">Utente U01-U50</button>
          <button type="button" class="sl-pd-tab" data-tab="factory" role="tab">Fabbrica F01-F50</button>
        </div>
      </div>
      <div class="sl-pd-list" role="listbox" aria-label="Preset"></div>
    `;
    document.body.appendChild(this.panel);
    this.position();

    const search = this.panel.querySelector('.sl-pd-search');
    search.addEventListener('input', () => { this.query = search.value.trim().toLowerCase(); this.renderList(); });
    this.panel.querySelectorAll('.sl-pd-tab').forEach(btn => btn.addEventListener('click', () => {
      this.tab = btn.dataset.tab;
      this.renderList();
      search.focus();
    }));
    this.panel.querySelector('.sl-pd-list').addEventListener('click', (e) => {
      const item = e.target.closest('[data-slot]');
      if (item) this.choose(parseInt(item.dataset.slot, 10));
    });

    this.renderList(true);
    this.anchor.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', this.onDocPointer, true);
    document.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    search.focus();
  }

  close() {
    if (!this.panel) return;
    this.panel.remove();
    this.panel = null;
    this.anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.onDocPointer, true);
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
  }

  position() {
    const r = this.anchor.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 340), 440, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    Object.assign(this.panel.style, { top: `${r.bottom + 6}px`, left: `${left}px`, width: `${width}px` });
  }

  /** Presets of the current tab matching the search (a search looks in both tabs) */
  visibleItems() {
    const list = presetEngine.presetList;
    if (this.query) {
      return list.filter(p => p.name.toLowerCase().includes(this.query) || p.code.toLowerCase().includes(this.query));
    }
    return list.filter(p => (this.tab === 'user' ? p.slot <= 50 : p.slot > 50));
  }

  renderList(scrollToActive = false) {
    if (!this.panel) return;
    this.panel.querySelectorAll('.sl-pd-tab').forEach(btn => {
      const active = !this.query && btn.dataset.tab === this.tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    const items = this.visibleItems();
    const current = presetEngine.currentSlot;
    this.highlight = Math.max(0, items.findIndex(p => p.slot === current));
    const listEl = this.panel.querySelector('.sl-pd-list');
    listEl.innerHTML = items.length === 0
      ? '<div class="sl-pd-empty">Nessun preset trovato.</div>'
      : items.map((p, i) => `
        <button type="button" role="option" class="sl-pd-item${p.slot === current ? ' current' : ''}${i === this.highlight ? ' hl' : ''}"
          data-slot="${p.slot}" aria-selected="${p.slot === current}">
          <span class="sl-pd-code">${p.code}</span>
          <span class="sl-pd-name">${escapeHtml(p.name)}${p.slot === current && presetEngine.isDirty ? ' *' : ''}</span>
        </button>`).join('');
    if (scrollToActive || this.query) this.scrollHighlightIntoView();
  }

  scrollHighlightIntoView() {
    this.panel?.querySelector('.sl-pd-item.hl')?.scrollIntoView({ block: 'nearest' });
  }

  handleKey(e) {
    if (!this.panel) return;
    const items = [...this.panel.querySelectorAll('.sl-pd-item')];
    // Global shortcuts listen on window: keep the keys used here from reaching them
    if (['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      this.anchor.focus?.();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      items[this.highlight]?.classList.remove('hl');
      this.highlight = (this.highlight + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[this.highlight].classList.add('hl');
      this.scrollHighlightIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = items[this.highlight] || items[0];
      if (target) this.choose(parseInt(target.dataset.slot, 10));
    }
  }

  choose(slot) {
    this.close();
    if (slot !== presetEngine.currentSlot) presetEngine.selectPreset(slot);
  }
}
