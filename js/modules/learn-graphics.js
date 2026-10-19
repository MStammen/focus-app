// Interaktive SVG-Grafiken für die Erklärkarten. Jede Funktion gibt ein DOM-Element zurück.
import { el, fmtNum, fmtShutter, fmtAperture, fmtStops } from '../lib/ui.js';
import { ev, shutterFor, standardSeries, shutterWithNd } from '../core/exposure.js';
import { optimalDiameter, blurDiameter, fNumber } from '../core/pinhole.js';
import { correctedTime } from '../core/film.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const c of children) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}
function slider({ label, min, max, step, value, format, onInput }) {
  const out = el('span', { class: 'graphic-value', text: format(value) });
  const input = el('input', { type: 'range', class: 'range', min, max, step, value });
  input.addEventListener('input', () => { const v = Number(input.value); out.textContent = format(v); onInput(v); });
  return { field: el('label', { class: 'graphic-slider' }, [el('span', { class: 'field-label' }, [label, ' ', out]), input]), input };
}
function wrap(svg, controls, caption) {
  return el('div', { class: 'graphic' }, [svg, ...controls, caption ? el('p', { class: 'muted small', text: caption }) : null]);
}

// 1 ---------- Alles ist eine Stufe ----------
function stops() {
  const svg = s('svg', { viewBox: '0 0 360 150', class: 'graphic-svg' });
  const g = s('g'); svg.appendChild(g);
  const text = s('text', { x: 180, y: 140, 'text-anchor': 'middle', class: 'graphic-text' }); svg.appendChild(text);
  function draw(st) {
    g.innerHTML = '';
    const n = Math.pow(2, st);
    const cells = Math.round(n * 8); // bei 0 Stufen: 8 Kästchen
    const cols = 32, size = 10;
    for (let i = 0; i < Math.min(cells, 256); i++) {
      g.appendChild(s('rect', { x: 10 + (i % cols) * (size + 1), y: 10 + Math.floor(i / cols) * (size + 1), width: size, height: size, class: 'graphic-cell' }));
    }
    text.textContent = `${fmtStops(st)} Stufen = ${fmtNum(n, 2)}-fache Lichtmenge · z. B. Zeit ${fmtShutter(shutterFor(ev(8, 1 / 125) - st, 8))} statt 1/125`;
  }
  const sl = slider({ label: 'Stufen', min: -3, max: 3, step: 1, value: 0, format: (v) => fmtStops(v), onInput: draw });
  draw(0);
  return wrap(svg, [sl.field], 'Jedes Kästchen ist eine Portion Licht. Eine Stufe verdoppelt oder halbiert die Zahl der Kästchen, egal ob über Zeit, ISO oder Blende.');
}

// 2 ---------- Blendenzahl ist ein Verhältnis ----------
function fratio() {
  const svg = s('svg', { viewBox: '0 0 360 170', class: 'graphic-svg' });
  const circle = s('circle', { cx: 100, cy: 80, r: 20, class: 'graphic-aperture' });
  const ring = s('circle', { cx: 100, cy: 80, r: 60, class: 'graphic-ring' });
  const label = s('text', { x: 200, y: 70, class: 'graphic-text' });
  const label2 = s('text', { x: 200, y: 95, class: 'graphic-text' });
  const scale = s('text', { x: 100, y: 160, 'text-anchor': 'middle', class: 'graphic-text muted' }, ['Maßstab: 1 mm = 2 px']);
  svg.append(ring, circle, label, label2, scale);
  const state = { focal: 50, n: 8 };
  function draw() {
    const d = state.focal / state.n;
    circle.setAttribute('r', Math.max(1, Math.min(60, d)));
    label.textContent = `Öffnung ${fmtNum(d, 1)} mm`;
    label2.textContent = `${state.focal} mm ÷ ${fmtAperture(state.n)}`;
  }
  const f = slider({ label: 'Brennweite', min: 4, max: 200, step: 1, value: 50, format: (v) => `${v} mm`, onInput: (v) => { state.focal = v; draw(); } });
  const apertures = standardSeries('aperture', 1 / 3);
  const n = slider({ label: 'Blendenzahl', min: 0, max: apertures.length - 1, step: 1, value: apertures.indexOf(8), format: (i) => fmtAperture(apertures[i]), onInput: (i) => { state.n = apertures[i]; draw(); } });
  const presets = el('div', { class: 'chips' }, [
    ['Handy 6 mm f/1,8', 6, 1.8], ['Kleinbild 50 mm f/1,8', 50, 1.8], ['Lochkamera 150 mm f/250', 150, 250],
  ].map(([txt, fo, ap]) => el('button', { type: 'button', class: 'chip quick', text: txt, onClick: () => { state.focal = fo; state.n = ap; f.input.value = fo; f.field.querySelector('.graphic-value').textContent = `${fo} mm`; const idx = apertures.findIndex((a) => Math.abs(a - ap) < 0.01); if (idx >= 0) { n.input.value = idx; n.field.querySelector('.graphic-value').textContent = fmtAperture(ap); } draw(); } })));
  draw();
  return wrap(svg, [f.field, n.field, presets], 'Der große Ring ist das Objektiv, der Kreis darin die tatsächliche Öffnung. Dieselbe Blendenzahl, aber ganz andere Lochgrößen.');
}

