/**
 * Tone3000 Cloud Explorer Modal Component
 * Allows browsing, searching, and 1-click loading of Neural Amp Modeler (.nam) captures
 * directly into the Sonicake Smart Box editor.
 */

import { Tone3000Service } from '../services/tone3000.js';
import { presetEngine } from '../core/preset-engine.js';
import { connection } from '../core/connection.js';

export class Tone3000Modal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.searchQuery = '';
    this.currentGear = 'all';
    this.tones = [];
    this.isLoading = false;
    this.debounceTimer = null;

    this.render();
  }

  open() {
    this.overlay.classList.add('active');
    if (this.tones.length === 0) {
      this.fetchTones();
    }
  }

  close() {
    this.overlay.classList.remove('active');
  }

  async fetchTones() {
    this.isLoading = true;
    this.renderGrid();

    try {
      this.tones = await Tone3000Service.searchTones({
        query: this.searchQuery,
        gear: this.currentGear,
        limit: 24
      });
    } catch (err) {
      console.warn('Tone3000 search error:', err);
    } finally {
      this.isLoading = false;
      this.renderGrid();
    }
  }

  render() {
    this.overlay.innerHTML = `
      <div class="modal-dialog tone3000-modal">
        <div class="modal-header">
          <div class="tone3000-header-wrap">
            <span class="modal-title">TONE3000 CLOUD EXPLORER</span>
            <span class="tone3000-badge">NEURAL AMP MODELER</span>
          </div>
          <button class="modal-close-btn">&times;</button>
        </div>

        <div class="modal-body">
          <div class="tone3000-search-bar">
            <div class="tone3000-input-wrap">
              <svg class="tone3000-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input type="text" class="tone3000-input" placeholder="Search amps, drives, cabs (e.g. Friedman, Marshall, Dumble, Mesa)..." value="${this.searchQuery}">
            </div>

            <div class="gear-filters">
              <button class="gear-pill ${this.currentGear === 'all' ? 'active' : ''}" data-gear="all">All</button>
              <button class="gear-pill ${this.currentGear === 'amp' ? 'active' : ''}" data-gear="amp">Amps</button>
              <button class="gear-pill ${this.currentGear === 'pedal' ? 'active' : ''}" data-gear="pedal">Pedals</button>
              <button class="gear-pill ${this.currentGear === 'full-rig' ? 'active' : ''}" data-gear="full-rig">Full Rig</button>
              <button class="gear-pill ${this.currentGear === 'cab' ? 'active' : ''}" data-gear="cab">Cabs / IRs</button>
            </div>
          </div>

          <div class="tones-grid-container">
            <!-- Grid rendered dynamically -->
          </div>
        </div>

        <div class="modal-footer">
          <span style="font-size: 11px; color: var(--text-muted); margin-right: auto;">
            Powered by Tone3000.com (Open-source Neural Amp Modeler captures)
          </span>
          <button class="btn-action modal-close-btn-bottom">Close</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.renderGrid();
  }

  renderGrid() {
    const gridContainer = this.overlay.querySelector('.tones-grid-container');
    if (!gridContainer) return;

    if (this.isLoading) {
      gridContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 0; color: var(--accent-cyan); font-weight: 600;">
          <div style="margin-bottom: 12px; font-size: 24px;">&#9881;</div>
          Searching Tone3000 Cloud Captures...
        </div>
      `;
      return;
    }

    if (this.tones.length === 0) {
      gridContainer.innerHTML = `
        <div style="text-align: center; padding: 60px 0; color: var(--text-muted);">
          No tone captures found matching "${this.searchQuery}". Try another search term.
        </div>
      `;
      return;
    }

    gridContainer.innerHTML = `
      <div class="tones-grid">
        ${this.tones.map(tone => `
          <div class="tone-card" data-id="${tone.id}">
            <div class="tone-thumb-wrap">
              ${tone.image 
                ? `<img src="${tone.image}" alt="${tone.title}" class="tone-thumb-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` 
                : ''}
              <div class="tone-thumb-placeholder" style="${tone.image ? 'display:none;' : ''}">&#127928;</div>
              <span class="tone-gear-tag">${tone.gear}</span>
            </div>

            <div class="tone-body">
              <h4 class="tone-card-title" title="${tone.title}">${tone.title}</h4>
              <p class="tone-card-desc">${tone.description}</p>
            </div>

            <div class="tone-footer">
              <button class="btn-load-tone" data-id="${tone.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                Load to Smart Box
              </button>
              <a href="${tone.url}" target="_blank" class="btn-external-tone" title="Open on Tone3000">
                &nearr;
              </a>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Attach click listeners to Load buttons
    gridContainer.querySelectorAll('.btn-load-tone').forEach(btn => {
      btn.addEventListener('click', () => {
        const toneId = btn.dataset.id;
        const tone = this.tones.find(t => t.id === toneId);
        if (tone) {
          presetEngine.applyTone3000(tone);
          btn.textContent = '✓ Loaded!';
          btn.style.background = 'var(--led-green)';
          setTimeout(() => {
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Load to Smart Box`;
            btn.style.background = '';
            this.close();
          }, 600);
        }
      });
    });
  }

  attachEventListeners() {
    // Close buttons
    this.overlay.querySelectorAll('.modal-close-btn, .modal-close-btn-bottom').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    // Close on overlay backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Search input with debounce
    const searchInput = this.overlay.querySelector('.tone3000-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(this.debounceTimer);
        this.searchQuery = e.target.value;
        this.debounceTimer = setTimeout(() => this.fetchTones(), 400);
      });
    }

    // Gear category filter pills
    this.overlay.querySelectorAll('.gear-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this.currentGear = pill.dataset.gear;
        this.overlay.querySelectorAll('.gear-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.fetchTones();
      });
    });
  }
}
