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

// ---- Mocked network: the official TONE3000 API (OAuth + endpoints of the free tier) ----
const T3K = 'https://www.tone3000.com';
const tone = (id, title, extra = {}) => ({
  id, title, description: `${title} description`, gear: 'amp', format: 'nam', images: [], published_at: '2026-10-01T00:00:00Z',
  a1_models_count: 1, a2_models_count: 0, custom_models_count: 0, irs_count: 0, models_count: 1, downloads_count: 1234, favorites_count: 5, license: 't3k',
  user: { id: 'u1', username: 'tester', display_name: null, avatar_url: null, is_verified: false, url: `${T3K}/tester` },
  url: `${T3K}/tones/t-${id}`, ...extra
});
const TONES = {
  9001: tone(9001, 'Marshall JCM800 Test'),
  9002: tone(9002, 'Marshall Silver Jubilee'),
  9003: tone(9003, 'Only A2 Capture', { a1_models_count: 0, a2_models_count: 1 }), // the pedal cannot load A2
  9004: tone(9004, 'Greenback 4x12', { gear: 'cab', format: 'ir', a1_models_count: 0, irs_count: 1 })
};
const MODELS = {
  9001: [{ id: 1, name: 'JCM800 Lead', tone_id: 9001, size: 'standard', model_url: `${T3K}/api/v1/models/1/file`, architecture_version: '1' }],
  9002: [], // a tone without downloadable files
  9004: [{ id: 4, name: 'GB 57', tone_id: 9004, size: 'standard', model_url: `${T3K}/api/v1/models/4/file`, architecture_version: null }]
};
const network = { failList: false, publishedVersion: null, legacyCalls: 0, tokenRequests: [], fileAuth: [] };

