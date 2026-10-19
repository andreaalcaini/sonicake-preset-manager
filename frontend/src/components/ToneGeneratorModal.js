/**
 * Smart Tone Generator & Inspiration Randomizer Component
 * Generates beautifully balanced musical presets across popular guitar styles
 * (Blues, Ambient, 80s Rock, Djent High-Gain, Shoegaze, Funk, Slap Bass).
 */

import { presetEngine } from '../core/preset-engine.js';

export class ToneGeneratorModal {
  constructor(overlayElement) {
    this.overlay = overlayElement;
    this.render();
  }

  open() {
    this.render();
    this.overlay.classList.add('active');
  }

  close() {
    this.overlay.classList.remove('active');
  }

  render() {
    const styles = [
      {
        id: 'ambient-clean',
        icon: '🌌',
        title: 'Ambient & Dream Clean',
        desc: 'Compressore setoso, chorus avvolgente, space delay e riverbero shimer/hall per arpeggi eterei.',
        generate: () => ({
          name: 'DreamClean',
          ampMode: 'factory',
          volume: 78,
          states: { 0: true, 1: true, 2: false, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true },
          selectedEffects: { 0: 1, 1: 101, 2: 201, 3: 301, 4: 401, 5: 501, 6: 601, 7: 701, 8: 801 },
          parameters: {
            0: { 0: 30 },
            1: { 0: 60, 1: 50 },
            3: { 0: 45, 1: 50, 2: 60, 3: 50 },
            7: { 0: 40, 1: 35, 2: 50 },
            8: { 0: 65, 1: 55, 2: 60 }
          },
          order: [0, 1, 2, 3, 4, 5, 6, 7, 8]
        })
      },
      {
        id: 'vintage-blues',
        icon: '🎸',
        title: 'Texas Blues Crunch',
        desc: 'Saturazione dinamica e calda basata su leggendario ampli Tweed e overdrive trasparente con riverbero spring.',
        generate: () => ({
          name: 'TexBlues',
          ampMode: 'factory',
          volume: 82,
          states: { 0: true, 1: false, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: true },
          selectedEffects: { 0: 1, 1: 101, 2: 201, 3: 302, 4: 402, 5: 501, 6: 601, 7: 701, 8: 802 },
          parameters: {
            0: { 0: 25 },
            2: { 0: 40, 1: 65, 2: 50 },
            3: { 0: 60, 1: 55, 2: 50, 3: 55 },
            8: { 0: 35, 1: 45, 2: 50 }
          },
          order: [0, 1, 2, 3, 4, 5, 6, 7, 8]
        })
      },
      {
        id: '80s-hard-rock',
        icon: '⚡',
        title: '80s Sunset Strip Lead',
        desc: 'Tono British classico spinto da boost/overdrive, delay analogico a tempo e plate reverb per assoli cantabili.',
        generate: () => ({
          name: 'SunsetLead',
          ampMode: 'factory',
          volume: 80,
          states: { 0: true, 1: false, 2: true, 3: true, 4: true, 5: true, 6: false, 7: true, 8: true },
          selectedEffects: { 0: 1, 1: 101, 2: 201, 3: 307, 4: 407, 5: 501, 6: 601, 7: 702, 8: 801 },
          parameters: {
            0: { 0: 45 },
            2: { 0: 35, 1: 75, 2: 55 },
            3: { 0: 75, 1: 55, 2: 60, 3: 50 },
            7: { 0: 35, 1: 40, 2: 45 },
            8: { 0: 45, 1: 50, 2: 50 }
          },
          order: [0, 1, 2, 3, 4, 5, 6, 7, 8]
        })
      },
      {
        id: 'modern-metal',
        icon: '🔥',
        title: 'Modern High-Gain Djent',
        desc: 'Distorsione ultra definita con Noise Gate stretto, medio-alti a fuoco, cassa 4x12 V30 e bassi granitici.',
        generate: () => ({
          name: 'DjentMetal',
          ampMode: 'factory',
          volume: 85,
          states: { 0: true, 1: false, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false },
          selectedEffects: { 0: 1, 1: 101, 2: 201, 3: 310, 4: 410, 5: 501, 6: 601, 7: 701, 8: 801 },
          parameters: {
            0: { 0: 65 },
            2: { 0: 15, 1: 85, 2: 65 },
            3: { 0: 80, 1: 45, 2: 65, 3: 60 }
          },
          order: [0, 1, 2, 3, 4, 5, 6, 7, 8]
        })
      },
      {
        id: 'funk-clean',
        icon: '🕺',
        title: 'Funk & Groove Rhythm',
        desc: 'Attacco percussivo e brillantezza perfetta per ritmiche funk con touch wah/envelope filter e compressore Keeley.',
        generate: () => ({
          name: 'FunkyGroov',
          ampMode: 'factory',
          volume: 76,
          states: { 0: true, 1: true, 2: false, 3: true, 4: true, 5: true, 6: false, 7: false, 8: true },
          selectedEffects: { 0: 1, 1: 103, 2: 201, 3: 304, 4: 404, 5: 501, 6: 601, 7: 701, 8: 801 },
          parameters: {
            0: { 0: 30 },
            1: { 0: 55, 1: 50, 2: 60 },
            3: { 0: 40, 1: 65, 2: 50, 3: 50 },
            8: { 0: 30, 1: 40, 2: 50 }
          },
          order: [0, 1, 2, 3, 4, 5, 6, 7, 8]
        })
      },
      {
        id: 'psychedelic-fuzz',
        icon: '🍄',
        title: 'Psych Rock Fuzz & Phaser',
        desc: 'Fuzz ruvido stile vintage anni 60/70 combinato con phaser rotante e nastro a nastro per atmosfere lisergiche.',
        generate: () => ({
          name: 'PsychFuzz',
          ampMode: 'factory',
          volume: 80,
          states: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true },
          selectedEffects: { 0: 1, 1: 109, 2: 207, 3: 301, 4: 401, 5: 501, 6: 601, 7: 703, 8: 801 },
          parameters: {
            0: { 0: 40 },
            1: { 0: 50, 1: 45 },
            2: { 0: 75, 1: 60 },
            3: { 0: 50, 1: 50, 2: 55 },
            7: { 0: 45, 1: 50, 2: 50 },
            8: { 0: 50, 1: 50, 2: 50 }
          },
          order: [0, 1, 2, 3, 4, 5, 6, 7, 8]
        })
      }
    ];

