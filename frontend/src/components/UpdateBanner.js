/**
 * "New version available" bar. Reloading is refused while the pedal is being written:
 * a reload in the middle of a flash or preset import would interrupt it. After the reload the
 * pedal reconnects on its own (connection.restoreLastConnection).
 */
import { presetEngine } from '../core/preset-engine.js';
import { notify } from './ui-feedback.js';

let dismissedVersion = null;

export function showUpdateBanner(version) {
  if (version === dismissedVersion || document.getElementById('slUpdateBanner')) return;

  const bar = document.createElement('div');
  bar.id = 'slUpdateBanner';
  bar.className = 'sl-update-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = `
    <div class="flex items-start gap-3">
      <span class="mt-1.5 w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0 animate-pulse"></span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-bold text-white">È disponibile un aggiornamento</div>
        <div class="text-xs text-zinc-400 mt-0.5">Ricarica per usare la nuova versione di Pedaliera Studio. La pedaliera si ricollega da sola.</div>
      </div>
    </div>
    <div class="flex gap-2 mt-3">
      <button type="button" class="btn-update-later flex-1 min-h-[44px] rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Più tardi</button>
      <button type="button" class="btn-update-now flex-1 min-h-[44px] rounded-xl bg-orange-500 hover:bg-orange-400 text-sm font-bold text-zinc-950">Aggiorna</button>
    </div>
  `;
  document.body.appendChild(bar);

  bar.querySelector('.btn-update-later').addEventListener('click', () => {
    dismissedVersion = version; // shown again only for a newer version
    bar.remove();
  });
  bar.querySelector('.btn-update-now').addEventListener('click', async () => {
    if (presetEngine.isBusyWithPedal()) {
      notify('Scrittura sulla pedaliera in corso: aggiorna quando è terminata.', 'warning');
      return;
    }
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch (_) { /* the reload fetches the new page anyway */ }
    window.location.reload();
  });
}