// 3 ---------- Schärfentiefe hängt am Format ----------
function dof(devices) {
  const svg = s('svg', { viewBox: '0 0 360 180', class: 'graphic-svg' });
  const defs = s('defs');
  const mk = (id) => { const f = s('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '140%' }); const b = s('feGaussianBlur', { stdDeviation: 0 }); f.appendChild(b); defs.appendChild(f); return b; };
  const bgBlur = mk('dof-bg'), fgBlur = mk('dof-fg');
  svg.appendChild(defs);
  svg.appendChild(s('rect', { width: 360, height: 180, class: 'graphic-bg' }));
  const bg = s('g', { filter: 'url(#dof-bg)' });
  for (let i = 0; i < 6; i++) bg.appendChild(s('rect', { x: 20 + i * 58, y: 30 + (i % 2) * 10, width: 36, height: 80, class: 'graphic-house' }));
  const mid = s('g'); mid.appendChild(s('circle', { cx: 180, cy: 95, r: 18, class: 'graphic-person' })); mid.appendChild(s('rect', { x: 165, y: 113, width: 30, height: 50, rx: 6, class: 'graphic-person' }));
  const fg = s('g', { filter: 'url(#dof-fg)' }); fg.appendChild(s('circle', { cx: 60, cy: 150, r: 26, class: 'graphic-fg' }));
  svg.append(bg, mid, fg);
  const txt = s('text', { x: 180, y: 174, 'text-anchor': 'middle', class: 'graphic-text' }); svg.appendChild(txt);
  const state = { device: devices[0], n: 2.8 };
  function draw() {
    const dev = state.device;
    const n = dev.apertureFixed ? dev.aperture : state.n;
    const opening = dev.focal / n; // mm, bei gleichem Bildausschnitt
    const blur = Math.min(8, opening / 3.5);
    bgBlur.setAttribute('stdDeviation', dev.id === 'pinhole' ? 1.2 : blur);
    fgBlur.setAttribute('stdDeviation', dev.id === 'pinhole' ? 1.2 : blur * 0.8);
    txt.textContent = `${dev.name}: ${dev.focal} mm, ${fmtAperture(n)} → Öffnung ${fmtNum(opening, 1)} mm`;
    nSlider.input.disabled = !!dev.apertureFixed;
    nSlider.field.querySelector('.graphic-value').textContent = dev.apertureFixed ? `${fmtAperture(n)} (fest)` : fmtAperture(n);
  }
  const apertures = standardSeries('aperture', 1).filter((a) => a <= 22);
  const nSlider = slider({ label: 'Blendenzahl', min: 0, max: apertures.length - 1, step: 1, value: apertures.indexOf(2.8), format: (i) => fmtAperture(apertures[i]), onInput: (i) => { state.n = apertures[i]; draw(); } });
  const devBar = el('div', { class: 'chips' }, devices.map((d) => el('button', { type: 'button', class: 'chip quick', text: d.name, 'aria-pressed': String(d === state.device), onClick: (e) => { state.device = d; devBar.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); draw(); } })));
  draw();
  return wrap(svg, [devBar, nSlider.field], 'Scharf gestellt auf die Person. Je größer die absolute Öffnung, desto weicher Vorder- und Hintergrund. Prinzipdarstellung.');
}

// 4 ---------- Lochkamera: Geometrie gegen Beugung ----------
function pinhole() {
  const W = 360, H = 200, px = 40, py = 20, pw = 300, ph = 140;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graphic-svg' });
  const geo = s('path', { class: 'graphic-line geo' }), dif = s('path', { class: 'graphic-line dif' }), tot = s('path', { class: 'graphic-line tot' });
  const marker = s('circle', { r: 5, class: 'graphic-marker' }), optLine = s('line', { class: 'graphic-dashed' });
  const txt = s('text', { x: W / 2, y: H - 4, 'text-anchor': 'middle', class: 'graphic-text small' });
  svg.append(s('rect', { x: px, y: py, width: pw, height: ph, class: 'graphic-plot' }), geo, dif, tot, optLine, marker, txt,
    s('text', { x: px + 4, y: py + 12, class: 'graphic-text small' }, ['Unschärfe-Fleck']), s('text', { x: px + pw - 4, y: py + ph - 4, 'text-anchor': 'end', class: 'graphic-text small' }, ['Lochdurchmesser →']));
  const state = { d: 0.5, f: 100 };
  const dMin = 0.1, dMax = 1.6;
  function xOf(d) { return px + ((d - dMin) / (dMax - dMin)) * pw; }
  function draw() {
    const maxBlur = 2.0; // mm
    const yOf = (b) => py + ph - Math.min(1, b / maxBlur) * ph;
    let pg = '', pd = '', pt = '';
    for (let i = 0; i <= 60; i++) {
      const d = dMin + (i / 60) * (dMax - dMin);
      const b = blurDiameter(d, state.f);
      const x = xOf(d);
      pg += `${i ? 'L' : 'M'}${x} ${yOf(b.geometric)} `;
      pd += `${i ? 'L' : 'M'}${x} ${yOf(b.diffraction)} `;
      pt += `${i ? 'L' : 'M'}${x} ${yOf(b.total)} `;
    }
    geo.setAttribute('d', pg); dif.setAttribute('d', pd); tot.setAttribute('d', pt);
    const b = blurDiameter(state.d, state.f);
    marker.setAttribute('cx', xOf(state.d)); marker.setAttribute('cy', yOf(b.total));
    const opt = optimalDiameter(state.f);
    optLine.setAttribute('x1', xOf(opt)); optLine.setAttribute('x2', xOf(opt)); optLine.setAttribute('y1', py); optLine.setAttribute('y2', py + ph);
    txt.textContent = `Loch ${fmtNum(state.d, 2)} mm → ${fmtAperture(fNumber(state.d, state.f))} · Optimum ${fmtNum(opt, 2)} mm`;
  }
  const d = slider({ label: 'Lochdurchmesser', min: dMin, max: dMax, step: 0.01, value: 0.5, format: (v) => `${fmtNum(v, 2)} mm`, onInput: (v) => { state.d = v; draw(); } });
  const f = slider({ label: 'Bildweite', min: 25, max: 300, step: 5, value: 100, format: (v) => `${v} mm`, onInput: (v) => { state.f = v; draw(); } });
  draw();
  return wrap(svg, [d.field, f.field], 'Gelb: Geometrie (größeres Loch, größerer Fleck). Blau: Beugung (kleineres Loch, größerer Fleck). Weiß: beides zusammen, mit Minimum beim Optimum.');
}

// 5 ---------- Langzeitbelichtung: Integration ----------
function longexposure() {
  const svg = s('svg', { viewBox: '0 0 360 170', class: 'graphic-svg' });
  svg.appendChild(s('text', { x: 10, y: 20, class: 'graphic-text' }, ['Film: Verschluss offen']));
  const filmBar = s('rect', { x: 10, y: 28, width: 0, height: 22, class: 'graphic-bar' });
  const filmTrail = s('line', { x1: 10, y1: 39, x2: 10, y2: 39, class: 'graphic-trail' });
  svg.append(s('rect', { x: 10, y: 28, width: 340, height: 22, class: 'graphic-plot' }), filmBar, filmTrail);
  svg.appendChild(s('text', { x: 10, y: 80, class: 'graphic-text' }, ['Handy: Einzelbilder gestapelt']));
  const frames = s('g'); svg.appendChild(frames);
  svg.appendChild(s('rect', { x: 10, y: 88, width: 340, height: 22, class: 'graphic-plot' }));
  const phoneTrail = s('line', { x1: 10, y1: 99, x2: 10, y2: 99, class: 'graphic-trail dashed' }); svg.appendChild(phoneTrail);
  // Bildunterschrift in zwei Zeilen, sonst wird sie auf schmalen Handys rechts abgeschnitten
  const txt = s('text', { x: 10, y: 138, class: 'graphic-text' }); svg.appendChild(txt);
  const txt2 = s('text', { x: 10, y: 158, class: 'graphic-text' }); svg.appendChild(txt2);
  function draw(sec) {
    const w = (sec / 10) * 340;
    filmBar.setAttribute('width', w); filmTrail.setAttribute('x2', 10 + w);
    frames.innerHTML = '';
    const n = Math.round(sec * 6); // Prinzip: 6 Bilder je Sekunde dargestellt
    for (let i = 0; i < n; i++) frames.appendChild(s('rect', { x: 10 + i * (340 / 60), y: 88, width: 340 / 60 - 1.5, height: 22, class: 'graphic-frame' }));
    phoneTrail.setAttribute('x2', 10 + w);
    txt.textContent = `${fmtNum(sec, 1)} s: Film sammelt lückenlos,`;
    txt2.textContent = `das Handy ${Math.round(sec * 30)} Einzelbilder mit Pausen dazwischen.`;
  }
  const sl = slider({ label: 'Belichtungszeit', min: 0, max: 10, step: 0.5, value: 3, format: (v) => `${fmtNum(v, 1)} s`, onInput: draw });
  draw(3);
  return wrap(svg, [sl.field], 'Beide sammeln gleich viel Licht. Die Lücken des Handys sieht man nur an bewegten Lichtern: die Spur wird gestrichelt.');
}

// 6 ---------- ND-Filter ----------
function nd() {
  const svg = s('svg', { viewBox: '0 0 360 120', class: 'graphic-svg' });
  const glass = s('rect', { x: 20, y: 20, width: 80, height: 80, rx: 8, class: 'graphic-glass' });
  const txt = s('text', { x: 120, y: 50, class: 'graphic-text' });
  const txt2 = s('text', { x: 120, y: 80, class: 'graphic-text' });
  svg.append(s('rect', { x: 20, y: 20, width: 80, height: 80, rx: 8, class: 'graphic-light' }), glass, txt, txt2);
  const base = 1 / 125;
  function draw(st) {
    glass.setAttribute('opacity', String(1 - Math.pow(2, -st)));
    txt.textContent = `${fmtNum(st, 1)} Stufen = Faktor ${fmtNum(Math.pow(2, st), st > 6 ? 0 : 1)}`;
    txt2.textContent = `1/125 s wird zu ${fmtShutter(shutterWithNd(base, { stops: st }))}`;
  }
  const sl = slider({ label: 'ND-Stärke', min: 0, max: 16, step: 1, value: 10, format: (v) => `${v} Stufen`, onInput: draw });
  const chips = el('div', { class: 'chips' }, [['ND8', 3], ['ND64', 6], ['ND1000', 10], ['ND100000', 16.6]].map(([n, st]) => el('button', { type: 'button', class: 'chip quick', text: n, onClick: () => { sl.input.value = Math.round(st); sl.field.querySelector('.graphic-value').textContent = `${Math.round(st)} Stufen`; draw(st); } })));
  draw(10);
  return wrap(svg, [sl.field, chips], 'Das Quadrat ist das Licht, das Glas davor schluckt je Stufe die Hälfte.');
}

// 7 ---------- Schwarzschild ----------
function schwarzschild(films) {
  const W = 360, H = 200, px = 50, py = 15, pw = 295, ph = 150;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graphic-svg' });
  const ident = s('path', { class: 'graphic-dashed' }), curve = s('path', { class: 'graphic-line tot' });
  const txt = s('text', { x: W / 2, y: H - 4, 'text-anchor': 'middle', class: 'graphic-text' });
  svg.append(s('rect', { x: px, y: py, width: pw, height: ph, class: 'graphic-plot' }), ident, curve, txt,
    s('text', { x: px + 4, y: py + 12, class: 'graphic-text small' }, ['korrigiert ↑']), s('text', { x: px + pw - 4, y: py + ph - 4, 'text-anchor': 'end', class: 'graphic-text small' }, ['gemessen →']));
  const tMin = 1, tMax = 480, cMax = 8000;
  const xOf = (t) => px + (Math.log(t / tMin) / Math.log(tMax / tMin)) * pw;
  const yOf = (c) => py + ph - (Math.log(c / tMin) / Math.log(cMax / tMin)) * ph;
  for (const t of [1, 10, 60, 480]) svg.appendChild(s('text', { x: xOf(t), y: py + ph + 12, 'text-anchor': 'middle', class: 'graphic-text small' }, [fmtShutter(t)]));
  for (const c of [10, 60, 480, 3600]) svg.appendChild(s('text', { x: px - 4, y: yOf(c) + 4, 'text-anchor': 'end', class: 'graphic-text small' }, [fmtShutter(c)]));
  let pi = '';
  for (let i = 0; i <= 20; i++) { const t = tMin * Math.pow(tMax / tMin, i / 20); pi += `${i ? 'L' : 'M'}${xOf(t)} ${yOf(t)} `; }
  ident.setAttribute('d', pi);
  const state = { film: films[0] };
  function draw() {
    let p = ''; let n = 0;
    for (let i = 0; i <= 40; i++) {
      const t = tMin * Math.pow(tMax / tMin, i / 40);
      const r = correctedTime(state.film.points, t);
      if (r.seconds == null || r.status === 'gap') continue;
      p += `${n++ ? 'L' : 'M'}${xOf(t)} ${yOf(Math.min(cMax, r.seconds))} `;
    }
    curve.setAttribute('d', p);
    const r30 = correctedTime(state.film.points, 30);
    txt.textContent = `${state.film.name}: 30 s gemessen → ${r30.seconds ? fmtShutter(r30.seconds) : 'keine Daten'}`;
  }
  const select = el('select', { class: 'select' }, films.map((f) => el('option', { value: f.id, text: f.name })));
  select.addEventListener('change', () => { state.film = films.find((f) => f.id === select.value); draw(); });
  draw();
  return wrap(svg, [el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Film' }), select])], 'Gestrichelt: ohne Schwarzschild-Effekt. Weiß: nach Herstellerdaten. Wo die Linie endet, gibt der Hersteller keine Daten mehr an.');
}

export function graphic(id, deps) {
  switch (id) {
    case 'stops': return stops();
    case 'fratio': return fratio();
    case 'dof': return dof(deps.devices);
    case 'pinhole': return pinhole();
    case 'longexposure': return longexposure();
    case 'nd': return nd();
    case 'schwarzschild': return schwarzschild(deps.films);
    case 'modedial': return modedial(deps.cameraModes, deps.modedialOptions);
    default: return null;
  }
}

// 9 ---------- Modusrad-Übersetzer ----------
export function modedial(data, { brandId, onBrandChange } = {}) {
  const concepts = data.concepts;
  const brands = data.brands;
  const state = { brand: brands.find((b) => b.id === brandId) || brands[0], concept: 'aperturePriority' };
  const svg = s('svg', { viewBox: '0 0 360 230', class: 'graphic-svg' });
  const dialG = s('g');
  svg.appendChild(dialG);
  const select = el('select', { class: 'select' }, brands.map((b) => el('option', { value: b.id, text: b.name, selected: b === state.brand })));
  select.addEventListener('change', () => { state.brand = brands.find((b) => b.id === select.value); onBrandChange?.(state.brand.id); draw(); });
  const info = el('div', { class: 'card modedial-info' });
  const tip = el('div', { class: 'notice small' });
  const CX = 180, CY = 118, R = 92;
  function draw() {
    dialG.innerHTML = '';
    dialG.appendChild(s('circle', { cx: CX, cy: CY, r: R, class: 'cam-dial-face' }));
    dialG.appendChild(s('circle', { cx: CX, cy: CY, r: 14, class: 'cam-marker-center' }));
    const n = concepts.length;
    concepts.forEach((c, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = CX + Math.cos(a) * (R - 26), y = CY + Math.sin(a) * (R - 26);
      const label = state.brand.modes[c.id] || '–';
      const short = label.length > 9 ? label.split(/[ ,:]/)[0].slice(0, 9) : label;
      const active = c.id === state.concept;
      const g = s('g', { class: `mode-pos${active ? ' active' : ''}`, role: 'button', tabindex: 0, 'aria-label': `${c.name}: ${label}` });
      g.appendChild(s('circle', { cx: x, cy: y, r: 22, class: 'mode-pos-bg' }));
      g.appendChild(s('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'mode-pos-text' }, [short]));
      const pick = () => { state.concept = c.id; draw(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      dialG.appendChild(g);
    });
    const c = concepts.find((x) => x.id === state.concept);
    const label = state.brand.modes[c.id] || '–';
    const note = state.brand.notes?.[c.id];
    info.innerHTML = '';
    info.append(
      el('div', { class: 'modedial-title' }, [el('strong', { text: c.name }), c.alias ? el('span', { class: 'muted small', text: ` · ${c.alias}` }) : null]),
      el('div', { class: 'modedial-label', text: label }),
      el('div', { class: 'small' }, [el('strong', { text: 'Du wählst: ' }), c.youSet]),
      el('div', { class: 'small' }, [el('strong', { text: 'Die Kamera wählt: ' }), c.cameraSets]),
      note ? el('div', { class: 'muted small', style: 'margin-top:6px', text: note }) : '', // append() schreibt null sonst als Text
    );
    tip.innerHTML = '';
    tip.append(el('strong', { text: `Lange Belichtung bei ${state.brand.name}: ` }), state.brand.longExposure);
  }
  draw();
  return el('div', { class: 'graphic' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Deine Kamera' }), select]),
    svg, info, tip,
    el('p', { class: 'muted small', text: 'Antippe eine Stellung auf dem Rad. Die Beschriftung folgt der gewählten Marke; einzelne Modelle weichen ab.' }),
  ]);
}
