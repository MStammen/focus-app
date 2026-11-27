// Zeichnung zum Rechner „Mattscheibe“ (aus der Seminar-Präsentation „Wo wird es scharf?“).
// Seitenansicht maßstäblich: Poster 6 m – Loch/Linse – 2 m Wand. Darunter der Blick auf die Mattscheibe.
// Prinzipdarstellung: Höhen sind überhöht, Längen maßstäblich. Rechnen: js/core/focus.js.
import {
  FOCUS_FORMATS, POSTER_DIST, WALL_DIST, imageDistance, circleOfConfusion, depthOfField, effectiveAperture,
} from '../core/focus.js';

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const de = (v, d) => v.toLocaleString('de-DE', { maximumFractionDigits: d });
/** Längen immer in mm, unter 10 mm mit einer Nachkommastelle. */
export const len = (mm) => (!isFinite(mm) ? '∞' : `${mm < 10 ? de(mm, 1) : de(mm, 0)} mm`);
export const rangeTxt = (a, b) => {
  if (!isFinite(b)) return `${de(a, 0)} – ∞ mm`;
  if (b - a < 100) return `${de(a, 1)} – ${de(b, 1)} mm`;
  return `${de(a, 0)} – ${de(b, 0)} mm`;
};
export const fN = (n) => `f/${n >= 10 ? de(n, 0) : de(n, 1)}`;
// Helligkeit aus wirksamer Blende, gleichmäßig über die Stufen (Blende 1 … Lochkamera)
const brightOf = (Neff) => clamp(0.95 - 0.042 * 2 * Math.log2(Neff / 5.6), 0.06, 1);

// Illustrationsfarben (Motiv, Strahlen). Rotlicht: das ganze SVG wird per CSS-Filter rot.
const C = {
  robe: '#efe9df', mantle: '#b5443b', skin: '#e8c9a8', hair: '#6b4a33', halo: '#e6c45a', base: '#9c968c', eye: '#2a1d14',
  rayTop: '#6fb3ff', rayHand: '#ff7a70', rayFoot: '#ffa25c', posterTop: '#b69cff', posterBot: '#d0d0d0',
  stop: '#5b5f6b', sun: '#f5c542', warm: '#ffa25c', poster: '#c8c8c8', ground: '#14161c', sky: '#3a3f4c', veil: '#f2dccb',
};

const FIG = 200, POSTER_H = 2000;        // Höhe der Figur (20 cm) und des Posters (2 m)
const VW = 2300, CY = 330;               // Zeichenbreite, Achse
const LMAX = 120, TH = 230, OH = 150;    // halbe Linsenhöhe, Wand- und Figurhöhe links (px)
const FS = 1.3;                          // Schrift größer als in der Präsentation (Handy)
// Lage der Linse in der Breite (0…1), z. B. zum Hinscrollen auf dem Handy
export const LENS_FRAC = (VW - 40 - WALL_DIST * (VW - 90) / (POSTER_DIST + WALL_DIST)) / VW;
const fz = (n) => `${Math.round(n * FS)}px`;

