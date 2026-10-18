/**
 * Interface tests in headless Chrome against the production build (vite preview).
 * Network is fully mocked (Tone3000 API, /api compiler), Web MIDI / Bluetooth are faked.
 *
 * Run: npm run test:ui   (builds first; CHROME_PATH overrides the browser location)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { ROOT } from '../support/virtual-pedal.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => existsSync(p));

// ---- Mocked network ----
const TONES = [
  { id: 9001, title: 'Marshall JCM800 Test', description: '', gear: 'amp', images: [], platform: 'nam', created_at: '2026-10-01T00:00:00Z', published_at: '2026-10-01T00:00:00Z', token: 't', users: { username: 'tester', display_name: 'Tester', avatar_url: null, is_verified: false } },
  { id: 9002, title: 'Marshall Silver Jubilee', description: '', gear: 'amp', images: [], platform: 'nam', created_at: '2026-10-01T00:00:00Z', published_at: '2026-10-01T00:00:00Z', token: 't', users: null }
];
const MODELS = {
  9001: [{ id: 1, name: 'JCM800 Lead', tone_id: 9001, size: 'standard', model_url: 'https://api.tone3000.com/storage/v1/object/public/models/a.nam' }],
  9002: [] // a tone without downloadable files
};
const network = { failSearch: false, publishedVersion: null };

function mockNetwork(page) {
  return page.on('request', (req) => {
    const url = new URL(req.url());
    // Cross-origin answers need CORS headers (and the apikey header triggers a preflight)
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    const json = (body, status = 200) => req.respond({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    if (url.hostname === 'api.tone3000.com') {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
      if (url.pathname.endsWith('/tones')) {
        if (network.failSearch) return json({ message: 'statement timeout' }, 500);
        if ((url.searchParams.get('select') || '').startsWith('id,models(count)')) {
          return json(TONES.map(t => ({ id: t.id, models: [{ count: MODELS[t.id].length }], downloads: [{ count: 5 }], comments: [{ count: 0 }] })));
        }
        const q = (url.searchParams.get('title') || '').replace(/^ilike\.\*|\*$/g, '').toLowerCase();
        return json(TONES.filter(t => !q || t.title.toLowerCase().includes(q)));
      }
      if (url.pathname.endsWith('/models')) {
        const id = Number((url.searchParams.get('tone_id') || '').replace('eq.', ''));
        return json(MODELS[id] || []);
      }
      return req.respond({ status: 404, body: '' });
    }
    if (url.pathname === '/api/health') return json({ status: 'ok', compiler_available: true, compiler_backend: 'nam2clo' });
    // A newer build published on the server (otherwise the real version.json of this build)
    if (url.pathname === '/version.json' && network.publishedVersion) return json({ version: network.publishedVersion });
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return req.abort();
    return req.continue();
  });
}

// ---- Fake Web MIDI / Web Bluetooth (flags in sessionStorage, read on every load) ----
function fakeHardware() {
  const flags = JSON.parse(sessionStorage.getItem('fakeFlags') || '{}');
  window.__calls = { midiAccess: 0, bleGetDevices: 0, gattConnect: 0 };
  const port = (name) => ({ name, onmidimessage: null, send() {}, close() {} });
  navigator.requestMIDIAccess = async () => {
    window.__calls.midiAccess++;
    return { inputs: new Map([['i', port('Smart Box')]]), outputs: new Map([['o', port('Smart Box')]]) };
  };
  const query = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = async (d) => (d?.name === 'midi' ? { state: flags.midiPermission || 'prompt' } : query(d));
  const characteristic = { startNotifications: async () => {}, addEventListener() {}, writeValueWithoutResponse: async () => {} };
  const device = {
    id: 'ble-123', name: 'Sonic Master BLE', addEventListener() {},
    gatt: {
      connected: false,
      async connect() { window.__calls.gattConnect++; this.connected = true; return { getPrimaryService: async () => ({ getCharacteristic: async () => characteristic }) }; },
      disconnect() { this.connected = false; }
    }
  };
  Object.defineProperty(navigator, 'bluetooth', {
    value: { getDevices: async () => { window.__calls.bleGetDevices++; return flags.bleKnown ? [device] : []; }, requestDevice: async () => device }
  });
}

let server, browser, page, url;
const errors = [];
const dialogs = [];

before(async () => {
  assert.ok(CHROME, 'Chrome non trovato: imposta CHROME_PATH');
  server = await preview({ root: ROOT, logLevel: 'silent', preview: { port: 4317, strictPort: false } });
  url = server.resolvedUrls.local[0];
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--ignore-certificate-errors', '--no-first-run', '--no-sandbox']
  });
  page = await browser.newPage();
  // The PWA service worker would fetch on its own, bypassing the request mocks
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  mockNetwork(page);
  await page.evaluateOnNewDocument(fakeHardware);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
});

after(async () => {
  await browser?.close();
  await new Promise(r => server?.httpServer.close(r));
});

/** Load the site with fake-hardware flags and an optional stored last connection */
async function load(flags = {}, lastConnection) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate((flags, last) => {
    sessionStorage.setItem('fakeFlags', JSON.stringify(flags));
    if (last === null) localStorage.removeItem('sonicake_last_connection');
    else if (last) localStorage.setItem('sonicake_last_connection', JSON.stringify(last));
  }, flags, lastConnection);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await sleep(800);
}

