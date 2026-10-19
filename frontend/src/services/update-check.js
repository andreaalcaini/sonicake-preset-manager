/**
 * Tells an open page that a newer version of the site has been published.
 *
 * The build compiles its identifier into the app (__APP_VERSION__, see vite.config.js) and
 * writes the same value to /version.json. The page reads /version.json from the network (the
 * service worker never caches it) at start, every few minutes and when it becomes visible again;
 * a different value means the server now has a newer build.
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;

/** Fetch the published version (null when unknown or unreachable) */
export async function fetchPublishedVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch (_) {
    return null; // offline or server restarting: try again later
  }
}

/**
 * Start the checks; `onUpdate(version)` is called once per newly published version.
 * Does nothing in the Vite dev server (it has no version.json).
 */
export function startUpdateChecks(onUpdate, { interval = CHECK_EVERY_MS } = {}) {
  if (!APP_VERSION || import.meta.env?.DEV) return () => {};
  let notified = null;
  const check = async () => {
    const published = await fetchPublishedVersion();
    if (published && published !== APP_VERSION && published !== notified) {
      notified = published;
      onUpdate(published);
    }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  const timer = setInterval(check, interval);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', check);
  check();
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', check);
  };
}
