// Kleine DOM-Helfer und Formatierung für die Anzeige (deutsches Komma).
import { standardSeries, nearestStandard, formatShutter, formatAperture, formatStops } from '../core/exposure.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

// ---------- Zahlenformat ----------

export function fmtNum(n, decimals = 1) {
  if (!Number.isFinite(n)) return '–';
  return Number(n.toFixed(decimals)).toLocaleString('de-DE', { maximumFractionDigits: decimals });
}
// Ungültige Werte (0, negativ, keine Zahl) zeigen „–“, statt einen Fehler zu werfen
const valid = (v) => Number.isFinite(v) && v > 0;
export const fmtShutter = (s) => (valid(s) ? formatShutter(s).replace('.', ',') : '–');
export const fmtAperture = (n) => (valid(n) ? formatAperture(n).replace('.', ',') : '–');
export const fmtStops = (s, d) => formatStops(s, d).replace('.', ',');
export function fmtSeconds(s) {
  // Für Timer und Eingaben: "8,2 s", "2 min 15 s"
  if (s < 60) return `${fmtNum(s, s < 10 ? 1 : 0)} s`;
  return fmtShutter(s);
}
export function fmtIso(iso) { return `ISO ${Math.round(iso)}`; }
export function fmtValue(kind, v) {
  if (kind === 'aperture') return fmtAperture(v);
  if (kind === 'shutter') return fmtShutter(v);
  return fmtIso(v);
}

// ---------- Stufenraster ----------

export const STEP_OPTIONS = [
  { key: '1', value: 1, label: '1' },
  { key: '1/2', value: 1 / 2, label: '½' },
  { key: '1/3', value: 1 / 3, label: '⅓' },
];
export function stepFromSetting(ctx) {
  const key = ctx.getSetting('stepGrid', '1/3');
  return (STEP_OPTIONS.find((o) => o.key === key) || STEP_OPTIONS[2]).value;
}

// ---------- Bausteine ----------

/** Umschalter (Segmented Control). items: [{ id, label, href? }], active id, onSelect(id). */
export function segmented({ items, active, onSelect, ariaLabel, small = false }) {
  const wrap = el('div', { class: `segmented${small ? ' small' : ''}${items.length >= 5 ? ' scroll' : ''}`, role: 'group', 'aria-label': ariaLabel });
  for (const item of items) {
    const tag = item.href ? 'a' : 'button';
    const btn = el(tag, {
      class: 'segment',
      type: item.href ? undefined : 'button',
      href: item.href,
      'aria-current': item.id === active ? 'true' : undefined,
      text: item.label,
      onClick: (e) => {
        if (!item.href) e.preventDefault();
        if (onSelect) onSelect(item.id);
      },
    });
    wrap.appendChild(btn);
  }
  return wrap;
}

/** Auswahl aus einer Standardreihe. Gibt { field, select, setValue, getValue } zurück. */
export function seriesSelect({ kind, step, value, label, onChange, id }) {
  const select = el('select', { class: 'select', id });
  const field = el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), select]);
  let current = value;

  function fill() {
    select.innerHTML = '';
    const series = standardSeries(kind, step);
    let found = false;
    for (const v of series) {
      const opt = el('option', { value: String(v), text: fmtValue(kind, v) });
      if (Math.abs(Math.log2(v / current)) < 1e-6) { opt.selected = true; found = true; }
      select.appendChild(opt);
    }
    if (!found) {
      // Wert außerhalb des Rasters (z. B. exakt übernommen): als eigene Option oben einfügen.
      const opt = el('option', { value: String(current), text: `${fmtValue(kind, current)} (exakt)` });
      opt.selected = true;
      select.insertBefore(opt, select.firstChild);
    }
  }
  fill();
  select.addEventListener('change', () => {
    current = Number(select.value);
    onChange?.(current);
  });
  return {
    field, select,
    getValue: () => current,
    setValue: (v, { snap = false } = {}) => { current = snap ? nearestStandard(v, kind, step) : v; fill(); },
    setStep: (s) => { step = s; fill(); },
  };
}

/** Zahlenfeld mit Einheit. */
export function numberField({ label, value, unit, min, max, stepAttr = 'any', onChange, id, inputmode = 'decimal' }) {
  const input = el('input', {
    class: 'input', type: 'number', id, inputmode, min, max, step: stepAttr, value: value ?? '',
  });
  input.addEventListener('input', () => {
    const v = parseFloat(String(input.value).replace(',', '.'));
    onChange?.(Number.isFinite(v) ? v : null);
  });
  const field = el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    el('span', { class: 'input-wrap' }, [input, unit ? el('span', { class: 'input-unit', text: unit }) : null]),
  ]);
  return { field, input, getValue: () => { const v = parseFloat(String(input.value).replace(',', '.')); return Number.isFinite(v) ? v : null; }, setValue: (v) => { input.value = v ?? ''; } };
}

/** Großer Ergebniswert mit Beschriftung. */
export function bigValue({ label, value, sub }) {
  return el('div', { class: 'big-value' }, [
    el('div', { class: 'big-value-label', text: label }),
    el('div', { class: 'big-value-number', text: value }),
    sub ? el('div', { class: 'big-value-sub muted small', text: sub }) : null,
  ]);
}

export function button(text, { primary = false, danger = false, block = false, onClick, disabled = false, type = 'button' } = {}) {
  return el('button', {
    type, class: `button${primary ? ' primary' : ''}${danger ? ' danger' : ''}${block ? ' block' : ''}`,
    text, disabled, onClick,
  });
}

export function chip(text, { onRemove, removeLabel = 'Entfernen' } = {}) {
  return el('span', { class: 'chip' }, [
    el('span', { text }),
    onRemove ? el('button', { type: 'button', class: 'chip-remove', 'aria-label': `${text} ${removeLabel}`, text: '×', onClick: onRemove }) : null,
  ]);
}

/** Download einer Textdatei (Export). */
export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

/**
 * Überschrift eines Reiters mit Info-Knopf „i“. Darunter eine aufklappbare Karte mit den wichtigsten Infos
 * (Text `help.<key>` in i18n, Punkte mit „|“ getrennt). Offen/zu merkt sich die App je Reiter.
 * → { row, box }: beide in dieser Reihenfolge einhängen.
 */
export function titleWithInfo(ctx, { title, key }) {
  const { t } = ctx;
  const id = `help-${key}`;
  const btn = el('button', { type: 'button', class: 'info-btn', 'aria-label': t('common.info'), 'aria-controls': id }, [el('span', { 'aria-hidden': 'true', text: 'i' })]);
  const items = t(`help.${key}`).split('|').map((s) => s.trim()).filter(Boolean);
  const box = el('div', { class: 'card info-box small', id }, [el('ul', {}, items.map((s) => el('li', { text: s })))]);
  const set = (open) => { box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  set(!!ctx.getSetting(`helpOpen.${key}`, false));
  btn.addEventListener('click', () => { const open = box.hidden; set(open); ctx.setSetting(`helpOpen.${key}`, open); });
  return { row: el('div', { class: 'title-row' }, [el('h1', { text: title }), btn]), box };
}
