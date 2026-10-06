/**
 * Preset List Component
 * Manages 100 preset slots (User 1-50 & Factory 51-100),
 * search filtering, inline renaming, copy/paste, import/export, and save modals.
 */

import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';

export class PresetList {
  constructor(containerElement) {
    this.container = containerElement;
    this.activeTab = 'user'; // 'user' or 'factory'
    this.searchQuery = '';

    // Subscribe to engine changes
    presetEngine.onPresetListChange(() => this.render());
    presetEngine.onSlotChange(() => this.render());
    presetEngine.onDirtyChange(() => this.render());

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

  render() {
    const allPresets = presetEngine.presetList;
    const currentSlot = presetEngine.currentSlot;

    // Filter by tab
    const filteredByTab = allPresets.filter(p => p.type === this.activeTab);

    // Filter by search query
    const displayList = filteredByTab.filter(p => {
      if (!this.searchQuery) return true;
      return p.name.toLowerCase().includes(this.searchQuery) || 
             p.code.toLowerCase().includes(this.searchQuery);
    });

    this.container.innerHTML = `
      <div class="sidebar-header">
        <div class="preset-tabs">
          <div class="preset-tab ${this.activeTab === 'user' ? 'active' : ''}" data-tab="user">
            User (1-50)
          </div>
          <div class="preset-tab ${this.activeTab === 'factory' ? 'active' : ''}" data-tab="factory">
            Factory (51-100)
          </div>
        </div>

        <div class="preset-search-box">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input type="text" class="preset-search-input" placeholder="Search presets..." value="${this.searchQuery}">
        </div>
      </div>

      <div class="sidebar-actions">
        <button class="btn-tool-sm btn-import-prst" title="Import .prst preset">Import .prst</button>
        <button class="btn-tool-sm btn-export-prst" title="Export .prst preset">Export .prst</button>
        <button class="btn-tool-sm btn-backup-all" title="Backup all 100 presets">Backup</button>
        <button class="btn-tool-sm btn-restore-all" title="Restore presets from JSON">Restore</button>
      </div>

      <div class="preset-slots-container">
        ${displayList.map(item => `
          <div class="preset-item ${item.slot === currentSlot ? 'active' : ''}" data-slot="${item.slot}">
            <span class="preset-item-code">${item.code}</span>
            <span class="preset-item-name" title="${item.name}">${item.name}${item.slot === currentSlot && presetEngine.isDirty ? ' *' : ''}</span>
            
            <div class="preset-item-actions">
              <button class="btn-icon-xs btn-copy-preset" data-slot="${item.slot}" title="Copy Preset">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button class="btn-icon-xs btn-paste-preset" data-slot="${item.slot}" title="Paste Preset">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                </svg>
              </button>
              <button class="btn-icon-xs btn-rename-preset" data-slot="${item.slot}" title="Rename Preset">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Hidden file inputs -->
      <input type="file" id="importPrstInput" accept=".prst" style="display:none;">
      <input type="file" id="restoreJsonInput" accept=".json" style="display:none;">
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
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
        if (e.target.closest('.preset-item-actions')) return;
        const slot = parseInt(item.dataset.slot, 10);
        presetEngine.selectPreset(slot);
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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = parseInt(btn.dataset.slot, 10);
        const currentName = presetEngine.presetList[slot - 1].name;
        const newName = prompt(`Rename slot ${presetEngine.getSlotCode(slot)} (max 10 chars):`, currentName);
        if (newName !== null && newName.trim().length > 0) {
          const cleanName = newName.trim().slice(0, 10);
          presetEngine.presetList[slot - 1].name = cleanName;
          if (slot === presetEngine.currentSlot) {
            presetEngine.activePreset.name = cleanName;
            presetEngine.markDirty();
          }
          this.render();
        }
      });
    });

    // Import .prst file
    const fileInputPrst = this.container.querySelector('#importPrstInput');
    const btnImportPrst = this.container.querySelector('.btn-import-prst');
    if (btnImportPrst && fileInputPrst) {
      btnImportPrst.addEventListener('click', () => fileInputPrst.click());
      fileInputPrst.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          const buffer = await file.arrayBuffer();
          presetEngine.importPresetPrst(buffer);
          fileInputPrst.value = '';
        }
      });
    }

    // Export .prst file
    const btnExportPrst = this.container.querySelector('.btn-export-prst');
    if (btnExportPrst) {
      btnExportPrst.addEventListener('click', () => {
        const bytes = presetEngine.exportPresetPrst();
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${presetEngine.getSlotCode(presetEngine.currentSlot)}_${presetEngine.activePreset.name}.prst`;
        a.click();
        URL.revokeObjectURL(url);
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
        a.download = `Sonicake_SmartBox_Backup_${new Date().toISOString().slice(0,10)}.json`;
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
