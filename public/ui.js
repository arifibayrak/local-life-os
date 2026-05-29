// Shared UI helpers: toasts + a tiny field-driven modal. Imported by views.

export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/</g, '&lt;');

export async function api(path, body) {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : {});
  return res.json();
}

let toastBox;
export function toast(msg, kind = '') {
  if (!toastBox) { toastBox = document.createElement('div'); toastBox.className = 'toasts'; document.body.appendChild(toastBox); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  toastBox.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 2200);
}

/**
 * Open a modal form.
 * fields: [{ key, label, type:'text'|'number'|'date'|'select'|'textarea', options?, value? }]
 * Returns a Promise resolving to the values object on Save, or null on Cancel.
 * extraButtons: [{ label, kind, value }] (e.g. a Delete button) — resolves to { __action: value }.
 */
export function modal(title, fields, opts = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const inputId = (k) => 'm_' + k;
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${fields.map((f) => `
          <div class="field">
            <label for="${inputId(f.key)}">${esc(f.label)}</label>
            ${f.type === 'select'
              ? `<select id="${inputId(f.key)}">${f.options.map((o) => `<option ${o === f.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
              : f.type === 'textarea'
                ? `<textarea id="${inputId(f.key)}" rows="3">${esc(f.value ?? '')}</textarea>`
                : `<input id="${inputId(f.key)}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}">`}
          </div>`).join('')}
        <div class="actions">
          ${(opts.extraButtons || []).map((b) => `<button class="btn ${b.kind || 'ghost'}" data-act="${esc(b.value)}">${esc(b.label)}</button>`).join('')}
          <button class="btn ghost" data-cancel>Cancel</button>
          <button class="btn" data-save>${esc(opts.saveLabel || 'Save')}</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = (v) => { back.remove(); resolve(v); };
    back.addEventListener('click', (e) => { if (e.target === back) close(null); });
    $('[data-cancel]', back).onclick = () => close(null);
    $('[data-save]', back).onclick = () => {
      const out = {};
      for (const f of fields) out[f.key] = $('#' + inputId(f.key), back).value;
      close(out);
    };
    back.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => close({ __action: b.dataset.act }));
    const first = back.querySelector('input,select,textarea'); if (first) first.focus();
  });
}

export const money = (n, c) =>
  (c === 'GBP' ? '£' : c === 'TRY' ? '₺' : c === 'EUR' ? '€' : c === 'USD' ? '$' : c + ' ') +
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