    this.overlay.innerHTML = `
      <div class="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
              </svg>
            </div>
            <div>
              <h3 class="text-sm font-bold tracking-tight text-white uppercase">Generatore di Suoni Intelligente</h3>
              <p class="text-[11px] text-zinc-400">Preset ottimizzati istantanei per stile musicale</p>
            </div>
          </div>
          <button class="modal-close-btn p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 overflow-y-auto space-y-4 text-sm max-h-[75vh]">
          <div class="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl text-xs text-zinc-400 leading-relaxed">
            Seleziona uno stile: il generatore imposterà i moduli, la catena ed i parametri ottimali. Potrai poi rifinire ogni singolo controllo nell'editor.
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${styles.map(s => `
              <div class="tone-gen-card p-4 rounded-xl border border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800/40 hover:border-amber-500/50 cursor-pointer transition-all flex flex-col justify-between gap-3 group" data-style-id="${s.id}">
                <div>
                  <div class="flex items-center gap-2 mb-1.5">
                    <span class="text-lg">${s.icon}</span>
                    <h4 class="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-amber-400 transition-colors">${s.title}</h4>
                  </div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">${s.desc}</p>
                </div>

                <div class="flex justify-end pt-2 border-t border-zinc-800/60">
                  <span class="px-3 py-1.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 group-hover:bg-amber-500 group-hover:text-zinc-950 group-hover:border-amber-500 text-xs font-semibold text-zinc-300 transition-all">
                    Carica Preset
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-end">
          <button class="modal-close-btn-bottom px-4 py-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors">
            Annulla
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners(styles);
  }

  attachEventListeners(styles) {
    this.overlay.querySelectorAll('.modal-close-btn, .modal-close-btn-bottom').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.overlay.querySelectorAll('.tone-gen-card').forEach(card => {
      card.addEventListener('click', () => {
        const styleId = card.dataset.styleId;
        const style = styles.find(s => s.id === styleId);
        if (style) {
          const generated = style.generate();
          presetEngine.applySnapshot(generated);
          presetEngine.markDirty();
          this.close();
        }
      });
    });
  }
}
