/**
 * Preset List Component
 * Manages 100 preset slots (User 1-50 & Factory 51-100),
 * favorites bookmarks, search filtering, slot swapping, inline renaming,
 * copy/paste, import/export, and save modals.
 */

import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';
import { PrstParser } from '../core/prst-parser.js';
import { pickPreset, presetPairHtml } from './PresetPickerDialog.js';
import { notify, askText } from './ui-feedback.js';
import { REVERSE_CHARACTER_MAP } from '../core/protocol.js';

export class PresetList {
  constructor(containerElement) {
    this.container = containerElement;
    this.activeTab = 'user'; // 'user', 'factory', or 'favorites'
    this.searchQuery = '';
    this.favorites = new Set(JSON.parse(localStorage.getItem('sonicake_favorites') || '[]'));

    // Subscribe to engine changes
    presetEngine.onPresetListChange(() => this.render());
    presetEngine.onSlotChange(() => this.render());
    presetEngine.onDirtyChange(() => this.render());

    this.initKeyboardNav();
    this.render();
  }

  setTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  setSearch(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.render();
  }

  toggleFavorite(slot) {
    if (this.favorites.has(slot)) {
      this.favorites.delete(slot);
    } else {
      this.favorites.add(slot);
    }
    localStorage.setItem('sonicake_favorites', JSON.stringify(Array.from(this.favorites)));
    this.render();
  }

