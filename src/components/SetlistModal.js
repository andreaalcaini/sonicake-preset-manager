/**
 * Setlist / Scaletta Live Manager Component
 * Enables organizing songs, tempos, keys, and notes with linked hardware preset slots (U01-U50).
 * Features 1-click preset switching, reordering, and integration with Stage Mode.
 */

import { presetEngine } from '../core/preset-engine.js';

const STORAGE_KEY = 'sonicake_setlists';

export class SetlistModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.setlists = this.loadSetlists();
    this.activeSetlistId = this.setlists[0]?.id || 'default';
    this.activeSongIndex = 0;
    this.editingSongId = null;

    this.render();
  }

  loadSetlists() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Could not load setlists from storage', e);
    }

    // Default template setlist for immediate use
    return [
      {
        id: 'default',
        name: 'Scaletta Live Principale',
        songs: [
          { id: 's1', title: 'Sultans of Swing', artist: 'Dire Straits', bpm: 148, key: 'Dm', slot: 4, notes: 'Stratocaster ponte + centro (pos 2)' },
          { id: 's2', title: "Sweet Child O' Mine", artist: "Guns N' Roses", bpm: 125, key: 'Eb', slot: 12, notes: 'Les Paul pickup al manico, wah su intro' },
          { id: 's3', title: 'Comfortably Numb', artist: 'Pink Floyd', bpm: 65, key: 'Bm', slot: 8, notes: 'Assolo 2: Big Muff + Delay 480ms' },
          { id: 's4', title: 'Little Wing', artist: 'Jimi Hendrix', bpm: 71, key: 'G', slot: 1, notes: 'Amp Clean dinamico, suona leggero' },
          { id: 's5', title: 'Enter Sandman', artist: 'Metallica', bpm: 123, key: 'Em', slot: 20, notes: 'Mesa High Gain, palm mute serrato' }
        ]
      }
    ];
  }

  saveSetlists() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.setlists));
    } catch (e) {
      console.error('Error saving setlists', e);
    }
  }

  getActiveSetlist() {
    return this.setlists.find(s => s.id === this.activeSetlistId) || this.setlists[0];
  }

  getCurrentSong() {
    const list = this.getActiveSetlist();
    if (!list || !list.songs || list.songs.length === 0) return null;
    return list.songs[this.activeSongIndex] || list.songs[0];
  }

  selectSong(index) {
    const list = this.getActiveSetlist();
    if (!list || !list.songs || index < 0 || index >= list.songs.length) return;
    this.activeSongIndex = index;
    const song = list.songs[index];
    if (song && song.slot) {
      presetEngine.selectPreset(song.slot);
    }
    this.render();
  }

  nextSong() {
    const list = this.getActiveSetlist();
    if (!list || !list.songs.length) return;
    const nextIdx = (this.activeSongIndex + 1) % list.songs.length;
    this.selectSong(nextIdx);
  }

  prevSong() {
    const list = this.getActiveSetlist();
    if (!list || !list.songs.length) return;
    const prevIdx = (this.activeSongIndex - 1 + list.songs.length) % list.songs.length;
    this.selectSong(prevIdx);
  }

  open() {
    this.render();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
  }

  render() {
    const activeSetlist = this.getActiveSetlist();
    const songs = activeSetlist.songs || [];
    const currentSong = songs[this.activeSongIndex];

    this.overlay.innerHTML = `
      <div class="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between gap-3 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-bold tracking-tight text-white uppercase font-mono">Scaletta Live — Setlist Manager</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  ${songs.length} Brani
                </span>
              </div>
              <p class="text-[11px] text-zinc-400">Associa i tuoi preset U01-U50 ai brani per le prove e i concerti</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Setlist Selector Dropdown -->
            <select id="setlistSelect" class="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-mono">
              ${this.setlists.map(s => `
                <option value="${s.id}" ${s.id === this.activeSetlistId ? 'selected' : ''}>${s.name}</option>
              `).join('')}
            </select>
            
            <button id="btnNewSetlist" title="Crea nuova scaletta" class="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>

            <button class="modal-close-btn p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ml-2">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <!-- Live Quick Navigator Banner -->
        ${currentSong ? `
          <div class="px-5 py-3 bg-indigo-950/30 border-b border-indigo-900/40 flex items-center justify-between gap-3 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <span class="text-xs font-mono font-bold uppercase text-indigo-400 bg-indigo-950/80 px-2.5 py-1 rounded-md border border-indigo-800/60">
                In Esecuzione
              </span>
              <div class="truncate">
                <span class="text-sm font-bold text-white">${currentSong.title}</span>
                ${currentSong.artist ? `<span class="text-xs text-zinc-400 ml-1.5">— ${currentSong.artist}</span>` : ''}
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span class="px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ${presetEngine.getSlotCode(currentSong.slot)}
              </span>
              <button id="btnPrevSongHeader" class="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition" title="Brano Precedente">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button id="btnNextSongHeader" class="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition" title="Brano Successivo">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Body Songs Table -->
        <div class="p-5 overflow-y-auto flex-1 space-y-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">Elenco Brani della Scaletta</span>
            <div class="flex items-center gap-2">
              <button id="btnExportSetlist" class="px-2.5 py-1 text-xs font-mono rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                <span>Esporta JSON</span>
              </button>
              <button id="btnAddSong" class="px-3 py-1 text-xs font-bold font-mono rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-sm">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                <span>Aggiungi Brano</span>
              </button>
            </div>
          </div>

          <!-- Song Form Modal overlay when editing -->
          <div id="songFormContainer" class="hidden p-4 rounded-xl bg-zinc-950 border border-indigo-500/40 space-y-3">
            <div class="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h4 id="songFormTitle" class="text-xs font-bold uppercase tracking-wider text-indigo-400 font-mono">Nuovo Brano</h4>
              <button id="btnCloseSongForm" class="text-zinc-500 hover:text-zinc-300 text-sm">&times;</button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div class="sm:col-span-2">
                <label class="block text-[11px] text-zinc-400 mb-1">Titolo Brano *</label>
                <input type="text" id="inputSongTitle" placeholder="es. Sultans of Swing" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-indigo-500 font-semibold">
              </div>
              <div>
                <label class="block text-[11px] text-zinc-400 mb-1">Artista / Band</label>
                <input type="text" id="inputSongArtist" placeholder="es. Dire Straits" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-indigo-500">
              </div>
              <div>
                <label class="block text-[11px] text-zinc-400 mb-1">Preset Pedaliera *</label>
                <select id="inputSongSlot" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono">
                  ${Array.from({ length: 50 }, (_, i) => i + 1).map(slot => {
                    const code = presetEngine.getSlotCode(slot);
                    const preset = presetEngine.presetList.find(p => p.slot === slot);
                    const name = preset ? preset.name : `Preset ${code}`;
                    return `<option value="${slot}">${code} — ${name}</option>`;
                  }).join('')}
                </select>
              </div>
              <div>
                <label class="block text-[11px] text-zinc-400 mb-1">BPM Tempo</label>
                <input type="number" id="inputSongBpm" placeholder="120" min="40" max="250" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono">
              </div>
              <div>
                <label class="block text-[11px] text-zinc-400 mb-1">Tonalità (Key)</label>
                <input type="text" id="inputSongKey" placeholder="es. Dm, Eb, Drop D" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-indigo-500 font-mono">
              </div>
              <div class="sm:col-span-2">
                <label class="block text-[11px] text-zinc-400 mb-1">Note Live / Suggerimenti Chitarra</label>
                <input type="text" id="inputSongNotes" placeholder="es. Pickup manico, boost su assolo" class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 focus:outline-none focus:border-indigo-500">
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button id="btnCancelSongForm" class="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition">Annulla</button>
              <button id="btnSaveSongForm" class="px-4 py-1.5 rounded-lg text-xs font-bold font-mono bg-indigo-600 hover:bg-indigo-500 text-white transition">Salva Brano</button>
            </div>
          </div>

          <!-- Songs Cards List -->
          <div class="space-y-2">
            ${songs.length === 0 ? `
              <div class="text-center py-12 text-zinc-500 text-xs border border-dashed border-zinc-800 rounded-xl">
                Nessun brano in questa scaletta. Clicca su "+ Aggiungi Brano" per iniziare.
              </div>
            ` : songs.map((song, idx) => {
              const isActive = idx === this.activeSongIndex;
              const slotCode = presetEngine.getSlotCode(song.slot);
              return `
                <div class="group flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isActive 
                    ? 'bg-indigo-950/40 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/20' 
                    : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700'
                }" data-index="${idx}">
                  <!-- Left: Index + Play button + Info -->
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="w-6 text-center font-mono text-xs font-bold ${isActive ? 'text-indigo-400' : 'text-zinc-500'}">
                      ${idx + 1}
                    </span>

                    <button class="btn-activate-song p-1.5 rounded-lg transition ${
                      isActive 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }" data-index="${idx}" title="Attiva brano e carica preset sulla pedaliera">
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    </button>

                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-white truncate">${song.title}</span>
                        ${song.artist ? `<span class="text-xs text-zinc-400 truncate">(${song.artist})</span>` : ''}
                      </div>
                      ${song.notes ? `<p class="text-[11px] text-zinc-400 truncate max-w-md">${song.notes}</p>` : ''}
                    </div>
                  </div>

                  <!-- Right: Badges & Controls -->
                  <div class="flex items-center gap-2 sm:gap-3 shrink-0">
                    ${song.key ? `
                      <span class="px-2 py-0.5 rounded font-mono text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-300">
                        ${song.key}
                      </span>
                    ` : ''}

                    ${song.bpm ? `
                      <span class="px-2 py-0.5 rounded font-mono text-[11px] bg-zinc-900 border border-zinc-800 text-zinc-300">
                        ${song.bpm} BPM
                      </span>
                    ` : ''}

                    <!-- Preset Slot Badge -->
                    <span class="px-2.5 py-1 rounded font-mono font-bold text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      ${slotCode}
                    </span>

                    <!-- Reorder & Action buttons -->
                    <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button class="btn-move-song-up p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" data-index="${idx}" title="Sposta su" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
                      </button>
                      <button class="btn-move-song-down p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" data-index="${idx}" title="Sposta giù" ${idx === songs.length - 1 ? 'disabled style="opacity:0.3"' : ''}>
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
                      </button>
                      <button class="btn-edit-song p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200" data-index="${idx}" title="Modifica">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      </button>
                      <button class="btn-delete-song p-1 rounded hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400" data-index="${idx}" title="Elimina">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 border-t border-zinc-800 bg-zinc-950/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <div class="flex items-center gap-2">
            <span>Usa <kbd class="px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-[10px] text-zinc-300">Alt+S</kbd> per aprire la scaletta al volo</span>
          </div>
          <button class="modal-close-btn px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition">
            Chiudi
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    this.overlay.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Setlist selector
    const setlistSelect = this.overlay.querySelector('#setlistSelect');
    if (setlistSelect) {
      setlistSelect.addEventListener('change', (e) => {
        this.activeSetlistId = e.target.value;
        this.activeSongIndex = 0;
        this.render();
      });
    }

    // New setlist button
    const btnNewSetlist = this.overlay.querySelector('#btnNewSetlist');
    if (btnNewSetlist) {
      btnNewSetlist.addEventListener('click', () => {
        const name = prompt('Inserisci il nome della nuova scaletta:', 'Nuova Scaletta');
        if (name && name.trim()) {
          const newSetlist = {
            id: 'setlist_' + Date.now(),
            name: name.trim(),
            songs: []
          };
          this.setlists.push(newSetlist);
          this.activeSetlistId = newSetlist.id;
          this.activeSongIndex = 0;
          this.saveSetlists();
          this.render();
        }
      });
    }

    // Header nav buttons
    this.overlay.querySelector('#btnPrevSongHeader')?.addEventListener('click', () => this.prevSong());
    this.overlay.querySelector('#btnNextSongHeader')?.addEventListener('click', () => this.nextSong());

    // Export Setlist JSON
    this.overlay.querySelector('#btnExportSetlist')?.addEventListener('click', () => {
      const active = this.getActiveSetlist();
      const blob = new Blob([JSON.stringify(active, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${active.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Add Song button
    const songFormContainer = this.overlay.querySelector('#songFormContainer');
    const btnAddSong = this.overlay.querySelector('#btnAddSong');
    if (btnAddSong && songFormContainer) {
      btnAddSong.addEventListener('click', () => {
        this.editingSongId = null;
        this.overlay.querySelector('#songFormTitle').textContent = 'Aggiungi Nuovo Brano';
        this.overlay.querySelector('#inputSongTitle').value = '';
        this.overlay.querySelector('#inputSongArtist').value = '';
        this.overlay.querySelector('#inputSongSlot').value = presetEngine.currentSlot || 1;
        this.overlay.querySelector('#inputSongBpm').value = '';
        this.overlay.querySelector('#inputSongKey').value = '';
        this.overlay.querySelector('#inputSongNotes').value = '';
        songFormContainer.classList.remove('hidden');
        this.overlay.querySelector('#inputSongTitle').focus();
      });
    }

    // Close song form
    const closeForm = () => {
      if (songFormContainer) songFormContainer.classList.add('hidden');
      this.editingSongId = null;
    };
    this.overlay.querySelector('#btnCloseSongForm')?.addEventListener('click', closeForm);
    this.overlay.querySelector('#btnCancelSongForm')?.addEventListener('click', closeForm);

    // Save song form
    this.overlay.querySelector('#btnSaveSongForm')?.addEventListener('click', () => {
      const title = this.overlay.querySelector('#inputSongTitle').value.trim();
      if (!title) {
        alert('Inserisci il titolo del brano.');
        return;
      }
      const artist = this.overlay.querySelector('#inputSongArtist').value.trim();
      const slot = parseInt(this.overlay.querySelector('#inputSongSlot').value, 10) || 1;
      const bpm = parseInt(this.overlay.querySelector('#inputSongBpm').value, 10) || null;
      const key = this.overlay.querySelector('#inputSongKey').value.trim();
      const notes = this.overlay.querySelector('#inputSongNotes').value.trim();

      const activeSetlist = this.getActiveSetlist();
      if (!activeSetlist.songs) activeSetlist.songs = [];

      if (this.editingSongId) {
        const idx = activeSetlist.songs.findIndex(s => s.id === this.editingSongId);
        if (idx !== -1) {
          activeSetlist.songs[idx] = {
            ...activeSetlist.songs[idx],
            title, artist, slot, bpm, key, notes
          };
        }
      } else {
        const newSong = {
          id: 's_' + Date.now(),
          title, artist, slot, bpm, key, notes
        };
        activeSetlist.songs.push(newSong);
      }

      this.saveSetlists();
      closeForm();
      this.render();
    });

    // Song items action listeners
    this.overlay.querySelectorAll('.btn-activate-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        this.selectSong(index);
      });
    });

    this.overlay.querySelectorAll('.btn-edit-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        const activeSetlist = this.getActiveSetlist();
        const song = activeSetlist.songs[index];
        if (!song) return;

        this.editingSongId = song.id;
        this.overlay.querySelector('#songFormTitle').textContent = `Modifica: ${song.title}`;
        this.overlay.querySelector('#inputSongTitle').value = song.title || '';
        this.overlay.querySelector('#inputSongArtist').value = song.artist || '';
        this.overlay.querySelector('#inputSongSlot').value = song.slot || 1;
        this.overlay.querySelector('#inputSongBpm').value = song.bpm || '';
        this.overlay.querySelector('#inputSongKey').value = song.key || '';
        this.overlay.querySelector('#inputSongNotes').value = song.notes || '';
        songFormContainer.classList.remove('hidden');
        this.overlay.querySelector('#inputSongTitle').focus();
      });
    });

    this.overlay.querySelectorAll('.btn-delete-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        const activeSetlist = this.getActiveSetlist();
        if (confirm(`Eliminare "${activeSetlist.songs[index]?.title}" dalla scaletta?`)) {
          activeSetlist.songs.splice(index, 1);
          if (this.activeSongIndex >= activeSetlist.songs.length) {
            this.activeSongIndex = Math.max(0, activeSetlist.songs.length - 1);
          }
          this.saveSetlists();
          this.render();
        }
      });
    });

    this.overlay.querySelectorAll('.btn-move-song-up').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        if (index > 0) {
          const songs = this.getActiveSetlist().songs;
          const temp = songs[index];
          songs[index] = songs[index - 1];
          songs[index - 1] = temp;
          if (this.activeSongIndex === index) this.activeSongIndex = index - 1;
          else if (this.activeSongIndex === index - 1) this.activeSongIndex = index;
          this.saveSetlists();
          this.render();
        }
      });
    });

    this.overlay.querySelectorAll('.btn-move-song-down').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        const songs = this.getActiveSetlist().songs;
        if (index < songs.length - 1) {
          const temp = songs[index];
          songs[index] = songs[index + 1];
          songs[index + 1] = temp;
          if (this.activeSongIndex === index) this.activeSongIndex = index + 1;
          else if (this.activeSongIndex === index + 1) this.activeSongIndex = index;
          this.saveSetlists();
          this.render();
        }
      });
    });
  }
}