const connectionState = () => page.evaluate(() => ({
  connected: document.getElementById('connectionLed').classList.contains('connected'),
  calls: window.__calls,
  stored: localStorage.getItem('sonicake_last_connection')
}));

async function openTone3000Library() {
  await page.evaluate(async () => {
    document.getElementById('btnOpenTone3000').click();
    await new Promise(r => setTimeout(r, 300));
    [...document.querySelectorAll('#tone3000ModalOverlay button')].find(b => /Libreria Tone3000/.test(b.textContent))?.click();
  });
  await sleep(1200);
}

async function closeTone3000() {
  await page.evaluate(() => document.getElementById('tone3000ModalOverlay').classList.remove('active'));
}

for (const vp of [{ label: 'desktop', width: 1366, height: 860 }, { label: 'smartphone', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  describe(`interfaccia ${vp.label}`, () => {
    before(async () => {
      await page.setViewport({ ...vp, deviceScaleFactor: 1 });
      await load({}, null);
    });

    it('carica senza scroll orizzontale e con l’elenco preset', async () => {
      const s = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        presets: document.querySelectorAll('#presetSidebar [data-slot]').length,
        app: !!window.app
      }));
      assert.ok(s.app);
      assert.ok(s.overflow <= 0, `${s.overflow}px di scroll orizzontale`);
      assert.ok(s.presets >= 50);
    });

    it('pannelli chiusi: nascosti e senza sfocatura (su telefono la pagina diventava nera)', async () => {
      const s = await page.evaluate(async () => {
        const closed = [...document.querySelectorAll('.modal-overlay:not(.active)')].map(o => {
          const cs = getComputedStyle(o);
          return { id: o.id, visibility: cs.visibility, blur: cs.backdropFilter };
        });
        const tuner = document.getElementById('tunerModalOverlay');
        tuner.classList.add('active');
        const open = { visibility: getComputedStyle(tuner).visibility, blur: getComputedStyle(tuner).backdropFilter };
        tuner.classList.remove('active');
        await new Promise(r => setTimeout(r, 300));
        const closedAgain = getComputedStyle(tuner).visibility;
        return { closed, open, closedAgain };
      });
      assert.ok(s.closed.length >= 10, `solo ${s.closed.length} pannelli trovati`);
      for (const o of s.closed) {
        assert.equal(o.visibility, 'hidden', `${o.id} chiuso ma visibile`);
        assert.equal(o.blur, 'none', `${o.id} chiuso con backdrop-filter`);
      }
      assert.deepEqual(s.open, { visibility: 'visible', blur: 'blur(6px)' });
      assert.equal(s.closedAgain, 'hidden');
    });

    it('apre tutti i pannelli senza errori né scroll orizzontale', async () => {
      const panels = { btnOpenTuner: 'tunerModalOverlay', btnOpenDrums: 'drumModalOverlay', btnOpenTone3000: 'tone3000ModalOverlay', btnOpenShare: 'shareModalOverlay', btnOpenSlotTransfer: 'slotTransferModalOverlay', btnOpenExport: 'exportModalOverlay', btnOpenSetlist: 'setlistModalOverlay', btnOpenStage: 'stageModalOverlay', btnOpenHelp: 'helpModalOverlay' };
      for (const [button, overlay] of Object.entries(panels)) {
        const before = errors.length;
        const s = await page.evaluate(async (button, overlay) => {
          document.getElementById(button).click();
          await new Promise(r => setTimeout(r, 400));
          const ov = document.getElementById(overlay);
          const open = ov.classList.contains('active') && ov.getBoundingClientRect().width > 0;
          const overflow = document.documentElement.scrollWidth - innerWidth;
          ov.querySelectorAll('.modal-close-btn').forEach(b => b.click());
          ov.classList.remove('active');
          return { open, overflow };
        }, button, overlay);
        assert.ok(s.open, `${button} non apre il pannello`);
        assert.ok(s.overflow <= 0, `${button}: ${s.overflow}px di scroll orizzontale`);
        assert.equal(errors.length, before, `${button}: ${errors.at(-1)}`);
      }
    });

    it('cerca su Tone3000 e disattiva le catture senza file', async () => {
      await openTone3000Library();
      const s = await page.evaluate(async () => {
        const input = document.querySelector('#tone3000ModalOverlay .tone3000-input');
        input.value = 'marshall';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1500));
        const modal = window.app.tone3000Modal;
        const btn = (id) => document.querySelector(`#tone3000ModalOverlay .btn-flash-tone[data-id="${id}"]`);
        return {
          titles: modal.tones.map(t => t.title),
          withFiles: btn(9001)?.disabled,
          withoutFiles: btn(9002)?.disabled,
          emptySelect: document.querySelector('#varSelect-9002')?.textContent.trim()
        };
      });
      assert.deepEqual(s.titles, ['Marshall JCM800 Test', 'Marshall Silver Jubilee']);
      assert.equal(s.withFiles, false);
      assert.equal(s.withoutFiles, true);
      assert.match(s.emptySelect, /Nessun file scaricabile/);
    });

    it('ricerca Tone3000: la X cancella il testo e ricarica i risultati', async () => {
      const r = await page.evaluate(async () => {
        const overlay = document.getElementById('tone3000ModalOverlay');
        const input = overlay.querySelector('.tone3000-input');
        const clear = overlay.querySelector('.btn-clear-search');
        const withText = { value: input.value, visible: !clear.classList.contains('hidden'), size: clear.getBoundingClientRect().width };
        clear.click();
        await new Promise(r => setTimeout(r, 1200));
        const after = {
          value: input.value,
          hidden: clear.classList.contains('hidden'),
          focused: document.activeElement === input,
          query: window.app.tone3000Modal.searchQuery,
          tones: window.app.tone3000Modal.tones.length
        };
        input.value = 'm';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        after.shownAgain = !clear.classList.contains('hidden');
        clear.click();
        await new Promise(r => setTimeout(r, 800));
        return { withText, after };
      });
      assert.equal(r.withText.value, 'marshall');
      assert.ok(r.withText.visible && r.withText.size >= 44, `X visibile e ≥ 44px (${r.withText.size}px)`);
      assert.deepEqual(r.after, { value: '', hidden: true, focused: true, query: '', tones: 2, shownAgain: true });
    });

    it('scrittura senza pedaliera: avviso nello stile del sito, chiudibile', async () => {
      const before = dialogs.length;
      await page.evaluate(() => document.querySelector('#tone3000ModalOverlay .btn-flash-tone[data-id="9001"]').click());
      await sleep(300);
      const toast = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.sl-toast')].at(-1);
        if (!t) return null;
        const r = { text: t.textContent.trim(), type: t.dataset.type, role: t.getAttribute('role'), onTop: t.getBoundingClientRect().top >= 0 };
        t.querySelector('.sl-toast-close').click();
        r.closed = !document.body.contains(t);
        return r;
      });
      assert.equal(dialogs.length, before, 'nessun alert() del browser');
      assert.match(toast.text, /non connessa/i);
      assert.equal(toast.type, 'warning');
      assert.equal(toast.role, 'alert');
      assert.ok(toast.onTop && toast.closed);
    });

    it('rinomina di un preset: limite 10 e solo caratteri della pedaliera', async () => {
      const r = await page.evaluate(async () => {
        if (innerWidth < 1024) document.getElementById('btnTogglePresetsMobile').click();
        await new Promise(r => setTimeout(r, 300));
        document.querySelector('#presetSidebar .btn-rename-preset[data-slot="3"]').click();
        await new Promise(r => setTimeout(r, 150));
        const input = document.querySelector('.slot-name-input');
        const form = input.closest('form');
        input.value = 'Crunch ✓ Lead 2026';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const res = { title: form.querySelector('h3').textContent, value: input.value, count: form.querySelector('.slot-name-count').textContent, disabled: form.querySelector('.btn-write').disabled };
        input.value = 'Crunch 26';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        form.requestSubmit();
        await new Promise(r => setTimeout(r, 200));
        res.listed = document.querySelector('#presetSidebar [data-slot="3"]').textContent.includes('Crunch 26');
        if (innerWidth < 1024) document.getElementById('btnTogglePresetsMobile').click();
        return res;
      });
      assert.equal(r.title, 'Rinomina preset');
      assert.equal(r.value, 'Crunch  Lead 2026');
      assert.equal(r.count, '17/10');
      assert.ok(r.disabled);
      assert.ok(r.listed);
    });

    it('ricerca fallita: messaggio di errore e Riprova (nessuna libreria finta)', async () => {
      network.failSearch = true;
      const errorsBefore = errors.length;
      const failed = await page.evaluate(async () => {
        await window.app.tone3000Modal.fetchTones();
        const grid = document.querySelector('#tone3000ModalOverlay .tones-grid-container');
        return { text: grid.textContent, retry: !!grid.querySelector('.btn-retry-search'), tones: window.app.tone3000Modal.tones.length };
      });
      network.failSearch = false;
      // Chrome logs the simulated HTTP 500 itself: expected here, not a site error
      errors.splice(errorsBefore, errors.length - errorsBefore, ...errors.slice(errorsBefore).filter(e => !/status of 500/.test(e)));
      assert.match(failed.text, /Ricerca non riuscita/);
      assert.ok(failed.retry);
      assert.equal(failed.tones, 0);
      const retried = await page.evaluate(async () => {
        document.querySelector('#tone3000ModalOverlay .btn-retry-search').click();
        await new Promise(r => setTimeout(r, 1200));
        return window.app.tone3000Modal.tones.length;
      });
      assert.equal(retried, 2);
      await closeTone3000();
    });

    it('dialog del nome: nome intero, contatore, ✕, filtro caratteri, Esc', async () => {
      const r = await page.evaluate(async () => {
        const q = (s) => document.querySelector(s);
        const set = (v) => { q('.slot-name-input').value = v; q('.slot-name-input').dispatchEvent(new Event('input', { bubbles: true })); };
        const state = () => ({ value: q('.slot-name-input').value, count: q('.slot-name-count').textContent, hint: q('.slot-name-hint').textContent, disabled: q('.btn-write').disabled });
        const p = window.app.tone3000Modal.askSlotName('Marshall JCM800 2203 Lead ✓', 'Slot Clone AMP 2');
        await new Promise(r => setTimeout(r, 100));
        const full = state();
        q('form .btn-write').closest('form').requestSubmit();
        await new Promise(r => setTimeout(r, 50));
        const stillOpen = !!q('.slot-name-input');
        set('Mio JCM800 €');
        const filtered = state();
        q('.btn-clear-name').click();
        const cleared = state();
        const sizes = [q('.slot-name-input').getBoundingClientRect().height, q('.btn-clear-name').getBoundingClientRect().width];
        set('JCM800 Lead');
        q('.slot-name-input').closest('form').requestSubmit();
        const name = await p;
        const cancel = window.app.tone3000Modal.askSlotName('X', 'Slot');
        await new Promise(r => setTimeout(r, 50));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return { full, stillOpen, filtered, cleared, sizes, name, cancelled: await cancel };
      });
      assert.equal(r.full.value, 'Marshall JCM800 2203 Lead');
      assert.equal(r.full.count, '25/14');
      assert.match(r.full.hint, /Accorcia di 11 lettere/);
      assert.ok(r.full.disabled && r.stillOpen);
      assert.equal(r.filtered.value, 'Mio JCM800 ');
      assert.equal(r.cleared.value, '');
      assert.ok(r.cleared.disabled);
      assert.ok(r.sizes.every(s => s >= 44), `touch target ${r.sizes.join('/')}px`);
      assert.equal(r.name, 'JCM800 Lead');
      assert.equal(r.cancelled, null);
    });

    it('rinomina di uno slot in memoria: serve la pedaliera, poi dialog con limite 10', async () => {
      const openRename = () => page.evaluate(async () => {
        document.getElementById('btnOpenTone3000').click();
        await new Promise(r => setTimeout(r, 400));
        [...document.querySelectorAll('#tone3000ModalOverlay button')].find(b => /Sulla pedaliera/.test(b.textContent))?.click();
        await new Promise(r => setTimeout(r, 200));
        document.querySelector('#tone3000ModalOverlay .btn-slot-rename[data-type="amp"]').click();
        await new Promise(r => setTimeout(r, 200));
        const form = document.querySelector('.slot-name-input')?.closest('form');
        const res = form
          ? { dialog: true, title: form.querySelector('h3').textContent, confirm: form.querySelector('.btn-write').textContent.trim(), count: form.querySelector('.slot-name-count').textContent, note: form.textContent.includes('10 caratteri') }
          : { dialog: false, toast: [...document.querySelectorAll('.sl-toast')].at(-1)?.textContent || '' };
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        document.getElementById('tone3000ModalOverlay').classList.remove('active');
        return res;
      });
      // Not connected: a notice, no dialog
      const off = await openRename();
      assert.equal(off.dialog, false);
      assert.match(off.toast, /Collega la pedaliera/);
      // Connected (fake USB port): the dialog, limited to 10 characters
      await load({ midiPermission: 'granted' }, null);
      await page.click('#connectUsbBtn');
      await sleep(400);
      const on = await openRename();
      assert.equal(on.dialog, true);
      assert.equal(on.title, 'Rinomina');
      assert.equal(on.confirm, 'Rinomina');
      assert.match(on.count, /\/10$/);
      assert.ok(on.note);
      await page.evaluate(() => document.getElementById('disconnectBtn').click());
      await load({}, null);
    });
  });
}

