/**
 * TONE3000 client: the official API (https://www.tone3000.com/api) with the user's own login.
 *
 * - OAuth 2.0 + PKCE in a popup, like TONE3000's web example: the page (and the pedal
 *   connection) stays open. The popup lands on /tone3000-callback.html, which relays the result
 *   with postMessage, or BroadcastChannel when the opener reference is lost. If the browser
 *   blocks the popup the same flow runs as a full-page redirect (completePendingRedirect).
 * - Free tier only: Select / Load Tone flows, user, tone, models and the bounded lists
 *   (favorited, downloaded, created, trending, latest). No catalog search.
 * - Tokens stay in this browser (localStorage) and are refreshed automatically.
 */
import { TONE3000_ORIGIN, TONE3000_CLIENT_ID, tone3000RedirectUri } from '../config/tone3000.js';

const TOKENS_KEY = 'sonicake_t3k_tokens';
const USER_KEY = 'sonicake_t3k_user';
const PENDING_KEY = 't3k_pending_callback';

export const GEAR_LABELS = {
  'amp': 'Amp',
  'amp-cab': 'Amp + Cab',
  'full-rig': 'Amp + Cab',
  'pedal': 'Pedale',
  'outboard': 'Outboard',
  'cab': 'Cabinet',
  'space': 'Space',
  'experimental': 'Experimental'
};

export class Tone3000Error extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'Tone3000Error';
    this.status = status;
  }
}

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} }
};

