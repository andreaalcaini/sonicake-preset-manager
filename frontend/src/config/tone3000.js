/**
 * TONE3000 API integration (https://www.tone3000.com/api), free non-commercial tier:
 * OAuth 2.0 + PKCE, Select / Load Tone flows and the bounded lists (favorited, downloaded,
 * created, trending, latest). The catalog search endpoint is not part of the free tier.
 */

export const TONE3000_ORIGIN = 'https://www.tone3000.com';

// Official brand assets (TONE3000 Logos.zip), never altered. The full logo comes first (entry
// points, list headers); the T3K mark only in compact places after it (buttons, block markers).
export const T3K_LOGO = '/assets/tone3000/tone3000-logo.svg';
export const T3K_MARK = '/assets/tone3000/t3k-mark.svg';

// Publishable key (OAuth client_id) from tone3000.com/settings: public by design, safe in the
// bundle. VITE_TONE3000_CLIENT_ID overrides it at build time; the global is for the UI tests.
const BUILT_IN_CLIENT_ID = 't3k_pub_n39-GEQZmmkbVsf4087aSoNYPKEL4rPV';
export const TONE3000_CLIENT_ID =
  globalThis.__T3K_CLIENT_ID__ || import.meta.env?.VITE_TONE3000_CLIENT_ID || BUILT_IN_CLIENT_ID;

// Must be registered on the key in tone3000.com/settings (production and https://localhost:5173)
export const TONE3000_REDIRECT_PATH = '/tone3000-callback.html';
export const tone3000RedirectUri = () => `${location.origin}${TONE3000_REDIRECT_PATH}`;