describe('menu preset (desktop)', () => {
  before(async () => {
    await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 });
    await load({}, null);
  });

  it('si apre sotto la barra con il preset attivo, ricerca e schede', async () => {
    const r = await page.evaluate(async () => {
      document.getElementById('headerPresetClickArea').click();
      await new Promise(r => setTimeout(r, 150));
      const panel = document.querySelector('.sl-preset-dropdown');
      const rect = panel.getBoundingClientRect();
      const res = {
        items: panel.querySelectorAll('.sl-pd-item').length,
        current: panel.querySelector('.sl-pd-item.current .sl-pd-code').textContent,
        focused: document.activeElement === panel.querySelector('.sl-pd-search'),
        inside: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      };
      panel.querySelector('.sl-pd-tab[data-tab="factory"]').click();
      res.factoryFirst = panel.querySelector('.sl-pd-code').textContent;
      const search = panel.querySelector('.sl-pd-search');
      search.value = 'F05';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      res.search = [...panel.querySelectorAll('.sl-pd-code')].map(e => e.textContent);
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      panel.querySelector('.sl-pd-tab[data-tab="user"]').click();
      return res;
    });
    assert.deepEqual(r, { items: 50, current: 'U01', focused: true, inside: true, factoryFirst: 'F01', search: ['F05'] });
  });

  it('↓ + Invio sceglie il preset successivo una sola volta; Esc e click fuori chiudono', async () => {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(300);
    assert.equal(await page.$eval('#headerSlotBadge', e => e.textContent), 'U02');
    await page.click('#headerPresetClickArea');
    await page.keyboard.press('Escape');
    assert.equal(await page.$('.sl-preset-dropdown'), null);
    await page.click('#headerPresetClickArea');
    await page.mouse.click(1000, 600);
    assert.equal(await page.$('.sl-preset-dropdown'), null);
  });

  it('su smartphone la barra apre l’elenco laterale', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await sleep(200);
    const r = await page.evaluate(async () => {
      document.getElementById('headerPresetClickArea').click();
      await new Promise(r => setTimeout(r, 300));
      return { dropdown: !!document.querySelector('.sl-preset-dropdown'), drawer: !document.getElementById('presetSidebar').classList.contains('-translate-x-full') };
    });
    assert.deepEqual(r, { dropdown: false, drawer: true });
    await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 });
  });
});

