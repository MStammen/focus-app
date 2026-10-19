// Moduswahlrad: die Belichtungsarten als drehbares Rad, von oben gesehen. Die gewählte Art steht oben
// an der grünen Marke. Antippen einer Beschriftung oder Drehen mit dem Finger wählt, Pfeiltasten auch.
// Beschriftung wie an der eigenen Marke (Av/Tv bei Canon, A/S bei Nikon …); wo die Marke kein kurzes
// Kürzel hat (z. B. Bulb bei Nikon nur in M), steht das allgemeine Kürzel, die Erklärung darunter nennt die Marke.
// Über dem Rad steht, wie es an dieser Kamera heißt (Modusrad, MODE-Taste, Zeitenrad und Blendenring).
import { el } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const STEP = 44;             // Grad zwischen zwei Rastungen
const CX = 120, CY = 126;    // Mitte des Rades im viewBox
const GENERIC = { program: 'P', aperturePriority: 'A', shutterPriority: 'S', manual: 'M', bulb: 'B' };

function svg(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const k of kids) n.append(k);
  return n;
}

/** Kürzel am Rad: das der Marke, wenn es kurz ist, sonst das allgemeine. */
export function shortLabel(brand, id) {
  const l = brand?.modes?.[id];
  return l && l.length <= 3 ? l : GENERIC[id] || id;
}

/**
 * modeDial({ concepts, brand, value, label, onSelect }) → { el, set(id), setBrand(brand), setTitle(text) }
 * concepts: [{ id, name }] in Reihenfolge am Rad.
 */
export function modeDial({ concepts, brand, value, label, onSelect }) {
  let current = value;
  let rot = 0;
  const ids = concepts.map((c) => c.id);

  const rotG = svg('g', { class: 'md-rot' });
  rotG.append(svg('circle', { class: 'md-rim', cx: CX, cy: CY, r: 104 }));
  for (let a = 0; a < 360; a += 6) {
    const r = (a * Math.PI) / 180;
    rotG.append(svg('line', { class: 'md-knurl', x1: CX + Math.sin(r) * 97, y1: CY - Math.cos(r) * 97, x2: CX + Math.sin(r) * 104, y2: CY - Math.cos(r) * 104 }));
  }
  rotG.append(svg('circle', { class: 'md-face', cx: CX, cy: CY, r: 94 }), svg('circle', { class: 'md-cap', cx: CX, cy: CY, r: 30 }));

  const items = concepts.map((c, i) => {
    const a = (i * STEP * Math.PI) / 180;
    const x = CX + Math.sin(a) * 66, y = CY - Math.cos(a) * 66;
    const text = svg('text', { class: 'md-text', x, y });
    const g = svg('g', { class: 'md-label', role: 'radio', tabindex: '-1', 'data-mode': c.id, 'aria-label': c.name }, [svg('circle', { class: 'md-hit', cx: x, cy: y, r: 31 }), text]);
    g.style.transformOrigin = `${x}px ${y}px`;
    rotG.append(g);
    return { id: c.id, g, text };
  });

  const svgEl = svg('svg', { class: 'mode-dial-svg', viewBox: '0 0 240 236', role: 'radiogroup', 'aria-label': label }, [
    rotG,
    svg('path', { class: 'md-index', d: `M${CX - 9} 4 L${CX + 9} 4 L${CX} 17 Z` }),
  ]);
  const title = el('p', { class: 'md-title field-label' });
  const name = el('p', { class: 'md-name' });
  const brandLine = el('p', { class: 'md-brand muted small' });
  const root = el('div', { class: 'mode-dial' }, [title, svgEl, name, brandLine]);

  function show(deg) {
    rotG.style.transform = `rotate(${deg}deg)`;
    for (const it of items) it.g.style.transform = `rotate(${-deg}deg)`; // Schrift bleibt aufrecht
  }
  function render() {
    const i = ids.indexOf(current);
    rot = -i * STEP;
    show(rot);
    for (const it of items) {
      const on = it.id === current;
      it.g.setAttribute('aria-checked', String(on));
      it.g.setAttribute('tabindex', on ? '0' : '-1');
    }
    const c = concepts[i];
    name.textContent = c ? `${c.name} · ${shortLabel(brand, current)}` : '';
    const full = brand?.modes?.[current];
    brandLine.textContent = full && full !== shortLabel(brand, current) ? `${brand.name}: ${full}` : ''; // nur, wenn das Rad das Kürzel der Marke nicht zeigt
  }
  function setBrand(b) {
    brand = b;
    for (const it of items) it.text.textContent = shortLabel(brand, it.id);
    render();
  }
  function choose(id) {
    if (!ids.includes(id)) return;
    current = id;
    render();
    onSelect?.(id);
  }

  // Drehen mit dem Finger: Winkel zur Radmitte verfolgen, beim Loslassen auf die nächste Rastung
  let drag = null;
  const angleOf = (e) => {
    const b = svgEl.getBoundingClientRect();
    const s = b.width / 240;
    return (Math.atan2(e.clientX - (b.left + CX * s), -(e.clientY - (b.top + CY * s))) * 180) / Math.PI;
  };
  svgEl.addEventListener('pointerdown', (e) => {
    drag = { start: angleOf(e), rot, x: e.clientX, y: e.clientY, moved: false, target: e.target.closest('[data-mode]') };
    svgEl.setPointerCapture?.(e.pointerId);
  });
  svgEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    if (!drag.moved) { drag.moved = true; root.classList.add('dragging'); }
    let d = angleOf(e) - drag.start;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    const min = -(ids.length - 1) * STEP;
    show(Math.min(STEP / 2, Math.max(min - STEP / 2, drag.rot + d)));
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    root.classList.remove('dragging');
    if (!d.moved) {
      if (d.target) choose(d.target.dataset.mode);
      else choose(ids[(ids.indexOf(current) + 1) % ids.length]); // Tipp auf die Mitte oder den Rand: nächster Modus
      return;
    }
    let delta = angleOf(e) - d.start;
    if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
    const i = Math.min(ids.length - 1, Math.max(0, Math.round(-(d.rot + delta) / STEP)));
    choose(ids[i]);
  };
  svgEl.addEventListener('pointerup', end);
  svgEl.addEventListener('pointercancel', () => { drag = null; root.classList.remove('dragging'); render(); });
  svgEl.addEventListener('keydown', (e) => {
    const i = ids.indexOf(current);
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    choose(ids[Math.min(ids.length - 1, Math.max(0, next))]);
    items[ids.indexOf(current)].g.focus();
  });

  setBrand(brand);
  return {
    el: root,
    set(id) { if (id !== current && ids.includes(id)) { current = id; render(); } },
    setBrand,
    setTitle(text) { title.textContent = text; svgEl.setAttribute('aria-label', text); },
  };
}
