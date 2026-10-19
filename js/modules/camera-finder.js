// Kamera · „Wo finde ich was?“: Funktionen (AF-Modus, Selbstauslöser, erschütterungsfrei auslösen) des
// gewählten Modells. Bedienteile benennt die Grafik selbst beim Antippen (camera-view.js, highlight mit Namen);
// describePart und partLabel liefern dafür Name und Erklärung. Lage der Teile: data/camera-modes.json → body.
import { el } from '../lib/ui.js';

// Symbole hinter den Schlagworten, angelehnt an die Zeichen auf Kameradisplays und Tasten (Strich in Textfarbe)
const FN_ICONS = {
  afmf: '<rect x="2.5" y="6" width="15" height="8" rx="4"/><circle cx="6.5" cy="10" r="2.2" fill="currentColor" stroke="none"/><path d="M11.5 8.6v2.8M14.5 8.6v2.8"/>',
  points: '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M8 10h4M10 8v4"/><circle cx="6" cy="7" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="7" r=".9" fill="currentColor" stroke="none"/><circle cx="6" cy="13" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="13" r=".9" fill="currentColor" stroke="none"/>',
  metering: '<rect x="2.5" y="4" width="15" height="12" rx="1.5"/><circle cx="10" cy="10" r="3.2"/><circle cx="10" cy="10" r=".9" fill="currentColor" stroke="none"/>',
  drive: '<rect x="2.5" y="7" width="9" height="9" rx="1"/><path d="M5.5 4h9a1 1 0 0 1 1 1v8M8.5 1.8h8.5a1 1 0 0 1 1 1v7"/>',
  quality: '<path d="M5 2.5h7l4 4V17.5H5z"/><path d="M12 2.5v4h4"/><text x="10.5" y="14.6" font-size="4.6" text-anchor="middle" fill="currentColor" stroke="none" font-family="inherit">RAW</text>',
  iso: '<rect x="1.5" y="5" width="17" height="10" rx="2"/><text x="10" y="12.4" font-size="6.2" text-anchor="middle" fill="currentColor" stroke="none" font-family="inherit">ISO</text>',
  stab: '<path d="M7 4.5c-2 1.6-2 9.4 0 11M4 2.5c-3 2.8-3 12.2 0 15M13 4.5c2 1.6 2 9.4 0 11M16 2.5c3 2.8 3 12.2 0 15"/><rect x="8.5" y="7" width="3" height="6" rx="1"/>',
  af: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/>',
  timer: '<circle cx="10" cy="11" r="6"/><path d="M10 11V7.5M10 11l2.4 1.6M8.5 3h3"/>',
  mirror: '<path d="M3 15L13 7"/><path d="M15 13V3M12.5 5.5L15 3l2.5 2.5"/>',
  efc: '<rect x="3" y="3" width="14" height="14" rx="1.5"/><path d="M3 8h14M3 12h6"/><text x="13.2" y="15.6" font-size="6" text-anchor="middle" fill="currentColor" stroke="none" font-family="inherit">e</text>',
};
function fnIcon(key) {
  const span = el('span', { class: 'fn-icon', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${FN_ICONS[key]}</svg>`;
  return span;
}
const DIAL_MODES = ['aperturePriority', 'shutterPriority', 'manual', 'bulb'];
const short = (text, fallback) => {
  const first = String(text || '').split(/[ ,:/(]/)[0];
  return first && first.length <= 5 ? first : fallback;
};

/** Erklärtext für ein Bedienteil der Marke. */
export function describePart(t, brand, part) {
  const body = brand?.body || {};
  const name = brand?.name || '';
  if (part.kind === 'modeDial') {
    const modes = ['program', ...DIAL_MODES].map((m) => short(brand?.modes?.[m], m === 'program' ? 'P' : m === 'bulb' ? 'B' : '?')).join(' · ');
    return t(body.modeDial === 'button' ? 'camera.partText.modeButton' : 'camera.partText.modeDial', { brand: name, modes });
  }
  if (part.kind === 'frontDial' || part.kind === 'rearDial' || part.kind === 'controlWheel' || part.kind === 'shutterDial') {
    const side = { frontDial: 'front', rearDial: 'rear', controlWheel: 'wheel', shutterDial: 'shutterDial' }[part.kind];
    const where = part.kind === 'frontDial' ? t(`camera.partText.frontDial_${body.front || 'grip'}`)
      : part.kind === 'rearDial' ? t(`camera.partText.rearDial_${body.rear || 'thumb'}`)
        : part.kind === 'controlWheel' ? t('camera.partText.controlWheelWhere')
          : t(brand?.layout === 'pasm' ? 'camera.partText.shutterDialPasm' : 'camera.partText.shutterDial');
    const uses = DIAL_MODES.flatMap((m) => Object.entries(brand?.dials?.[m] || {})
      .map(([what, v]) => ({ what, dial: String(v).split('+')[0], btn: String(v).split('+')[1] }))
      .filter((u) => u.dial === side)
      .map((u) => t(u.btn ? 'camera.finder.inModeBtn' : 'camera.finder.inMode', { mode: short(brand.modes?.[m], m), what: t(`camera.finder.${u.what}`), btn: u.btn })));
    if (part.kind === 'controlWheel' && !uses.length) return t('camera.partText.controlWheel');
    if (part.kind === 'shutterDial' && brand?.layout !== 'pasm') return where;
    return `${where} ${uses.length ? t('camera.finder.use', { use: uses.join(', ') }) : t('camera.finder.useNone', { brand: name })}`;
  }
  if (part.kind === 'button') {
    const text = t(`camera.buttons.${part.key}`);
    return text === `camera.buttons.${part.key}` ? t('camera.buttons.default', { key: part.key }) : text;
  }
  return t(`camera.partText.${part.kind}`);
}

/**
 * Kurze Erklärung für die Zeile unter der Kamera: bei Einstellrädern, was sie im gewählten Modus stellen,
 * sonst der erste Satz der ausführlichen Erklärung.
 */
export function shortPart(t, brand, part, mode) {
  const side = { frontDial: 'front', rearDial: 'rear', controlWheel: 'wheel', shutterDial: 'shutterDial' }[part.kind];
  if (side && brand?.layout !== 'dials' && mode !== 'program') {
    const label = short(brand?.modes?.[mode], mode === 'bulb' ? 'B' : mode);
    const uses = Object.entries(brand?.dials?.[mode] || {})
      .map(([what, v]) => ({ what, dial: String(v).split('+')[0], btn: String(v).split('+')[1] }))
      .filter((u) => u.dial === side);
    if (uses.length) return uses.map((u) => t(u.btn ? 'camera.partNowBtn' : 'camera.partNow', { mode: label, what: t(`camera.finder.${u.what}`), btn: u.btn })).join(' ');
    if (brand?.dials?.[mode]) return t('camera.partNowNone', { mode: label });
  }
  if (part.kind === 'modeDial') return t('camera.partNowMode', { mode: short(brand?.modes?.[mode], mode === 'bulb' ? 'B' : mode === 'program' ? 'P' : mode) });
  const full = describePart(t, brand, part);
  return String(full).split(/(?<=[.!?])\s/)[0];
}

export function partLabel(t, part) {
  return part.label || t(`camera.part.${part.kind}`, { key: part.key });
}

/**
 * partFinder(ctx, { dials, onSelect }) → { el, refresh(brand), select(id), clear() }
 * onSelect(): wird gerufen, wenn eine Funktion gewählt wird (z. B. um eine Teil-Erklärung auszublenden).
 */
export function partFinder(ctx, { dials, onSelect }) {
  const { t } = ctx;
  let brand = null, current = null;
  // Funktionen: AF-Modus, Selbstauslöser, erschütterungsfrei auslösen (data/camera-modes.json → models[].functions)
  const fnChips = el('div', { class: 'chips finder-chips' });
  const text = el('div', { class: 'finder-text small', 'aria-live': 'polite' });
  // Inhalt des aufklappbaren Bereichs „Wo finde ich was?“
  const card = el('div', { class: 'finder' }, [
    el('span', { class: 'field-label', text: t('camera.func.title') }), fnChips,
    text,
  ]);

  // Schlagworte für alle Modelle gleich. Je Schlagwort: Teile, die an vielen Kameras dafür da sind (werden markiert,
  // wenn das Modell sie hat). Wo genau es am Modell sitzt, steht nur, wenn es aus der Herstelleranleitung erfasst ist.
  const FUNCS = [
    { key: 'afmf', icon: 'afmf', parts: ['lens'] },
    { key: 'af', icon: 'af', parts: ['button:AF', 'button:AF·DRIVE'] },
    { key: 'points', icon: 'points', parts: ['joystick', 'pad'] },
    { key: 'metering', icon: 'metering', parts: [] },
    { key: 'drive', icon: 'drive', parts: ['button:DRIVE', 'button:AF·DRIVE', 'button:⧉', 'releaseDial'] },
    { key: 'timer', icon: 'timer', parts: ['button:DRIVE', 'button:AF·DRIVE', 'button:⧉', 'releaseDial'] },
    { key: 'quality', icon: 'quality', parts: ['button:QUAL', 'button:Q', 'button:i'] },
    { key: 'iso', icon: 'iso', parts: ['button:ISO', 'isoDial'] },
    { key: 'stab', icon: 'stab', parts: ['lens'] },
    { key: 'shake', icon: null, parts: [] },
  ];
  /** Funktionen mit den Daten des gewählten Modells (falls erfasst). */
  function functionList() {
    const fns = brand?.model?.functions || {};
    const mirror = fns.shake?.type === 'mirror';
    return FUNCS.map((fx) => {
      const k = fx.key === 'shake' ? (mirror ? 'mirror' : 'efc') : fx.key;
      return { id: `fn:${fx.key}`, key: fx.key, icon: fx.icon || (mirror ? 'mirror' : 'efc'), parts: fx.parts, label: t(`camera.func.${k}`), what: t(`camera.func.${k}What`), whereGeneric: fx.key === 'af' || fx.key === 'timer' || fx.key === 'shake' ? null : t(`camera.func.${k}Where`), data: fns[fx.key] };
    });
  }
  /** Teil an der Grafik: erfasstes Teil des Modells, sonst ein passendes vorhandenes Teil (allgemein). */
  function partFor(fn) {
    const all = dials.parts();
    if (fn.data) return fn.data.part ? all.find((p) => p.id === fn.data.part) || null : null; // aus der Anleitung: nur das dort genannte Teil
    for (const id of fn.parts) { const p = all.find((x) => x.id === id); if (p) return p; }
    return null;
  }

  function select(id) {
    current = id && id !== current ? id : null;
    const fn = functionList().find((x) => x.id === current);
    if (fn) onSelect?.();
    // Taste der Funktion an der Grafik zeigen, mit ihrem Namen
    const part = fn ? partFor(fn) : null;
    if (fn || current === null) dials.highlight(part ? part.id : null, part ? partLabel(t, part) : null);
    for (const c of fnChips.children) c.setAttribute('aria-pressed', String(c.dataset.part === current));
    text.innerHTML = '';
    if (fn) {
      const where = fn.data ? fn.data.where
        : fn.whereGeneric ? fn.whereGeneric + (part ? ` ${t('camera.finder.marked', { name: partLabel(t, part) })}` : '')
          : brand?.model ? t('camera.func.notCaptured') : t('camera.func.generic');
      text.append(
        el('strong', { text: brand?.model ? `${fn.label} · ${brand.model.name}` : fn.label }),
        el('p', { class: 'finder-where', style: 'margin:4px 0 0', text: where }),
        el('p', { style: 'margin:6px 0 0', text: fn.what }),
        el('p', { class: 'muted', style: 'margin:6px 0 0', text: fn.data ? [t('camera.finder.source', { source: fn.data.source }), fn.data.confidence !== 'hoch' ? t('camera.dialsCheck') : ''].filter(Boolean).join(' ') : t('camera.finder.generalNote') }),
      );
    }
    text.hidden = !fn;
    // Erklärung direkt unter der gedrückten Schaltfläche (eigene Zeile im Umbruch der Schlagworte)
    const chip = fn && [...fnChips.children].find((c) => c.dataset.part === current);
    if (chip) chip.after(text); else if (text.parentNode !== card) card.append(text);
  }

  /** Auswahl aufheben, ohne die Grafik anzufassen (die Grafik zeigt dann ein angetipptes Teil). */
  function clear() {
    current = null;
    for (const c of fnChips.children) c.setAttribute('aria-pressed', 'false');
    text.innerHTML = ''; text.hidden = true;
    if (text.parentNode !== card) card.append(text);
  }

  function refresh(b) {
    brand = b; current = null;
    if (text.parentNode !== card) card.append(text); // vor dem Leeren aus der Schlagwort-Zeile holen
    fnChips.innerHTML = '';
    const phone = brand?.layout === 'phone' || brand?.layout === 'pinhole';
    wrap.toggleAttribute('data-off', phone); // Handy: keine Bedienteile, Umschalter blendet „Was ist wo“ aus
    if (!phone) for (const fn of functionList()) {
      fnChips.appendChild(el('button', { type: 'button', class: 'chip quick fn-chip', dataset: { part: fn.id }, 'aria-pressed': 'false', onClick: () => select(fn.id) }, [el('span', { text: fn.label }), fnIcon(fn.icon)]));
    }
    clear();
  }

  const wrap = el('div', { class: 'card cam-pane', dataset: { acc: 'finder' }, role: 'region', 'aria-label': t('camera.finder.title') }, [card]);
  return { el: wrap, refresh, select, clear };
}