describe('riconnessione dopo il ricaricamento', () => {
  it('USB con permesso già concesso: si ricollega da sola', async () => {
    await load({ midiPermission: 'granted' }, { type: 'usb', name: 'Smart Box' });
    assert.equal((await connectionState()).connected, true);
  });

  it('USB senza permesso: nessun tentativo e nessuna richiesta', async () => {
    await load({ midiPermission: 'prompt' }, { type: 'usb', name: 'Smart Box' });
    const s = await connectionState();
    assert.equal(s.connected, false);
    assert.equal(s.calls.midiAccess, 0);
  });

  it('"Disconnetti" dimentica la pedaliera; i ricaricamenti normali no', async () => {
    await load({ midiPermission: 'granted' }, null);
    await page.click('#connectUsbBtn');
    await sleep(500);
    assert.match((await connectionState()).stored, /"usb"/);
    await load({ midiPermission: 'granted' }, undefined);
    assert.equal((await connectionState()).connected, true, 'ricaricamento: deve restare collegata');
    await page.evaluate(() => document.getElementById('disconnectBtn').click());
    assert.equal((await connectionState()).stored, null);
    await load({ midiPermission: 'granted' }, undefined);
    assert.equal((await connectionState()).connected, false);
  });

  it('Bluetooth già autorizzato: si ricollega con un solo tentativo', async () => {
    await load({ bleKnown: true }, { type: 'ble', name: 'Sonic Master BLE', bleId: 'ble-123' });
    const s = await connectionState();
    assert.equal(s.connected, true);
    assert.equal(s.calls.gattConnect, 1);
  });

  it('Bluetooth non più autorizzato: nessun tentativo ripetuto', async () => {
    await load({ bleKnown: false }, { type: 'ble', name: 'Sonic Master BLE', bleId: 'ble-123' });
    const s = await connectionState();
    assert.equal(s.connected, false);
    assert.equal(s.calls.gattConnect, 0);
    assert.equal(s.calls.bleGetDevices, 1);
  });
});