class Tone3000Client {
  constructor() {
    this.listeners = new Set();
    this.pendingFlow = null;
    this.refreshPromise = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('message', (e) => {
        if (e.origin === location.origin) this.onCallbackMessage(e.data);
      });
      try {
        this.channel = new BroadcastChannel('t3k_oauth');
        this.channel.onmessage = (e) => this.onCallbackMessage(e.data);
      } catch {}
    }
  }

  isConfigured() { return !!TONE3000_CLIENT_ID; }
  isConnected() { return !!store.get(TOKENS_KEY); }
  get user() { return store.get(USER_KEY); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }); }

  logout() {
    store.remove(TOKENS_KEY);
    store.remove(USER_KEY);
    this.emit();
  }

  // ---- OAuth flows ----

  /**
   * Run an OAuth flow in a popup. `prompt`: 'select_tone' (browse and pick), 'load_tone' (with
   * toneId) or null (sign in only). Resolves with { toneId, canceled } once signed in; rejects
   * on errors. Falls back to a full-page redirect when the popup is blocked.
   */
  async startFlow({ prompt = 'select_tone', toneId = null, format = null, gears = null } = {}) {
    if (!this.isConfigured()) throw new Tone3000Error('Integrazione TONE3000 non configurata su questo sito.');
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    sessionStorage.setItem('t3k_code_verifier', verifier);
    sessionStorage.setItem('t3k_state', state);

    const url = new URL(`${TONE3000_ORIGIN}/api/v1/oauth/authorize`);
    const params = {
      client_id: TONE3000_CLIENT_ID,
      redirect_uri: tone3000RedirectUri(),
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      menubar: 'true'
    };
    if (prompt) params.prompt = prompt;
    if (prompt === 'load_tone') params.tone_id = String(toneId);
    if (prompt === 'select_tone') params.preview = 'true';
    if (format) params.format = format;
    if (gears) params.gears = gears;
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    // The popup gets a copy of this sessionStorage: the flag tells the callback page to relay
    sessionStorage.setItem('t3k_popup_mode', '1');
    const width = 480, height = 720;
    const popup = window.open(url.toString(), 't3k_oauth',
      `width=${width},height=${height},left=${Math.round(screenX + (outerWidth - width) / 2)},top=${Math.round(screenY + (outerHeight - height) / 2)},resizable=yes,scrollbars=yes`);
    sessionStorage.removeItem('t3k_popup_mode');

    if (!popup) {
      // Popup blocked: same flow in this tab, finished by completePendingRedirect() after the reload
      sessionStorage.setItem('t3k_redirect_flow', '1');
      location.href = url.toString();
      return new Promise(() => {});
    }

    this.pendingFlow?.reject(new Tone3000Error('Accesso annullato.'));
    return new Promise((resolve, reject) => {
      const watch = setInterval(() => {
        if (!popup.closed || !this.pendingFlow || this.pendingFlow.state !== state) return;
        clearInterval(watch);
        // The callback page closes itself right after relaying: give the message time to arrive
        setTimeout(() => {
          if (this.pendingFlow?.state === state) {
            this.pendingFlow = null;
            resolve({ toneId: null, canceled: true });
          }
        }, 1500);
      }, 500);
      this.pendingFlow = {
        state,
        resolve: (r) => { clearInterval(watch); resolve(r); },
        reject: (e) => { clearInterval(watch); reject(e); }
      };
    });
  }

  async onCallbackMessage(data) {
    if (data?.type !== 't3k_oauth_callback' || !this.pendingFlow || data.state !== this.pendingFlow.state) return;
    const flow = this.pendingFlow;
    this.pendingFlow = null;
    try {
      flow.resolve(await this.completeCallback(data));
    } catch (err) {
      flow.reject(err);
    }
  }

  /** After a full-page redirect flow: finish it (returns null when there is nothing to finish) */
  async completePendingRedirect() {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem('t3k_redirect_flow');
    return this.completeCallback(JSON.parse(raw));
  }

  /** Verify state, exchange the code, load the profile. PKCE secrets are single use. */
  async completeCallback({ code, state, error, tone_id: toneId, canceled }) {
    const expected = sessionStorage.getItem('t3k_state');
    const verifier = sessionStorage.getItem('t3k_code_verifier');
    sessionStorage.removeItem('t3k_state');
    sessionStorage.removeItem('t3k_code_verifier');
    if (!expected || state !== expected) throw new Tone3000Error('Risposta di TONE3000 non valida: riprova ad accedere.');
    if (canceled && !code) return { toneId: null, canceled: true };
    if (error) throw new Tone3000Error(error === 'access_denied' ? 'Accesso a TONE3000 negato.' : `Accesso a TONE3000 non riuscito (${error}).`);
    if (!code || !verifier) throw new Tone3000Error('Accesso a TONE3000 non completato.');

    const res = await fetch(`${TONE3000_ORIGIN}/api/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: tone3000RedirectUri(),
        client_id: TONE3000_CLIENT_ID
      })
    });
    if (!res.ok) throw new Tone3000Error('Accesso a TONE3000 non riuscito: riprova.', res.status);
    this.saveTokens(await res.json());
    try {
      store.set(USER_KEY, await this.getJson('/api/v1/user'));
    } catch (err) {
      console.warn('TONE3000 profile unavailable:', err);
    }
    this.emit();
    return { toneId: toneId || null, canceled: !!canceled };
  }

  saveTokens({ access_token, refresh_token, expires_in }) {
    store.set(TOKENS_KEY, { access_token, refresh_token, expires_at: Date.now() + (Number(expires_in) || 3600) * 1000 });
  }

  // ---- Authenticated requests ----

  async accessToken(forceRefresh = false) {
    const tokens = store.get(TOKENS_KEY);
    if (!tokens) throw new Tone3000Error('Accedi a TONE3000 per continuare.', 401);
    if (!forceRefresh && Date.now() < tokens.expires_at - 60000) return tokens.access_token;
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const res = await fetch(`${TONE3000_ORIGIN}/api/v1/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: TONE3000_CLIENT_ID })
        });
        if (res.status === 400 || res.status === 401) {
          // Session over (refresh token expired or revoked): sign in again
          this.logout();
          throw new Tone3000Error('Sessione TONE3000 scaduta: accedi di nuovo.', 401);
        }
        if (!res.ok) throw new Tone3000Error('TONE3000 non risponde in questo momento: riprova.', res.status);
        this.saveTokens(await res.json());
        return store.get(TOKENS_KEY).access_token;
      })().finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }

  async request(url, init = {}) {
    const send = async (force) => fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await this.accessToken(force)}` } });
    let res;
    try {
      res = await send(false);
      if (res.status === 401) res = await send(true);
    } catch (err) {
      if (err instanceof Tone3000Error) throw err;
      throw new Tone3000Error('TONE3000 non raggiungibile: controlla la connessione e riprova.');
    }
    if (res.status === 429) throw new Tone3000Error('Troppe richieste a TONE3000: attendi un minuto e riprova.', 429);
    return res;
  }

  async getJson(path) {
    const res = await this.request(`${TONE3000_ORIGIN}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Tone3000Error(res.status === 404 ? 'Tone non trovato o non accessibile.' : 'TONE3000 non risponde in questo momento: riprova.', res.status);
    return res.json();
  }

  async getTone(id) {
    return normalizeTone(await this.getJson(`/api/v1/tones/${encodeURIComponent(id)}`));
  }

  /** Files of a tone the pedal can use: A1 / custom NAM models (the API default) or IR files */
  async listModels(toneId) {
    const { data = [] } = await this.getJson(`/api/v1/models?tone_id=${encodeURIComponent(toneId)}&page_size=100`);
    return data
      .filter(m => m.model_url && String(m.architecture_version) !== '2')
      .map(m => ({ id: m.id, name: (m.name || '').trim() || `File ${m.id}`, size: m.size || 'standard', url: m.model_url, toneId: m.tone_id }));
  }

  /** 'favorited' | 'downloaded' | 'created' (paginated, title filter) or 'trending' | 'latest' */
  async listTones(kind, { query = '', gear = '', page = 1 } = {}) {
    let path;
    if (kind === 'trending') path = `/api/v1/tones/trending${gear ? `?gear=${encodeURIComponent(gear)}` : ''}`;
    else if (kind === 'latest') path = '/api/v1/tones/latest';
    else {
      const qs = new URLSearchParams({ page: String(page), page_size: '24' });
      if (query.trim()) qs.set('query', query.trim());
      if (gear) qs.set('gear', gear);
      path = `/api/v1/tones/${kind}?${qs}`;
    }
    const body = await this.getJson(path);
    return {
      tones: (body.data || []).map(normalizeTone),
      totalPages: body.total_pages || 1
    };
  }

  /** Download a model file with the user's token (only from TONE3000 hosts) */
  async fetchModelFile(modelUrl) {
    const url = new URL(modelUrl, TONE3000_ORIGIN);
    if (url.protocol !== 'https:' || !/(^|\.)tone3000\.com$/i.test(url.hostname)) {
      throw new Tone3000Error('Indirizzo del file non valido.');
    }
    const res = await this.request(url.toString());
    if (!res.ok) throw new Tone3000Error(res.status === 403 || res.status === 404 ? 'File non accessibile con il tuo account TONE3000.' : 'Download da TONE3000 non riuscito: riprova.', res.status);
    return res.blob();
  }
}