// ---- Figur (20 cm), Einheit: ganze Höhe = 1, Mitte auf der Achse ----
function statueSide(p, x, cy, h) {
  const g = mk('g', { transform: `translate(${x} ${cy}) scale(${h})` }, p);
  mk('circle', { cx: -0.005, cy: -0.36, r: 0.1, fill: 'none', stroke: C.halo, 'stroke-width': 0.014 }, g);
  mk('rect', { x: -0.13, y: 0.42, width: 0.26, height: 0.08, fill: C.base, rx: 0.01 }, g);
  mk('path', { d: 'M -0.07 -0.25 L 0.08 -0.25 L 0.12 0.42 L -0.12 0.42 Z', fill: C.robe }, g);
  mk('path', { d: 'M -0.07 -0.25 L 0.0 -0.25 L -0.04 0.42 L -0.13 0.42 Z', fill: C.mantle }, g);
  mk('path', { d: 'M 0.04 -0.19 Q 0.12 -0.15 0.18 -0.06', fill: 'none', stroke: C.robe, 'stroke-width': 0.055, 'stroke-linecap': 'round' }, g);
  mk('circle', { cx: 0.19, cy: -0.05, r: 0.026, fill: C.skin }, g);
  mk('rect', { x: -0.02, y: -0.3, width: 0.05, height: 0.06, fill: C.skin }, g);
  mk('circle', { cx: 0.01, cy: -0.36, r: 0.07, fill: C.skin }, g);
  mk('path', { d: 'M -0.06 -0.4 Q -0.01 -0.46 0.06 -0.4 L 0.0 -0.38 L -0.05 -0.26 Q -0.08 -0.33 -0.06 -0.4 Z', fill: C.hair }, g);
  mk('path', { d: 'M 0.02 -0.32 Q 0.07 -0.31 0.07 -0.34 Q 0.06 -0.27 0.0 -0.27 Z', fill: C.hair }, g);
  mk('circle', { cx: 0.05, cy: -0.37, r: 0.008, fill: C.eye }, g);
}
function statueFront(p, h) {
  const g = mk('g', { transform: `scale(${h})` }, p);
  mk('circle', { cx: 0, cy: -0.36, r: 0.1, fill: 'none', stroke: C.halo, 'stroke-width': 0.014 }, g);
  mk('rect', { x: -0.15, y: 0.42, width: 0.3, height: 0.08, fill: C.base, rx: 0.01 }, g);
  mk('path', { d: 'M -0.09 -0.25 L 0.09 -0.25 L 0.15 0.42 L -0.15 0.42 Z', fill: C.robe }, g);
  mk('path', { d: 'M -0.09 -0.25 L -0.05 -0.25 L -0.09 0.42 L -0.15 0.42 Z', fill: C.mantle }, g);
  mk('path', { d: 'M 0.09 -0.25 L 0.05 -0.25 L 0.09 0.42 L 0.15 0.42 Z', fill: C.mantle }, g);
  mk('path', { d: 'M -0.07 -0.2 Q -0.14 -0.14 -0.17 -0.06 M 0.07 -0.2 Q 0.14 -0.14 0.17 -0.06', fill: 'none', stroke: C.robe, 'stroke-width': 0.05, 'stroke-linecap': 'round' }, g);
  mk('circle', { cx: -0.175, cy: -0.05, r: 0.025, fill: C.skin }, g);
  mk('circle', { cx: 0.175, cy: -0.05, r: 0.025, fill: C.skin }, g);
  mk('path', { d: 'M -0.075 -0.38 Q 0 -0.47 0.075 -0.38 L 0.08 -0.27 L -0.08 -0.27 Z', fill: C.hair }, g);
  mk('circle', { cx: 0, cy: -0.36, r: 0.058, fill: C.skin }, g);
  mk('path', { d: 'M -0.045 -0.34 Q 0 -0.25 0.045 -0.34 Q 0.03 -0.3 0 -0.3 Q -0.03 -0.3 -0.045 -0.34 Z', fill: C.hair }, g);
  mk('circle', { cx: -0.022, cy: -0.37, r: 0.007, fill: C.eye }, g);
  mk('circle', { cx: 0.022, cy: -0.37, r: 0.007, fill: C.eye }, g);
}
// Poster im Schnitt auf der Mattscheibe: nur die Kante
function posterEdge(p, x, cy, h) {
  const w = Math.max(4, h * 0.04);
  mk('rect', { x: x - w / 2, y: cy - h / 2, width: w, height: h, fill: '#d9d4c8', stroke: '#6b675f', 'stroke-width': Math.max(1, w * 0.15) }, p);
}
// Wand 4 × 4 m mit Poster 3 × 2 m, perspektivisch als Skizze (Strich wie die App-Kamera)
const WALLP = { k: 0.26, wf: 0.35 };
function wallMap(x0, cy, hW) { const W = hW * WALLP.wf; return (a, b) => [x0 + W * a, cy + b * hW * (1 - WALLP.k * a)]; }
function posterSketch(p, x0, cy, hW, sk) {
  const ink = css('--fg'), paper = css('--bg-elev'), M = wallMap(x0, cy, hW);
  const P = (pa, pb) => M(0.125 + 0.75 * pa, pb * 0.5);
  const poly = (pts) => `${pts.map((q, i) => `${i ? 'L' : 'M'} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')} Z`;
  const quad = (F, a1, b1, a2, b2) => poly([F(a1, b1), F(a2, b1), F(a2, b2), F(a1, b2)]);
  const ell = (ac, bc, ra, rb) => { const q = []; for (let k = 0; k < 24; k++) { const t = k / 24 * 2 * Math.PI; q.push(P(ac + ra * Math.cos(t), bc + rb * Math.sin(t))); } return poly(q); };
  const g = mk('g', {}, p);
  mk('path', { d: quad(M, 0, -0.5, 1, 0.5), fill: 'none', stroke: ink, 'stroke-width': 2.2, 'stroke-linejoin': 'round', opacity: 0.75, filter: `url(#${sk})` }, g);
  for (const a of [0.06, 0.94]) mk('path', { d: `M ${M(a, -0.45)[0]} ${M(a, -0.45)[1]} L ${M(a, 0.45)[0]} ${M(a, 0.45)[1]}`, stroke: ink, 'stroke-width': 1, opacity: 0.25, filter: `url(#${sk}s)` }, g);
  mk('path', { d: quad(P, 0, -0.5, 1, 0.5), fill: paper, stroke: ink, 'stroke-width': 2.4, 'stroke-linejoin': 'round', filter: `url(#${sk})` }, g);
  const L = { fill: 'none', stroke: ink, 'stroke-width': 1.6, 'stroke-linejoin': 'round', filter: `url(#${sk}s)` };
  mk('path', { ...L, d: quad(P, 0.1, -0.385, 0.9, 0.385), 'stroke-width': 2 }, g);
  mk('path', { ...L, d: quad(P, 0.147, -0.33, 0.853, 0.17) }, g);
  mk('path', { ...L, d: quad(P, 0.147, -0.26, 0.853, -0.21), opacity: 0.7 }, g);
  mk('path', { ...L, d: quad(P, 0.3, -0.13, 0.7, 0.07) }, g);
  for (const ac of [0.373, 0.627]) { mk('path', { ...L, d: ell(ac, -0.03, 0.05, 0.075) }, g); mk('path', { ...L, d: ell(ac, -0.03, 0.017, 0.025) }, g); }
  mk('path', { ...L, d: poly([P(0.273, 0.385), P(0.313, 0.23), P(0.687, 0.23), P(0.727, 0.385)]) }, g);
}
// Poster von vorn: Kassette, schwarzweiß, allgemein gezeichnet
function posterFront(p, h) {
  const g = mk('g', { transform: `scale(${h})` }, p);
  mk('rect', { x: -0.75, y: -0.5, width: 1.5, height: 1, fill: '#d6d6d6' }, g);
  mk('rect', { x: -0.75, y: 0.18, width: 1.5, height: 0.32, fill: '#8c8c8c' }, g);
  mk('rect', { x: -0.6, y: -0.385, width: 1.2, height: 0.77, rx: 0.04, fill: '#2a2a2a' }, g);
  mk('rect', { x: -0.53, y: -0.33, width: 1.06, height: 0.5, rx: 0.02, fill: '#f2f2f2' }, g);
  mk('rect', { x: -0.53, y: -0.26, width: 1.06, height: 0.05, fill: '#555555' }, g);
  mk('rect', { x: -0.53, y: -0.2, width: 1.06, height: 0.03, fill: '#9a9a9a' }, g);
  mk('rect', { x: -0.3, y: -0.13, width: 0.6, height: 0.2, rx: 0.1, fill: '#141414' }, g);
  for (const cx of [-0.19, 0.19]) {
    mk('circle', { cx, cy: -0.03, r: 0.075, fill: '#4a4a4a' }, g);
    mk('circle', { cx, cy: -0.03, r: 0.04, fill: '#f0f0f0' }, g);
    mk('circle', { cx, cy: -0.03, r: 0.02, fill: '#141414' }, g);
  }
  mk('path', { d: 'M -0.34 0.385 L -0.28 0.23 L 0.28 0.23 L 0.34 0.385 Z', fill: '#3a3a3a' }, g);
  for (const cx of [-0.2, -0.08, 0.08, 0.2]) mk('circle', { cx, cy: 0.31, r: 0.018, fill: '#141414' }, g);
}