  initKeyboardNav() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is typing in an input or modal is active
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }
      if (document.querySelector('.modal-overlay.active:not(#stageModalOverlay)')) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const current = presetEngine.currentSlot;
        const target = current < 100 ? current + 1 : 1;
        presetEngine.selectPreset(target);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const current = presetEngine.currentSlot;
        const target = current > 1 ? current - 1 : 100;
        presetEngine.selectPreset(target);
      }
    });
  }

  render() {
    const allPresets = presetEngine.presetList;
    const currentSlot = presetEngine.currentSlot;

    // Filter by tab
    let filteredByTab;
    if (this.activeTab === 'favorites') {
      filteredByTab = allPresets.filter(p => this.favorites.has(p.slot));
    } else {
      filteredByTab = allPresets.filter(p => p.type === this.activeTab);
    }

    // Filter by search query
    const displayList = filteredByTab.filter(p => {
      if (!this.searchQuery) return true;
      return p.name.toLowerCase().includes(this.searchQuery) || 
             p.code.toLowerCase().includes(this.searchQuery);
    });

    this.container.innerHTML = `
      <!-- Sidebar Header -->
      <div class="p-3 border-b border-zinc-800/80 flex flex-col gap-2.5 bg-zinc-950 shrink-0">
        <!-- Header row with title and mobile close button -->
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-orange-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
            <span>Preset</span>
          </span>
          <button id="btnClosePresetsMobile" class="lg:hidden p-1 text-zinc-400 hover:text-white rounded-md hover:bg-zinc-800 transition" title="Chiudi pannello">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- 3 Filter Tabs -->
        <div class="grid grid-cols-3 gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          <button class="preset-tab py-1 text-center text-xs font-semibold rounded-md transition ${this.activeTab === 'user' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}" data-tab="user">
            User (1-50)
          </button>
          <button class="preset-tab py-1 text-center text-xs font-semibold rounded-md transition ${this.activeTab === 'factory' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'}" data-tab="factory">
            Factory
          </button>
          <button class="preset-tab py-1 text-center text-xs font-semibold rounded-md transition flex items-center justify-center gap-1 ${this.activeTab === 'favorites' ? 'bg-zinc-800 text-amber-400 shadow-sm' : 'text-zinc-400 hover:text-amber-400'}" data-tab="favorites">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>(${this.favorites.size})</span>
          </button>
        </div>

        <!-- Search Input -->
        <div class="relative flex items-center">
          <svg class="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input type="text" class="preset-search-input w-full bg-zinc-900 border border-zinc-800 focus:border-orange-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition" placeholder="Cerca tra i preset..." value="${this.searchQuery}">
        </div>
      </div>

      <!-- Quick Action Toolbar -->
      <div class="grid grid-cols-4 gap-1 p-2 bg-zinc-950/90 border-b border-zinc-800/80 shrink-0">
        <button class="btn-tool-sm btn-import-prst py-1 text-[10px] font-mono font-semibold rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-center transition" title="Importa file .prst">Imp. .prst</button>
        <button class="btn-tool-sm btn-export-prst py-1 text-[10px] font-mono font-semibold rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-center transition" title="Esporta file .prst">Esp. .prst</button>
        <button class="btn-tool-sm btn-backup-all py-1 text-[10px] font-mono font-semibold rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-center transition" title="Backup completo 50 preset">Backup</button>
        <button class="btn-tool-sm btn-restore-all py-1 text-[10px] font-mono font-semibold rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-center transition" title="Ripristina backup JSON">Ripristina</button>
      </div>

      <!-- Presets Scrollable List -->
      <div class="preset-slots-container flex-1 overflow-y-auto p-1.5 sm:p-2 space-y-1">
        ${displayList.length === 0 ? `
          <div class="text-center py-10 px-4 text-zinc-500 text-xs">
            ${this.activeTab === 'favorites' 
              ? 'Nessun preset contrassegnato con la stella. Clicca sulla stella di qualsiasi preset per aggiungerlo ai preferiti!' 
              : 'Nessun preset trovato per la ricerca.'}
          </div>
        ` : displayList.map(item => {
          const isFav = this.favorites.has(item.slot);
          const isActive = item.slot === currentSlot;
          return `
            <div class="preset-item group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition border ${isActive ? 'bg-[#2a2a2f] border-orange-500/50 text-white shadow-sm' : 'hover:bg-zinc-900/80 border-transparent text-zinc-300'}" data-slot="${item.slot}">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <button class="btn-favorite-preset p-0.5 text-zinc-600 hover:text-amber-400 transition shrink-0" data-slot="${item.slot}" title="${isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}">
                  <svg class="w-3.5 h-3.5 ${isFav ? 'text-amber-400 fill-amber-400' : 'fill-none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
                
                <span class="font-mono text-[11px] font-bold ${isActive ? 'text-orange-400' : 'text-zinc-500'} shrink-0">${item.code}</span>
                <span class="text-xs font-medium truncate ${isActive ? 'text-zinc-100 font-bold' : 'text-zinc-300'}" title="${item.name}">
                  ${item.name}${isActive && presetEngine.isDirty ? ' *' : ''}
                </span>
              </div>
              
              <div class="preset-item-actions flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition shrink-0 ml-1">
                <button class="btn-swap-preset p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-700/60 transition" data-slot="${item.slot}" title="Scambia posizione (Swap)">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
                </button>
                <button class="btn-copy-preset p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-700/60 transition" data-slot="${item.slot}" title="Copia preset">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button class="btn-paste-preset p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-700/60 transition" data-slot="${item.slot}" title="Incolla preset">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                </button>
                <button class="btn-rename-preset p-1 text-zinc-500 hover:text-white rounded hover:bg-zinc-700/60 transition" data-slot="${item.slot}" title="Rinomina">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Hidden file inputs -->
      <input type="file" id="importPrstInput" accept=".prst" style="display:none;">
      <input type="file" id="restoreJsonInput" accept=".json" style="display:none;">
    `;

    this.attachEventListeners();
  }

  showProgressToast(title) {
    const toast = document.createElement('div');
    toast.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 z-[10000] w-[min(92vw,360px)] p-3 rounded-xl bg-zinc-900 border border-orange-500/40 shadow-2xl text-sm text-zinc-100';
    toast.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-2">
        <span class="font-bold truncate"></span>
        <span class="toast-pct text-orange-400 font-mono text-xs">0%</span>
      </div>
      <div class="h-1.5 rounded bg-zinc-800 overflow-hidden"><div class="toast-bar h-full bg-orange-500 transition-all" style="width:0%"></div></div>
      <div class="toast-step mt-2 text-xs text-zinc-400">Avvio...</div>
    `;
    toast.querySelector('.font-bold').textContent = title;
    document.body.appendChild(toast);
    return {
      setProgress: (step, pct) => {
        toast.querySelector('.toast-step').textContent = step;
        toast.querySelector('.toast-pct').textContent = `${pct}%`;
        toast.querySelector('.toast-bar').style.width = `${pct}%`;
      },
      remove: () => toast.remove()
    };
  }

  async runPrstImport(file) {
    let parsedName = file.name;
    try {
      parsedName = PrstParser.parse(await file.arrayBuffer()).name || file.name;
    } catch (err) {
      notify(err.message, 'error');
      return;
    }
    const safeName = parsedName.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const slot = await pickPreset({
      title: 'Importa preset',
      source: { label: 'File', code: '.prst', name: parsedName },
      initialSlot: presetEngine.currentSlot <= 50 ? presetEngine.currentSlot : null,
      confirmLabel: 'Importa',
      summary: (s) => `<span class="leading-snug">Il preset <strong class="text-orange-400">${presetEngine.getSlotCode(s)}</strong> verrà sostituito da <strong class="text-white">${safeName}</strong></span>`,
      note: 'Il preset sostituito non si può recuperare: esportalo prima se ti serve.'
    });
    if (!slot) return;
    const code = presetEngine.getSlotCode(slot);

    const { setProgress, remove } = this.showProgressToast(`Importazione in ${code}`);
    try {
      await presetEngine.importPrstToSlot(await file.arrayBuffer(), slot, {
        onProgress: (i, n) => setProgress(`Scrittura ${code}...`, Math.round((i / n) * 100))
      });
      setProgress('Importazione completata', 100);
      setTimeout(remove, 2000);
    } catch (err) {
      console.error('prst import failed:', err);
      remove();
      notify(`Importazione non riuscita: ${err.message}`, 'error');
    }
  }

  async runSwap(slot) {
    if (slot > 50) {
      notify('Si possono scambiare solo i preset utente (U01-U50).', 'warning');
      return;
    }
    if (!connection.isConnected) {
      notify('Collega prima la pedaliera via USB o Bluetooth.', 'warning');
      return;
    }
    const code = presetEngine.getSlotCode(slot);
    const target = await pickPreset({
      title: 'Scambia preset',
      source: { label: 'Sposta', code, name: presetEngine.presetList[slot - 1].name },
      excludeSlot: slot,
      confirmLabel: 'Scambia',
      summary: (t) => presetPairHtml(slot, t),
      note: 'Tutte le impostazioni dei due preset vengono conservate.'
    });
    if (!target) return;
    const targetCode = presetEngine.getSlotCode(target);

    const { setProgress, remove } = this.showProgressToast(`Scambio ${code} ⇄ ${targetCode}`);

    try {
      await presetEngine.swapPresets(slot, target, setProgress);
      setProgress('Scambio completato', 100);
      setTimeout(remove, 2000);
    } catch (err) {
      console.error('Preset swap failed:', err);
      remove();
      notify(`Scambio non riuscito: ${err.message}`, 'error');
    }
  }

  attachEventListeners() {
    // Mobile close drawer button
    const btnCloseMobile = this.container.querySelector('#btnClosePresetsMobile');
    if (btnCloseMobile) {
      btnCloseMobile.addEventListener('click', () => {
        const sidebar = document.getElementById('presetSidebar');
        const backdrop = document.getElementById('mobilePresetsBackdrop');
        if (sidebar && backdrop) {
          sidebar.classList.add('-translate-x-full');
          backdrop.classList.add('hidden');
        }
      });
    }

    // Tabs
    this.container.querySelectorAll('.preset-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.setTab(tab.dataset.tab);
      });
    });

    // Search Input
    const searchInput = this.container.querySelector('.preset-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Select Slot
    this.container.querySelectorAll('.preset-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.preset-item-actions') || e.target.closest('.btn-favorite-preset')) return;
        const slot = parseInt(item.dataset.slot, 10);
        presetEngine.selectPreset(slot);

        // Auto close mobile drawer on selection on small screens
        const sidebar = document.getElementById('presetSidebar');
        const backdrop = document.getElementById('mobilePresetsBackdrop');
        if (sidebar && backdrop && window.innerWidth < 1024) {
          sidebar.classList.add('-translate-x-full');
          backdrop.classList.add('hidden');
        }
      });
    });

    // Toggle Favorite
    this.container.querySelectorAll('.btn-favorite-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = parseInt(btn.dataset.slot, 10);
        this.toggleFavorite(slot);
      });
    });

    // Swap Preset
    this.container.querySelectorAll('.btn-swap-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = parseInt(btn.dataset.slot, 10);
        this.runSwap(slot);
      });
    });

    // Copy Preset
    this.container.querySelectorAll('.btn-copy-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        presetEngine.copyPreset();
      });
    });

    // Paste Preset
    this.container.querySelectorAll('.btn-paste-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        presetEngine.pastePreset();
      });
    });

    // Rename Preset
    this.container.querySelectorAll('.btn-rename-preset').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const slot = parseInt(btn.dataset.slot, 10);
        const currentName = presetEngine.presetList[slot - 1].name;
        const isActive = slot === presetEngine.currentSlot;
        const newName = await askText({
          title: 'Rinomina preset',
          subtitle: `${presetEngine.getSlotCode(slot)} · ${currentName}`,
          value: currentName,
          max: 10,
          // Only characters the pedal can store in a preset name
          filter: (s) => [...s].filter(c => REVERSE_CHARACTER_MAP[c] !== undefined).join(''),
          note: isActive
            ? 'Il nuovo nome viene scritto sulla pedaliera quando salvi il preset.'
            : 'Il nuovo nome vale in questa app: per scriverlo sulla pedaliera seleziona il preset e salvalo.'
        });
        if (newName) {
          const cleanName = newName;
          presetEngine.presetList[slot - 1].name = cleanName;
          if (slot === presetEngine.currentSlot) {
            presetEngine.activePreset.name = cleanName;
            presetEngine.markDirty();
          }
          this.render();
        }
      });
    });

    // Import .prst file into a user slot on the pedal (native import, nothing is rebuilt)
    const fileInputPrst = this.container.querySelector('#importPrstInput');
    const btnImportPrst = this.container.querySelector('.btn-import-prst');
    if (btnImportPrst && fileInputPrst) {
      btnImportPrst.addEventListener('click', () => {
        if (!connection.isConnected) {
          notify('Collega prima la pedaliera via USB o Bluetooth.', 'warning');
          return;
        }
        fileInputPrst.click();
      });
      fileInputPrst.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        fileInputPrst.value = '';
        if (file) await this.runPrstImport(file);
      });
    }

    // Export the current user preset from the pedal as .prst
    const btnExportPrst = this.container.querySelector('.btn-export-prst');
    if (btnExportPrst) {
      btnExportPrst.addEventListener('click', async () => {
        const slot = presetEngine.currentSlot;
        if (!connection.isConnected) {
          notify('Collega prima la pedaliera: il file viene letto direttamente dal preset salvato.', 'warning');
          return;
        }
        if (slot > 50) {
          notify('Si possono esportare solo i preset utente (U01-U50).', 'warning');
          return;
        }
        try {
          const { bytes, name } = await presetEngine.exportPrstFromSlot(slot);
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = `${presetEngine.getSlotCode(slot)}-${name.replace(/[\\/:*?"<>|]/g, '_')}.prst`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (err) {
          notify(`Esportazione non riuscita: ${err.message}`, 'error');
        }
      });
    }

    // Backup All (JSON)
    const btnBackup = this.container.querySelector('.btn-backup-all');
    if (btnBackup) {
      btnBackup.addEventListener('click', () => {
        const json = presetEngine.exportBackupJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SonicStudio_Backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Restore All (JSON)
    const fileInputJson = this.container.querySelector('#restoreJsonInput');
    const btnRestore = this.container.querySelector('.btn-restore-all');
    if (btnRestore && fileInputJson) {
      btnRestore.addEventListener('click', () => fileInputJson.click());
      fileInputJson.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          const text = await file.text();
          presetEngine.importBackupJson(text);
          fileInputJson.value = '';
        }
      });
    }
  }
}