/** API tone → card data (design requirements: image, title, gear type, format, creator) */
export function normalizeTone(t) {
  const format = t.format || t.platform || (t.gear === 'cab' ? 'ir' : 'nam');
  const user = t.user || null;
  const pedalFiles = format === 'ir'
    ? (t.irs_count ?? t.models_count ?? 0)
    : (t.a1_models_count !== undefined ? (t.a1_models_count || 0) + (t.custom_models_count || 0) : (t.models_count || 0));
  return {
    id: t.id,
    title: t.title || 'Senza titolo',
    description: t.description || '',
    gear: t.gear || (format === 'ir' ? 'cab' : 'amp'),
    gearLabel: GEAR_LABELS[t.gear] || 'Capture',
    format,
    image: Array.isArray(t.images) && t.images.length ? t.images[0] : null,
    url: t.url || `${TONE3000_ORIGIN}/tones/${t.id}`,
    publishedAt: t.published_at || t.created_at || null,
    downloads: typeof t.downloads_count === 'number' ? t.downloads_count : null,
    favorites: typeof t.favorites_count === 'number' ? t.favorites_count : null,
    filesCount: pedalFiles,
    // The pedal loads NAM (A1 / custom: A2 cannot be converted) and IR files
    supported: (format === 'nam' || format === 'ir') && pedalFiles > 0,
    author: user ? {
      name: user.display_name || user.username || 'Anonimo',
      username: user.username || '',
      avatar: user.avatar_url || null,
      verified: !!user.is_verified,
      url: user.url || null
    } : null
  };
}

export const tone3000 = new Tone3000Client();