describe('avviso di aggiornamento', () => {
  const banner = () => page.$('#slUpdateBanner');

  it('nessun avviso quando la versione pubblicata è questa', async () => {
    network.publishedVersion = null;
    await load({}, null);
    assert.equal(await banner(), null);
  });

  it('nuova versione pubblicata: compare l’avviso; "Più tardi" lo chiude', async () => {
    network.publishedVersion = 'build-newer';
    await load({}, null);
    assert.ok(await banner(), 'avviso non mostrato');
    const text = await page.$eval('#slUpdateBanner', e => e.textContent);
    assert.match(text, /aggiornamento/i);
    await page.click('#slUpdateBanner .btn-update-later');
    assert.equal(await banner(), null);
  });

  it('"Aggiorna" non ricarica durante una scrittura sulla pedaliera, poi ricarica', async () => {
    network.publishedVersion = 'build-newer-2';
    await load({}, null);
    assert.ok(await banner(), 'avviso non mostrato');
    await page.evaluate(() => { window.__beforeReload = true; window.app.presetEngine.pedalWrites = 1; });
    await page.click('#slUpdateBanner .btn-update-now');
    await sleep(500);
    const blocked = await page.evaluate(() => ({
      stillHere: window.__beforeReload === true,
      toast: [...document.querySelectorAll('.sl-toast')].at(-1)?.textContent || ''
    }));
    assert.ok(blocked.stillHere, 'ha ricaricato durante la scrittura');
    assert.match(blocked.toast, /Scrittura sulla pedaliera in corso/);
    await page.evaluate(() => { window.app.presetEngine.pedalWrites = 0; });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('#slUpdateBanner .btn-update-now')
    ]);
    assert.equal(await page.evaluate(() => window.__beforeReload), undefined, 'la pagina non è stata ricaricata');
    network.publishedVersion = null;
  });
});

describe('generale', () => {
  it('nessun errore JavaScript durante tutti i test', () => {
    assert.deepEqual(errors, []);
  });
});