function mockNetwork(page) {
  return page.on('request', (req) => {
    const url = new URL(req.url());
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
    const json = (body, status = 200) => req.respond({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    // The old unofficial access (TONE3000's internal database) must never come back
    if (url.hostname === 'api.tone3000.com') {
      network.legacyCalls++;
      return req.abort();
    }
    if (url.origin === T3K) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
      const p = url.pathname;
      if (p === '/api/v1/oauth/authorize') {
        // TONE3000 signs the user in, they pick tone 9001, back to the registered redirect_uri
        const back = new URL(url.searchParams.get('redirect_uri'));
        back.search = new URLSearchParams({ code: 'CODE1', state: url.searchParams.get('state'), tone_id: '9001' }).toString();
        return req.respond({ status: 302, headers: { Location: back.toString() }, body: '' });
      }
      if (p === '/api/v1/oauth/token') {
        network.tokenRequests.push(Object.fromEntries(new URLSearchParams(req.postData() || '')));
        return json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, token_type: 'bearer' });
      }
      const auth = req.headers().authorization;
      if (auth !== 'Bearer AT') return json({ error: 'unauthorized' }, 401);
      if (p === '/api/v1/user') return json({ id: 'u1', username: 'andrea', display_name: null, avatar_url: null, is_verified: false });
      if (/^\/api\/v1\/tones\/(trending|latest|favorited|downloaded|created)$/.test(p)) {
        if (network.failList) return json({ error: 'server error' }, 500);
        const q = (url.searchParams.get('query') || '').toLowerCase();
        let list = Object.values(TONES).filter(t => !q || t.title.toLowerCase().includes(q));
        if (url.searchParams.get('gear') === 'cab') list = list.filter(t => t.gear === 'cab');
        return json({ data: list, page: 1, page_size: 24, total: list.length, total_pages: 1 });
      }
      const toneMatch = p.match(/^\/api\/v1\/tones\/(\d+)$/);
      if (toneMatch) return TONES[toneMatch[1]] ? json(TONES[toneMatch[1]]) : json({ error: 'not found' }, 404);
      if (p === '/api/v1/models') return json({ data: MODELS[url.searchParams.get('tone_id')] || [], page: 1, total_pages: 1 });
      if (/^\/api\/v1\/models\/\d+\/file$/.test(p)) {
        network.fileAuth.push(auth);
        return req.respond({ status: 200, headers: cors, contentType: 'application/octet-stream', body: '{"version":"0.5.0"}' });
      }
      return json({ error: 'not found' }, 404);
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
  // Test publishable key (the site reads it before its own modules run)
  await page.evaluateOnNewDocument(() => { window.__T3K_CLIENT_ID__ = 't3k_pub_test'; });
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
    [...document.querySelectorAll('#tone3000ModalOverlay button')].find(b => /Libreria TONE3000/.test(b.textContent))?.click();
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

    it('TONE3000 senza accesso: presentazione, nessuna richiesta, mai il vecchio accesso', async () => {
      await page.evaluate(() => { localStorage.removeItem('sonicake_t3k_tokens'); localStorage.removeItem('sonicake_t3k_user'); });
      network.legacyCalls = 0;
      await openTone3000Library();
      const s = await page.evaluate(() => {
        const o = document.getElementById('tone3000ModalOverlay');
        const btn = o.querySelector('.btn-t3k-continue');
        return {
          splash: !!o.querySelector('.t3k-splash'),
          logo: !!o.querySelector('.t3k-splash img[alt="TONE3000"]'),
          copy: o.querySelector('.t3k-splash').textContent.includes('Neural Amp Modeler (NAM)'),
          // API terms: no claimed partnership, "Powered by TONE3000" with a link to tone3000.com
          partnership: /collabora|partner/i.test(o.querySelector('.t3k-splash').textContent),
          poweredBy: o.querySelector('.t3k-splash .t3k-powered')?.href,
          poweredText: o.querySelector('.t3k-splash .t3k-powered')?.textContent.trim(),
          button: btn?.textContent.trim(),
          buttonHeight: btn?.getBoundingClientRect().height,
          cards: o.querySelectorAll('.tone-card').length
        };
      });
      assert.ok(s.splash && s.logo && s.copy);
      assert.equal(s.partnership, false);
      assert.equal(s.poweredBy, 'https://www.tone3000.com/');
      assert.equal(s.poweredText, 'Powered by');
      assert.equal(s.button, 'Continua');
      assert.ok(s.buttonHeight >= 44, `Continua ${s.buttonHeight}px`);
      assert.equal(s.cards, 0);
      assert.equal(network.legacyCalls, 0);
    });

    it('accesso (OAuth PKCE): il tone scelto su TONE3000 si apre in cima alla libreria', async () => {
      network.tokenRequests = [];
      // Popup blocked: the same flow runs as a full-page redirect and comes back to the site
      await page.evaluate(() => { window.open = () => null; });
      await page.click('#tone3000ModalOverlay .btn-t3k-continue');
      await page.waitForFunction(() => window.app?.tone3000Modal?.selectedTone?.id === 9001
        && document.querySelector('#tone3000ModalOverlay.active .tone-card[data-id="9001"]'), { timeout: 15000 });
      await sleep(600);
      const s = await page.evaluate(() => {
        const o = document.getElementById('tone3000ModalOverlay');
        return {
          url: location.search,
          first: o.querySelector('.tone-card')?.dataset.id,
          picked: o.querySelector('.tone-card').textContent.includes('Scelto su TONE3000'),
          user: o.textContent.includes('@andrea'),
          browse: !!o.querySelector('.btn-t3k-browse'),
          tabs: [...o.querySelectorAll('.t3k-tab')].map(b => b.textContent.trim()),
          tokens: JSON.parse(localStorage.getItem('sonicake_t3k_tokens') || 'null')
        };
      });
      const tokenReq = network.tokenRequests.at(-1);
      assert.equal(tokenReq.grant_type, 'authorization_code');
      assert.equal(tokenReq.code, 'CODE1');
      assert.equal(tokenReq.client_id, 't3k_pub_test');
      assert.match(tokenReq.redirect_uri, /\/tone3000-callback\.html$/);
      assert.ok(tokenReq.code_verifier?.length >= 43, 'code_verifier PKCE');
      assert.equal(s.url, '', 'parametri tolti dall’indirizzo');
      assert.equal(s.first, '9001');
      assert.ok(s.picked && s.user && s.browse);
      assert.deepEqual(s.tabs, ['Di tendenza', 'Ultimi', 'Preferiti', 'Scaricati', 'Creati']);
      assert.equal(s.tokens.access_token, 'AT');
      assert.equal(network.legacyCalls, 0);
    });

    it('elenchi: solo catture caricabili (no NAM A2), IR per gli slot IR, file scaricato con il token', async () => {
      const r = await page.evaluate(async () => {
        const modal = window.app.tone3000Modal;
        modal.selectedTone = null;
        await modal.fetchTones();
        await new Promise(r => setTimeout(r, 500));
        const ids = () => [...document.querySelectorAll('#tone3000ModalOverlay .tone-card')].map(c => Number(c.dataset.id));
        // Files are requested only for cards on screen (TONE3000 rate limit)
        document.querySelector('#tone3000ModalOverlay .tone-card[data-id="9002"]').scrollIntoView();
        await new Promise(r => setTimeout(r, 600));
        const amp = { ids: ids(), hidden: modal.hiddenTones, license: document.querySelector('#tone3000ModalOverlay .tone-card[data-id="9001"] .t3k-license')?.textContent, emptyFiles: document.querySelector('#varSelect-9002')?.textContent.trim(), flashDisabled: document.querySelector('.btn-flash-tone[data-id="9002"]')?.disabled };
        const selector = document.querySelector('#tone3000ModalOverlay .target-slot-selector');
        selector.value = 'cab:2';
        selector.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 800));
        const cab = { ids: ids() };
        document.querySelector('.btn-load-tone[data-id="9004"]').click();
        await new Promise(r => setTimeout(r, 800));
        selector.value = 'amp:0';
        selector.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 800));
        return { amp, cab };
      });
      assert.deepEqual(r.amp.ids, [9001, 9002]);
      assert.equal(r.amp.hidden, 1, 'la cattura solo A2 è nascosta');
      assert.match(r.amp.emptyFiles, /Nessun file scaricabile/);
      assert.equal(r.amp.license, 'Licenza T3K');
      assert.equal(r.amp.flashDisabled, true);
      assert.deepEqual(r.cab.ids, [9004]);
      assert.deepEqual(network.fileAuth.slice(-1), ['Bearer AT']);
    });

    it('popup: il risultato arriva dalla pagina di ritorno (BroadcastChannel)', async () => {
      const r = await page.evaluate(async () => {
        let opened;
        window.open = (u) => { opened = new URL(u); return { closed: false }; };
        const modal = window.app.tone3000Modal;
        const flow = modal.browseTone3000();
        await new Promise(r => setTimeout(r, 200));
        const busy = document.querySelector('.btn-t3k-browse').disabled;
        new BroadcastChannel('t3k_oauth').postMessage({ type: 't3k_oauth_callback', code: 'CODE2', state: opened.searchParams.get('state'), tone_id: '9002', canceled: false });
        await flow;
        await new Promise(r => setTimeout(r, 300));
        return {
          prompt: opened.searchParams.get('prompt'),
          format: opened.searchParams.get('format'),
          pkce: opened.searchParams.get('code_challenge_method'),
          busy,
          picked: modal.selectedTone?.id,
          first: document.querySelector('#tone3000ModalOverlay .tone-card')?.dataset.id
        };
      });
      assert.equal(r.prompt, 'select_tone');
      assert.equal(r.format, 'nam');
      assert.equal(r.pkce, 'S256');
      assert.ok(r.busy, 'pulsante bloccato mentre la finestra è aperta');
      assert.equal(r.picked, 9002);
      assert.equal(r.first, '9002');
      assert.equal(network.tokenRequests.at(-1).code, 'CODE2');
    });

    it('cattura TONE3000 nel blocco della catena: immagine, marchio, dettagli; il preset condiviso porta solo il riferimento', async () => {
      const r = await page.evaluate(async () => {
        const e = window.app.presetEngine;
        e.replaceCloneProfile(0, { source: 'tone3000', toneId: 9001, toneTitle: 'Marshall JCM800 Test', variationName: 'JCM800 Lead', pageUrl: 'https://www.tone3000.com/tones/t-9001', image: '/assets/images/amp_on.svg', gear: 'amp', gearLabel: 'Amp', format: 'nam', creator: 'tester', license: 'Licenza T3K' }, false);
        await e.activateCloneSlot(0, false);
        document.getElementById('tone3000ModalOverlay').classList.remove('active');
        window.app.moduleEditor.setModule(3);
        await new Promise(r => setTimeout(r, 300));
        const tile = document.querySelector('.sl-tile[data-module-id="3"]');
        const card = document.querySelector('#moduleEditorArea .t3k-loaded-tone');
        const res = {
          mark: !!tile.querySelector('.sl-tile-t3k img[alt="TONE3000"]'),
          image: !!tile.querySelector('.sl-tile-tone'),
          card: card?.textContent.replace(/\s+/g, ' ').trim(),
          entryLogo: !!document.querySelector('#moduleEditorArea .btn-browse-tone3000 img[alt="TONE3000"]')
        };
        const bundle = e.getPresetBundle();
        res.bundle = bundle.tone3000Model;
        res.presetMeta = 'tone3000Model' in bundle.preset;
        window.app.tone3000Modal.selectedTone = null;
        card.querySelector('.btn-t3k-tone-details').click();
        await new Promise(r => setTimeout(r, 800));
        res.details = window.app.tone3000Modal.selectedTone?.id;
        res.open = document.getElementById('tone3000ModalOverlay').classList.contains('active');
        return res;
      });
      assert.ok(r.mark && r.image && r.entryLogo);
      assert.match(r.card, /Marshall JCM800 Test/);
      assert.match(r.card, /@tester/);
      assert.match(r.card, /Licenza T3K/);
      assert.equal(r.bundle.toneId, 9001);
      assert.equal(r.bundle.source, 'tone3000');
      assert.equal(r.bundle.creator, 'tester');
      assert.equal(r.bundle.license, 'Licenza T3K');
      assert.equal('modelUrl' in r.bundle, false, 'nessun link al file nel preset condiviso');
      assert.equal(r.presetMeta, false);
      assert.equal(r.details, 9001);
      assert.ok(r.open);
    });

    it('filtro dei preferiti: la X svuota e ricarica', async () => {
      const r = await page.evaluate(async () => {
        const o = document.getElementById('tone3000ModalOverlay');
        window.app.tone3000Modal.selectedTone = null;
        o.querySelector('.t3k-tab[data-tab="favorited"]').click();
        await new Promise(r => setTimeout(r, 600));
        const input = o.querySelector('.tone3000-input');
        input.value = 'jubilee';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1200));
        const filtered = [...o.querySelectorAll('.tone-card')].map(c => c.dataset.id);
        const clear = o.querySelector('.btn-clear-search');
        const size = clear.getBoundingClientRect().width;
        clear.click();
        await new Promise(r => setTimeout(r, 1000));
        return { filtered, size, value: input.value, focused: document.activeElement === input, after: window.app.tone3000Modal.tones.length };
      });
      assert.deepEqual(r.filtered, ['9002']);
      assert.ok(r.size >= 44, `X ${r.size}px`);
      assert.equal(r.value, '');
      assert.ok(r.focused);
      assert.equal(r.after, 2);
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

    it('elenco non disponibile: messaggio di errore e Riprova; Esci torna alla presentazione', async () => {
      await openTone3000Library();
      network.failList = true;
      const errorsBefore = errors.length;
      const failed = await page.evaluate(async () => {
        await window.app.tone3000Modal.fetchTones();
        const grid = document.querySelector('#tone3000ModalOverlay .tones-grid-container');
        return { text: grid.textContent, retry: !!grid.querySelector('.btn-retry-search'), tones: window.app.tone3000Modal.tones.length };
      });
      network.failList = false;
      // Chrome logs the simulated HTTP 500 itself: expected here, not a site error
      errors.splice(errorsBefore, errors.length - errorsBefore, ...errors.slice(errorsBefore).filter(e => !/status of 500/.test(e)));
      assert.match(failed.text, /Elenco non disponibile/);
      assert.ok(failed.retry);
      assert.equal(failed.tones, 0);
      const after = await page.evaluate(async () => {
        document.querySelector('#tone3000ModalOverlay .btn-retry-search').click();
        await new Promise(r => setTimeout(r, 1200));
        const retried = window.app.tone3000Modal.tones.length;
        document.querySelector('#tone3000ModalOverlay .btn-t3k-logout').click();
        await new Promise(r => setTimeout(r, 300));
        return { retried, splash: !!document.querySelector('#tone3000ModalOverlay .t3k-splash'), tokens: localStorage.getItem('sonicake_t3k_tokens') };
      });
      assert.ok(after.retried > 0);
      assert.ok(after.splash);
      assert.equal(after.tokens, null);
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