const SKETCH = (id) => `<filter id="${id}" x="-8%" y="-15%" width="116%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="7" result="n1"/><feDisplacementMap in="SourceGraphic" in2="n1" scale="5" xChannelSelector="R" yChannelSelector="G" result="a"/><feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="23" result="n2"/><feDisplacementMap in="SourceGraphic" in2="n2" scale="4" xChannelSelector="G" yChannelSelector="R" result="b"/><feComponentTransfer in="b" result="bf"><feFuncA type="linear" slope="0.5"/></feComponentTransfer><feMerge><feMergeNode in="bf"/><feMergeNode in="a"/></feMerge></filter><filter id="${id}s" x="-15%" y="-25%" width="130%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter>`;

let uid = 0;

/**
 * Legt Seitenansicht und Mattscheiben-Ansicht an. → { side, front, draw(S) }.
 * S = { mode: 'lens'|'pin', f, d, g, s, N, fmt, poster, sun, labels }. draw liefert die Werte für die Anzeige.
 */
export function createFocusSim(t) {
  const id = `fz${++uid}`;
  const side = mk('svg', { class: 'focus-svg focus-side', viewBox: `0 0 ${VW} 700`, role: 'img', 'aria-label': t('calc.focus.sideLabel') });
  const front = mk('svg', { class: 'focus-svg focus-front', viewBox: '0 0 616 330', role: 'img', 'aria-label': t('calc.focus.frontTitle') });

  function draw(S) {
    const fmt = FOCUS_FORMATS[S.fmt], fmtName = t(`calc.focus.formats.${S.fmt}`);
    const f = S.f, s = S.s, pin = S.mode === 'pin';
    const fg = css('--fg'), muted = css('--fg-muted'), border = css('--border'), accent = css('--accent'), lens = css('--info'), ok = css('--success');
    const txt = (p, x, y, str, a) => { const e = mk('text', { x, y, ...a }, p); e.textContent = str; return e; };
    const L = (k, v) => t(`calc.focus.svg.${k}`, v);

    // Ein Raum, ein Maßstab: Poster am linken, Wand am rechten Rand
    const SR = (VW - 90) / (POSTER_DIST + WALL_DIST), V = 1170 / (POSTER_DIST + WALL_DIST) * 480 / 130;
    const LX = VW - 40 - WALL_DIST * SR;
    const Vfront = pin ? V : 480 / f;
    const xL = (d) => d * SR;
    const xC = (d) => Math.min(xL(d), LX - 50);
    const D = pin ? S.d : f / S.N, LA = (D / 2) * V;

    const sv = side;
    sv.innerHTML = `<defs>${SKETCH(`${id}sk`)}</defs>`;
    sv.classList.toggle('nolabels', !S.labels);
    mk('line', { x1: 10, y1: CY, x2: VW - 10, y2: CY, stroke: border, 'stroke-dasharray': '8 8', 'stroke-width': 2 }, sv);
    if (S.sun) {
      mk('circle', { cx: VW - 70, cy: 62, r: 26, fill: C.sun }, sv);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; mk('line', { x1: VW - 70 + Math.cos(a) * 35, y1: 62 + Math.sin(a) * 35, x2: VW - 70 + Math.cos(a) * 48, y2: 62 + Math.sin(a) * 48, stroke: C.sun, 'stroke-width': 4, 'stroke-linecap': 'round' }, sv); }
      txt(sv, VW - 132, 72, L('sun'), { fill: C.sun, 'font-size': fz(30), 'text-anchor': 'end' });
    }

    // Lineal
    const RY = 668;
    mk('line', { x1: 30, y1: RY, x2: VW - 20, y2: RY, stroke: border, 'stroke-width': 2 }, sv);
    const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
    const step = nice.find((v) => v * SR >= 90) || 5000;
    for (let d = 0; LX + d * SR <= VW - 20; d += step) mk('line', { x1: LX + d * SR, y1: RY - 8, x2: LX + d * SR, y2: RY + 8, stroke: muted, 'stroke-width': 2 }, sv);
    for (let d = step; LX - d * SR >= 30; d += step) mk('line', { x1: LX - d * SR, y1: RY - 8, x2: LX - d * SR, y2: RY + 8, stroke: muted, 'stroke-width': 2 }, sv);
    txt(sv, 34, RY - 16, L('ruler', { p: len(POSTER_DIST), w: len(WALL_DIST) }), { fill: muted, 'font-size': fz(24) });
    txt(sv, VW - 20, RY - 16, L('tick', { v: len(step) }), { fill: muted, 'font-size': fz(24), 'text-anchor': 'end' });

    // Linse oder Lochblende
    if (pin) {
      mk('rect', { x: LX - 4, y: CY - 200, width: 8, height: Math.max(0, 200 - LA), fill: C.stop }, sv);
      mk('rect', { x: LX - 4, y: CY + LA, width: 8, height: Math.max(0, 200 - LA), fill: C.stop }, sv);
      txt(sv, LX, CY - 214, L('hole', { d: de(S.d, 1) }), { 'text-anchor': 'middle', 'font-size': fz(30), fill: fg });
    } else {
      const LH = Math.max(LMAX, LA + 8);
      const lr = (150 + 260 * clamp(Math.log(f / 6) / Math.log(100), 0, 1)) * LH / LMAX;
      mk('path', { d: `M ${LX} ${CY - LH} A ${lr} ${lr} 0 0 1 ${LX} ${CY + LH} A ${lr} ${lr} 0 0 1 ${LX} ${CY - LH} Z`, fill: lens, 'fill-opacity': 0.18, stroke: lens, 'stroke-width': 3 }, sv);
      if (LA < LH - 2) { mk('line', { x1: LX, y1: CY - LH - 10, x2: LX, y2: CY - LA, stroke: fg, 'stroke-width': 6 }, sv); mk('line', { x1: LX, y1: CY + LA, x2: LX, y2: CY + LH + 10, stroke: fg, 'stroke-width': 6 }, sv); }
      for (const [x1, y1, x2, y2] of [[LX - 34, CY - LA, LX - 34, CY + LA], [LX - 42, CY - LA, LX - 26, CY - LA], [LX - 42, CY + LA, LX - 26, CY + LA]]) mk('line', { x1, y1, x2, y2, stroke: muted, 'stroke-width': 2 }, sv);
      txt(sv, LX, CY - LH - 26, L('lens', { f: de(f, f < 10 ? 1 : 0) }), { 'text-anchor': 'middle', 'font-size': fz(30), fill: fg });
      txt(sv, LX, CY + LH + 50, L('opening', { n: fN(S.N), d: len(f / S.N) }), { 'text-anchor': 'middle', 'font-size': fz(28), fill: muted });
      if (S.labels) { // Brennpunkte F und F′ schalten mit der Beschriftung
        if (LX + f * SR < VW - 20) { mk('line', { x1: LX + f * SR, y1: CY - 10, x2: LX + f * SR, y2: CY + 10, stroke: muted, 'stroke-width': 3 }, sv); txt(sv, LX + f * SR, CY + 44, 'F′', { fill: muted, 'font-size': fz(26), 'text-anchor': 'middle' }); }
        if (f >= 50) { const xf = LX - xL(f); mk('line', { x1: xf, y1: CY - 10, x2: xf, y2: CY + 10, stroke: muted, 'stroke-width': 3 }, sv); txt(sv, xf, CY + 44, 'F', { fill: muted, 'font-size': fz(26), 'text-anchor': 'middle' }); }
      }
    }

    // Schärfentiefe
    const coc = circleOfConfusion(fmt);
    let DOF = null, zoneDraw = null;
    if (!pin && s > f * 1.0005 && S.g > f * 1.001) {
      DOF = depthOfField(f, S.N, s, coc);
      const { near, far, bMin, bMax } = DOF;
      zoneDraw = () => {
        const xn = LX - xC(near), xf = isFinite(far) ? LX - xC(far) : 20;
        mk('rect', { x: Math.min(xf, xn), y: 120, width: Math.max(3, Math.abs(xn - xf)), height: 420, fill: ok, opacity: 0.13 }, sv);
        mk('line', { x1: xn, y1: 120, x2: xn, y2: 540, stroke: ok, 'stroke-width': 2, 'stroke-dasharray': '8 6', opacity: 0.8 }, sv);
        if (isFinite(far)) mk('line', { x1: xf, y1: 120, x2: xf, y2: 540, stroke: ok, 'stroke-width': 2, 'stroke-dasharray': '8 6', opacity: 0.8 }, sv);
        txt(sv, clamp((xn + xf) / 2, 250, LX - 250), 104, L('sharp', { r: rangeTxt(near, far) }), { fill: ok, 'font-size': fz(30), 'text-anchor': 'middle' });
        const x1 = LX + bMin * SR, x2 = Math.min(VW - 10, LX + (isFinite(bMax) ? bMax : 1e9) * SR);
        mk('rect', { x: x1, y: CY - Math.min(fmt.h * V / 2, 300), width: Math.max(2, x2 - x1), height: Math.min(fmt.h * V, 600), fill: ok, opacity: 0.16 }, sv);
        const by = CY + OH / 2 + 78, l = Math.min(xf, xn), r = Math.max(xf, xn), w = Math.max(6, r - l), m = (l + r) / 2;
        mk('line', { x1: m - w / 2, y1: by, x2: m + w / 2, y2: by, stroke: ok, 'stroke-width': 8 }, sv);
        mk('line', { x1: m - w / 2, y1: by - 14, x2: m - w / 2, y2: by + 14, stroke: ok, 'stroke-width': 3 }, sv);
        mk('line', { x1: m + w / 2, y1: by - 14, x2: m + w / 2, y2: by + 14, stroke: ok, 'stroke-width': 3 }, sv);
        if (!isFinite(far)) txt(sv, l + 4, by - 14, L('toInf'), { fill: ok, 'font-size': fz(24) });
      };
    }

    // Motive links
    const objs = [];
    const ox = LX - xC(S.g);
    if (S.poster) {
      const hW = TH * 2, x0 = 40, M = wallMap(x0, CY, hW), xTrue = LX - xC(POSTER_DIST);
      posterSketch(sv, x0, CY, hW, `${id}sk`);
      mk('path', { d: `M ${xTrue} ${CY - 9} L ${xTrue + 8} ${CY} L ${xTrue} ${CY + 9} L ${xTrue - 8} ${CY} Z`, fill: C.poster }, sv);
      txt(sv, 34, M(0, -0.5)[1] - 46, L('wallPoster', { d: len(POSTER_DIST) }), { fill: C.poster, 'font-size': fz(26) });
      const pt = M(0.5, -0.25), pb = M(0.5, 0.25);
      objs.push({ g: POSTER_DIST, x: pt[0], pts: [[-0.5, C.posterTop], [0.5, C.posterBot]], H: POSTER_H, h: pb[1] - pt[1], poster: true });
    }
    if (S.sun) for (const [tx, ty] of [[0.02, -0.4], [0.18, -0.05], [0.1, 0.3]]) mk('line', { x1: VW - 100, y1: 84, x2: ox + tx * OH, y2: CY + ty * OH, stroke: C.sun, 'stroke-width': 2, opacity: 0.35, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round' }, sv);
    const OHd = FIG * V;
    statueSide(sv, ox, CY, OHd);
    txt(sv, clamp(ox, 70, LX - 90), CY + OHd / 2 + 44, L('subject'), { fill: C.warm, 'font-size': fz(28), 'text-anchor': 'middle' });
    objs.push({ g: S.g, x: ox, pts: [[-0.44, C.rayTop, 0.01], [-0.05, C.rayHand, 0.19], [0.5, C.rayFoot, 0]], H: FIG, h: OHd, poster: false });

    // Wand (steht immer 2 m hinter Loch bzw. Linse)
    const sx = LX + s * SR;
    if (S.fmt !== 'wall') {
      const xw = LX + WALL_DIST * SR;
      mk('line', { x1: xw, y1: 24, x2: xw, y2: 630, stroke: muted, 'stroke-width': 3, opacity: 0.35 }, sv);
      txt(sv, xw - 12, 52, L('wall'), { fill: muted, 'font-size': fz(24), 'text-anchor': 'end' });
    }

    const FH = fmt.h * V, top = CY - FH / 2, bot = CY + FH / 2, VT = 24, VB = 630;
    const res = [];
    const sdefs = mk('defs', {}, sv), imgLayer = mk('g', {}, sv); let imgHalf = 0;
    const Neff = effectiveAperture({ pinhole: pin, f, N: S.N, d: S.d, s });
    const bright = brightOf(Neff);
    for (const o of objs) {
      const g = o.g, b = pin ? Infinity : imageDistance(f, g), virt = !pin && g < f, lim = !pin && Math.abs(g - f) < f * 1e-3;
      const blur = pin ? D * (g + s) / g : (virt || lim) ? Infinity : D * Math.abs(s - b) / b;
      const m = pin ? s / g : (virt || lim) ? 0 : b / g;
      res.push({ poster: o.poster, H: o.H, b, blur, m, sharp: !pin && blur <= coc, virt, lim });
      if (!virt && !lim && m > 0) { // Bild auf der Mattscheibe im Schnitt, auf das Format beschnitten
        const hpx = o.H * m * V, fid = `${id}${o.poster ? 'p' : 'c'}`;
        imgHalf = Math.max(imgHalf, Math.min(hpx / 2, bot - CY));
        const fl = mk('filter', { id: fid, x: '-50%', y: '-50%', width: '200%', height: '200%' }, sdefs);
        mk('feGaussianBlur', { stdDeviation: Math.min(blur * V / 2.5, 30) }, fl);
        const cp = mk('clipPath', { id: `${fid}c` }, sdefs);
        const half = Math.max(hpx * 0.65, 14), cl = Math.max(LX + 10, sx - half);
        mk('rect', { x: cl, y: Math.max(top, 0), width: Math.max(0, sx + half - cl), height: Math.max(0, Math.min(bot, 700) - Math.max(top, 0)) }, cp);
        const gi = mk('g', { 'clip-path': `url(#${fid}c)`, opacity: (0.85 * bright).toFixed(3) }, imgLayer);
        const gb = mk('g', { filter: `url(#${fid})` }, gi);
        const gf = mk('g', { transform: `translate(0 ${2 * CY}) scale(1 -1)` }, gb);
        if (o.poster) posterEdge(gf, sx, CY, hpx); else statueSide(gf, sx, CY, hpx);
      }
      for (const [u, col, dxu] of o.pts) {
        const hmm = -u * o.H;
        const sxp = o.x + (dxu || 0) * o.h, syp = CY + u * o.h;
        const R = mk('g', { stroke: col, 'stroke-width': 2.4, fill: 'none' }, sv);
        const hits = [];
        for (const e of [-LA, LA]) {
          mk('line', { x1: sxp, y1: syp, x2: LX, y2: CY + e, opacity: 0.85 }, R);
          let dy;
          if (pin) dy = (e + hmm * V) / (g * SR);
          else if (lim) dy = hmm * V / (f * SR);
          else if (virt) { const bv = 1 / (1 / g - 1 / f), vx = LX - bv * SR, vy = CY - hmm * (bv / g) * V; dy = (CY + e - vy) / (LX - vx); }
          else dy = (CY + hmm * m * V - (CY + e)) / (b * SR);
          const y = (x) => CY + e + dy * (x - LX);
          if (virt) mk('line', { x1: LX, y1: CY + e, x2: LX - 520, y2: y(LX - 520), opacity: 0.35, 'stroke-dasharray': '10 8', 'stroke-width': 2 }, R);
          mk('line', { x1: LX, y1: CY + e, x2: sx, y2: y(sx), opacity: 0.9 }, R);
          mk('line', { x1: sx, y1: y(sx), x2: VW - 10, y2: y(VW - 10), opacity: 0.16 }, R);
          hits.push(y(sx));
        }
        const a1 = Math.min(...hits), a2 = Math.max(...hits);
        if (!(a2 < top || a1 > bot)) {
          const c1 = clamp(a1, top, bot), c2 = clamp(a2, top, bot);
          if (c2 - c1 < 3) mk('circle', { cx: sx, cy: (c1 + c2) / 2, r: 8, fill: col, stroke: '#000', 'stroke-width': 2 }, sv);
          else mk('line', { x1: sx, y1: c1, x2: sx, y2: c2, stroke: col, 'stroke-width': 12, 'stroke-linecap': 'round' }, sv);
        }
      }
    }
    if (zoneDraw) zoneDraw();

    // Bildebene: Zeichen ISO 7000-0856 wie im focus-Logo
    if (!pin && S.g > f * 1.001) {
      const b = imageDistance(f, S.g), xb = LX + b * SR;
      const Ds = 30, sw = Ds * 0.077, Ls = Ds * 2.88, yb = 596;
      if (xb < VW - 25) {
        mk('line', { x1: xb, y1: 118, x2: xb, y2: yb - Ls / 2 - 6, stroke: fg, 'stroke-width': 1.5, 'stroke-dasharray': '3 7', opacity: 0.55 }, sv);
        mk('circle', { cx: xb, cy: yb, r: (Ds - sw) / 2, fill: 'none', stroke: fg, 'stroke-width': sw }, sv);
        mk('line', { x1: xb, y1: yb - Ls / 2, x2: xb, y2: yb + Ls / 2, stroke: fg, 'stroke-width': sw }, sv);
        const label = L('imagePlane', { d: len(b) }), right = xb + 28 + 16 * FS * label.length < VW - 10;
        txt(sv, right ? xb + 28 : xb - 28, yb + 10, label, { fill: fg, 'font-size': fz(28), 'text-anchor': right ? 'start' : 'end' });
      } else txt(sv, VW - 20, 596, L('imagePlaneFar', { d: len(b) }), { fill: fg, 'font-size': fz(28), 'text-anchor': 'end' });
    }
    // Fokusebene: die Ebene vor der Linse, die genau auf der Mattscheibe scharf wird
    if (!pin && s > f * 1.0005) {
      const gF = 1 / (1 / f - 1 / s), xF = LX - xC(gF);
      mk('line', { x1: xF, y1: 118, x2: xF, y2: 560, stroke: fg, 'stroke-width': 3, opacity: 0.9 }, sv);
      txt(sv, clamp(xF, 220, LX - 220), 600, L('focusPlane', { d: gF > 30000 ? '∞' : len(gF) }), { fill: fg, 'font-size': fz(28), 'text-anchor': 'middle' });
    }
    if (res.some((q) => q.virt && !q.poster)) { // Auge hinter der Lupe
      const ex = VW - 70, ey = CY;
      mk('path', { d: `M ${ex - 34} ${ey} Q ${ex} ${ey - 26} ${ex + 34} ${ey} Q ${ex} ${ey + 26} ${ex - 34} ${ey} Z`, fill: 'none', stroke: fg, 'stroke-width': 3 }, sv);
      mk('circle', { cx: ex - 10, cy: ey, r: 11, fill: fg }, sv);
      txt(sv, ex, ey + 64, L('eye'), { fill: fg, 'font-size': fz(26), 'text-anchor': 'middle' });
      txt(sv, LX - 300, CY - 210, L('virtual'), { fill: muted, 'font-size': fz(26), 'text-anchor': 'middle' });
    }
    // Mattscheibe
    const lt = Math.max(top, VT), lb = Math.min(bot, VB);
    mk('line', { x1: sx, y1: lt, x2: sx, y2: lb, stroke: accent, 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0.95 }, sv);
    if (top < VT) mk('path', { d: `M ${sx - 11} ${VT + 14} L ${sx} ${VT} L ${sx + 11} ${VT + 14}`, fill: 'none', stroke: accent, 'stroke-width': 4 }, sv);
    if (bot > VB) mk('path', { d: `M ${sx - 11} ${VB - 14} L ${sx} ${VB} L ${sx + 11} ${VB - 14}`, fill: 'none', stroke: accent, 'stroke-width': 4 }, sv);
    const sl = L('screen', { fmt: fmtName }), right = sx + 20 + sl.length * 15 * FS < VW - 10;
    txt(sv, right ? sx + 20 : sx - 20, Math.min(Math.max(bot, CY + 40, CY + imgHalf + 40), VB - 110), sl, { fill: accent, 'font-size': fz(30), 'text-anchor': right ? 'start' : 'end' });

    drawFront(res, fmt, Vfront, Neff, bright);
    return { res, DOF, coc, Neff, fmtName, fmt, pin, gFocus: !pin && s > f * 1.0005 ? 1 / (1 / f - 1 / s) : null };
  }

  // Blick auf die Mattscheibe: gleiches Bild, anderes Format = anderer Rahmen; um 180° gedreht
  function drawFront(res, fmt, V, Neff, bright) {
    const fv = front;
    const W = 616, H = 330, P = 1.34 * V;
    let fw = fmt.w * P, fh = fmt.h * P, x0 = (W - fw) / 2, y0 = (H - fh) / 2, cut = false;
    if (x0 < 8) { x0 = 8; fw = W - 16; cut = true; }
    if (y0 < 8) { y0 = 8; fh = H - 16; cut = true; }
    fv.innerHTML = '';
    const defs = mk('defs', {}, fv);
    const blurId = (k) => `${id}fb${k}`;
    for (const k of ['c', 'p']) { const fl = mk('filter', { id: blurId(k), x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs); mk('feGaussianBlur', { id: `${blurId(k)}g`, stdDeviation: 0 }, fl); }
    const cp = mk('clipPath', { id: `${id}fclip` }, defs);
    mk('rect', { x: x0, y: y0, width: fw, height: fh }, cp);
    mk('rect', { x: 0, y: 0, width: W, height: H, fill: css('--viewfinder') }, fv);
    const ghost = mk('g', { opacity: (0.22 * bright).toFixed(3) }, fv);
    mk('rect', { x: x0, y: y0, width: fw, height: fh, fill: C.ground }, fv);
    const img = mk('g', { 'clip-path': `url(#${id}fclip)`, opacity: bright }, fv);
    mk('rect', { x: x0, y: y0, width: fw, height: fh, fill: C.sky }, img);
    for (const layer of [ghost, img]) for (const q of res) {
      const k = q.poster ? 'p' : 'c';
      defs.querySelector(`#${blurId(k)}g`).setAttribute('stdDeviation', !isFinite(q.blur) ? 40 : Math.min(q.blur * P / 2.5, 40));
      if (q.virt || q.lim) { if (layer === img) mk('rect', { x: x0, y: y0, width: fw, height: fh, fill: C.veil, opacity: 0.25, filter: `url(#${blurId(k)})` }, img); continue; }
      const h = q.H * q.m * P;
      const g = mk('g', { transform: `translate(${W / 2} ${H / 2}) rotate(180)`, filter: `url(#${blurId(k)})` }, layer);
      if (q.poster) posterFront(g, h); else statueFront(g, h);
    }
    mk('rect', { x: x0, y: y0, width: fw, height: fh, fill: 'none', stroke: css('--accent'), 'stroke-width': 3, 'stroke-dasharray': cut ? '10 8' : 'none' }, fv);
  }

  return { side, front, draw };
}
