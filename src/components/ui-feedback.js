/**
 * SonicLink-style feedback used instead of the browser alert() / prompt() / confirm():
 *  - notify(message, type): toast that disappears on its own
 *  - askText(options): name / text dialog with letter counter, clear button, character filter
 *  - askConfirm(options): yes / no dialog
 */

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TOAST_STYLE = {
  info: { border: 'border-sky-500/40', dot: 'bg-sky-400', role: 'status' },
  success: { border: 'border-emerald-500/40', dot: 'bg-emerald-400', role: 'status' },
  warning: { border: 'border-amber-500/50', dot: 'bg-amber-400', role: 'alert' },
  error: { border: 'border-rose-500/50', dot: 'bg-rose-400', role: 'alert' }
};

function toastArea() {
  let area = document.getElementById('slToastArea');
  if (!area) {
    area = document.createElement('div');
    area.id = 'slToastArea';
    area.className = 'fixed z-[10000] top-[68px] inset-x-3 sm:inset-x-auto sm:right-4 sm:w-[380px] flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(area);
  }
  return area;
}

/**
 * Show a short message. type: 'info' | 'success' | 'warning' | 'error'.
 * Errors and warnings stay longer; every toast can be closed by hand.
 */
export function notify(message, type = 'info', { duration } = {}) {
  const style = TOAST_STYLE[type] || TOAST_STYLE.info;
  const toast = document.createElement('div');
  toast.className = `sl-toast pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl bg-[#18191e] border ${style.border} shadow-2xl text-sm text-zinc-100`;
  toast.setAttribute('role', style.role);
  toast.dataset.type = type;
  toast.innerHTML = `
    <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}"></span>
    <span class="sl-toast-text flex-1 leading-snug whitespace-pre-line">${escapeHtml(message)}</span>
    <button type="button" class="sl-toast-close -m-2 w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white" aria-label="Chiudi avviso">
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
  `;
  const close = () => toast.remove();
  toast.querySelector('.sl-toast-close').addEventListener('click', close);
  toastArea().appendChild(toast);
  setTimeout(close, duration ?? (type === 'error' || type === 'warning' ? 8000 : 4500));
  return toast;
}

/** Modal shell shared by the dialogs: resolves the promise with the value passed to close() */
function openDialog(innerHtml, setup) {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4';
    dialog.innerHTML = `<form class="bg-[#18191e] border border-orange-500/40 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 text-zinc-100 font-sans">${innerHtml}</form>`;
    document.body.appendChild(dialog);
    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      dialog.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    dialog.querySelector('.btn-cancel')?.addEventListener('click', () => close(null));
    setup(dialog.querySelector('form'), close);
  });
}

/**
 * Ask a text (e.g. a name). Starts with `value` in full: the user shortens it, writing is
 * enabled only within `max` characters. `filter` removes characters the target cannot store.
 * Resolves with the trimmed text or null if cancelled.
 */
export function askText({ title, subtitle = '', value = '', max = 40, confirmLabel = 'Salva', note = '', filter = (s) => s, placeholder = '' }) {
  const header = `
    <div>
      <h3 class="text-base font-black text-white">${escapeHtml(title)}</h3>
      ${subtitle ? `<p class="text-xs text-orange-400 font-medium mt-1">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${note ? `<p class="ask-text-note text-[11px] leading-relaxed text-zinc-400 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2">${escapeHtml(note)}</p>` : ''}
    <div class="space-y-1">
      <div class="relative">
        <input type="text" autocomplete="off" spellcheck="false" aria-label="${escapeHtml(title)}" placeholder="${escapeHtml(placeholder)}"
          class="slot-name-input w-full min-h-[44px] pl-3 pr-12 rounded-xl bg-zinc-950 border border-zinc-700 focus:border-orange-500 outline-none text-sm font-mono text-white" />
        <button type="button" class="btn-clear-name absolute right-0 top-0 h-full w-11 flex items-center justify-center rounded-r-xl text-zinc-400 hover:text-white" title="Cancella tutto" aria-label="Cancella tutto">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="flex justify-between gap-3 text-[11px]">
        <span class="slot-name-hint text-zinc-500"></span>
        <span class="slot-name-count font-mono font-bold text-zinc-400 shrink-0"></span>
      </div>
    </div>
    <div class="flex gap-2">
      <button type="button" class="btn-cancel flex-1 min-h-[44px] rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Annulla</button>
      <button type="submit" class="btn-write flex-1 min-h-[44px] rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold text-zinc-950">${escapeHtml(confirmLabel)}</button>
    </div>
  `;
  return openDialog(header, (form, close) => {
    const input = form.querySelector('.slot-name-input');
    const count = form.querySelector('.slot-name-count');
    const hint = form.querySelector('.slot-name-hint');
    const write = form.querySelector('.btn-write');
    const update = () => {
      const len = input.value.length;
      const over = len - max;
      count.textContent = `${len}/${max}`;
      count.classList.toggle('text-rose-400', over > 0);
      count.classList.toggle('text-zinc-400', over <= 0);
      hint.textContent = over > 0
        ? `Accorcia di ${over} ${over === 1 ? 'lettera' : 'lettere'}`
        : (input.value.trim() ? 'Lettere, numeri e simboli semplici' : 'Scrivi un nome');
      hint.classList.toggle('text-rose-400', over > 0);
      hint.classList.toggle('text-zinc-500', over <= 0);
      write.disabled = over > 0 || !input.value.trim();
    };
    input.value = filter(String(value || '')).trim();
    update();
    input.addEventListener('input', () => {
      const cleaned = filter(input.value);
      if (cleaned !== input.value) input.value = cleaned;
      update();
    });
    form.querySelector('.btn-clear-name').addEventListener('click', () => {
      input.value = '';
      update();
      input.focus();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!write.disabled) close(input.value.trim());
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

/** Yes / no question. Resolves true when confirmed. */
export function askConfirm({ title, message = '', confirmLabel = 'Conferma', danger = false }) {
  const html = `
    <div>
      <h3 class="text-base font-black text-white">${escapeHtml(title)}</h3>
      ${message ? `<p class="text-xs text-zinc-300 mt-2 leading-relaxed">${escapeHtml(message)}</p>` : ''}
    </div>
    <div class="flex gap-2">
      <button type="button" class="btn-cancel flex-1 min-h-[44px] rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-300 hover:bg-zinc-800">Annulla</button>
      <button type="submit" class="btn-confirm flex-1 min-h-[44px] rounded-xl text-sm font-bold ${danger ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-orange-500 hover:bg-orange-400 text-zinc-950'}">${escapeHtml(confirmLabel)}</button>
    </div>
  `;
  return openDialog(html, (form, close) => {
    form.addEventListener('submit', (e) => { e.preventDefault(); close(true); });
    form.querySelector('.btn-confirm').focus();
  }).then(Boolean);
}
