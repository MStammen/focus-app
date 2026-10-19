// Stilisierte Kamera, datengetrieben aus core/exposure.js und data/camera-modes.json. Vier Bauweisen (Spec 13.1/13.2):
//   pasm    – Modusrad, zwei Einstellräder (Canon, Nikon, Sony, Pentax, Olympus, Panasonic)
//   dials   – Zeitenrad und ISO-Rad mit A-Stellung, Blende am Objektivring (Fujifilm, Leica)
//   phone   – Bildschirm statt Räder, feste Blende (iPhone, Android)
//   pinhole – Kasten mit Loch und Klappe, alles fest
// Ansicht: von hinten oben (Sicht des Fotografen), ohne Objektiv. Wo Räder und Tasten sitzen, kommt aus brand.body
// (Vorbild je Marke, z. B. Canon EOS R6). Jedes Bedienteil trägt data-part, damit „Wo finde ich was?“ es zeigen kann.
// API: cameraDials(opts) → { el, update(values), setBrand(brand), setLayout(layout), setLive(node), parts(), highlight(id, name) }
//      highlight(id, name): Teil hervorheben und seinen Namen als Schild direkt daneben zeigen (null = aus).
// Alle Farben über Klassen und Tokens (css/base.css, Abschnitt „Kamera“).
import { standardSeries, formatShutter, formatAperture } from '../core/exposure.js';

const NS = 'http://www.w3.org/2000/svg';
const CONCEPTS = ['program', 'aperturePriority', 'shutterPriority', 'manual', 'bulb'];
const FALLBACK = { program: 'P', aperturePriority: 'A', shutterPriority: 'S', manual: 'M', bulb: 'B' };

function svgEl(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const c of children) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}
const de = (s) => s.replace('.', ',');
function shortLabel(text, id) {
  if (!text) return FALLBACK[id];
  const first = text.split(/[ ,:/(]/)[0];
  return first.length <= 5 && /^[A-Za-z]+$/.test(first) ? first : FALLBACK[id];
}
const polar = (cx, cy, r, deg) => [cx + Math.cos((deg - 90) * Math.PI / 180) * r, cy + Math.sin((deg - 90) * Math.PI / 180) * r];

/** Geriffelter Radrand: viele kurze Striche zwischen r1 und r2. */
function knurl(cx, cy, r1, r2, count, cls = 'cam-knurl') {
  const g = svgEl('g', { class: cls });
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 360;
    const [x1, y1] = polar(cx, cy, r1, a); const [x2, y2] = polar(cx, cy, r2, a);
    g.appendChild(svgEl('line', { x1, y1, x2, y2 }));
  }
  return g;
}

// ================= Bausteine =================
const K = 0.4; // Verkürzung der Kreise auf der Deckkappe
const PF = 30, PN = 68, BOT = 198; // Deckkappe hinten (fern) / vorn (nah), Unterkante Rückseite

/** Filter für den Strichstil: verschiebt die Umrisse ein wenig, damit sie wie von Hand gezeichnet wirken. */
function sketchFilter() {
  // Große Umrisse: zwei Striche mit verschiedenem Rauschen übereinander, der zweite blasser (Skizzen-Doppelstrich)
  const big = svgEl('filter', { id: 'cam-sketch', x: '-8%', y: '-15%', width: '116%', height: '130%' });
  big.append(
    svgEl('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.028', numOctaves: '2', seed: '7', result: 'n1' }),
    svgEl('feDisplacementMap', { in: 'SourceGraphic', in2: 'n1', scale: '5', xChannelSelector: 'R', yChannelSelector: 'G', result: 'a' }),
    svgEl('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.045', numOctaves: '2', seed: '23', result: 'n2' }),
    svgEl('feDisplacementMap', { in: 'SourceGraphic', in2: 'n2', scale: '4', xChannelSelector: 'G', yChannelSelector: 'R', result: 'b' }),
    svgEl('feComponentTransfer', { in: 'b', result: 'bf' }, [svgEl('feFuncA', { type: 'linear', slope: '0.5' })]),
    svgEl('feMerge', {}, [svgEl('feMergeNode', { in: 'bf' }), svgEl('feMergeNode', { in: 'a' })]),
  );
  // Kleine Teile (Räder, Tasten): nur ein Strich, weniger Ausschlag, damit sie rund und erkennbar bleiben
  const small = svgEl('filter', { id: 'cam-sketch-s', x: '-15%', y: '-25%', width: '130%', height: '150%' });
  small.append(
    svgEl('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.06', numOctaves: '2', seed: '11', result: 'n' }),
    svgEl('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '1.8', xChannelSelector: 'R', yChannelSelector: 'G' }),
  );
  return svgEl('defs', {}, [big, small]);
}

/** Bedienteil-Gruppe mit Kennung für „Wo finde ich was?“. */
function partGroup(ctx, kind, { key = '', label = '', cls = '' } = {}) {
  const id = key ? `${kind}:${key}` : kind;
  const g = svgEl('g', { class: `cam-part ${cls}`.trim(), 'data-part': id });
  ctx.parts.push({ id, kind, key, label });
  return g;
}

/** Zylinder von oben: Seitenband mit Riffelung, Deckfläche als Ellipse. */
function cylinder(g, cx, cy, r, h, { side = 'cam-dial-rim', top = 'cam-dial-face', knurlCount = 28 } = {}) {
  const ry = r * K;
  g.appendChild(svgEl('path', { d: `M${cx - r} ${cy} L${cx - r} ${cy + h} A${r} ${ry} 0 0 0 ${cx + r} ${cy + h} L${cx + r} ${cy} A${r} ${ry} 0 0 1 ${cx - r} ${cy} Z`, class: side }));
  if (h > 2 && knurlCount) {
    const kg = svgEl('g', { class: 'cam-knurl' });
    for (let i = 1; i < knurlCount; i++) {
      const t = (i / knurlCount) * Math.PI; const x = cx + r * Math.cos(t); const y = cy + ry * Math.sin(t);
      kg.appendChild(svgEl('line', { x1: x, y1: y + 0.5, x2: x, y2: y + h - 0.5 }));
    }
    g.appendChild(kg);
  }
  g.appendChild(svgEl('ellipse', { cx, cy, rx: r, ry, class: top }));
  return ry;
}

/** Rad auf der Deckkappe mit Gravur. Der eingestellte Wert steht vorn, zum Betrachter hin, an der Marke. */
function topDial(g, { cx, cy, r, h, series, format, label, withAuto = false, degPerStop = 34, posOf = Math.log2 }) {
  g.classList.add('cam-dial');
  const ry = cylinder(g, cx, cy, r, h);
  g.appendChild(svgEl('ellipse', { cx, cy, rx: r * 0.42, ry: r * 0.42 * K, class: 'cam-dial-hub' }));
  if (label) g.appendChild(svgEl('text', { x: cx, y: cy - ry - 4, class: 'cam-dial-name', 'text-anchor': 'middle' }, [label]));
  const labels = svgEl('g'); g.appendChild(labels);
  const my = cy + ry + h + 2;
  g.appendChild(svgEl('path', { d: `M${cx - 4} ${my + 6} L${cx + 4} ${my + 6} L${cx} ${my} Z`, class: 'cam-marker' }));
  const items = series.map((v) => ({ v, txt: svgEl('text', { class: 'cam-tick', 'text-anchor': 'middle' }, [format(v)]), pos: posOf(v) }));
  if (withAuto) items.push({ auto: true, txt: svgEl('text', { class: 'cam-tick auto', 'text-anchor': 'middle' }, ['A']), pos: posOf(series[series.length - 1]) + 1.2 });
  for (const it of items) labels.appendChild(it.txt);
  const R = r - 4;
  const fontBase = r < 20 ? 6 : 7;
  function update(value, auto = false) {
    const cur = auto && withAuto ? items[items.length - 1].pos : posOf(value);
    for (const it of items) {
      const phi = (90 + (it.pos - cur) * degPerStop) * Math.PI / 180;
      const s = Math.sin(phi), co = Math.cos(phi);
      const visible = s > 0.05 && Math.abs((it.pos - cur) * degPerStop) < 95;
      const x = cx + R * co, y = cy + R * K * s;
      const size = 0.8 + 0.35 * s;
      const rot = Math.atan2(-R * K * co, R * s) * 180 / Math.PI * 0.5;
      it.txt.setAttribute('x', x); it.txt.setAttribute('y', y + 2.5);
      it.txt.setAttribute('transform', `rotate(${rot} ${x} ${y})`);
      it.txt.style.fontSize = `${(fontBase * size).toFixed(2)}px`;
      it.txt.style.opacity = visible ? String(Math.max(0.45, s)) : '0';
      it.txt.classList.toggle('current', Math.abs(it.pos - cur) < 0.01);
    }
  }
  return { update };
}

/** Daumenrad hinten an der Oberkante: liegende Walze, Rillen wandern mit dem Wert. */
function thumbWheel(g, x, y, w, h, label) {
  g.classList.add('cam-cmd');
  g.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 3, class: 'cam-dial-rim' }));
  const ridges = svgEl('g', { class: 'cam-knurl' }); g.appendChild(ridges);
  const n = 11; for (let i = 0; i < n; i++) ridges.appendChild(svgEl('line'));
  const name = svgEl('text', { x: x + w / 2, y: y + h + 9, class: 'cam-dial-name', 'text-anchor': 'middle' }, [label || '']);
  g.appendChild(name);
  return {
    name,
    update(pos) {
      const off = ((pos * 3) % (w / n) + w / n) % (w / n);
      [...ridges.children].forEach((ln, i) => {
        const lx = x + 2 + off + i * (w / n);
        ln.setAttribute('x1', lx); ln.setAttribute('x2', lx); ln.setAttribute('y1', y + 2); ln.setAttribute('y2', y + h - 2);
        ln.style.opacity = lx < x + w - 1 ? '1' : '0';
      });
    },
  };
}

/** Einstellrad vorn am Griff: steht senkrecht, von hinten oben sieht man nur seine Oberkante hinter der Deckkappe. */
function gripWheel(g, x) {
  g.classList.add('cam-cmd');
  g.appendChild(svgEl('rect', { x: x - 13, y: PF - 9, width: 26, height: 12, rx: 4, class: 'cam-dial-rim' }));
  const kg = svgEl('g', { class: 'cam-knurl' });
  for (let i = 1; i < 9; i++) kg.appendChild(svgEl('line', { x1: x - 13 + i * 2.9, y1: PF - 7, x2: x - 13 + i * 2.9, y2: PF + 1 }));
  g.appendChild(kg);
}

/** Großes Rad auf der Rückseite (Schnellwahlrad, Steuerrad) mit Taste in der Mitte. */
function rearRing(g, cx, cy, R, center) {
  g.classList.add('cam-cmd');
  g.appendChild(svgEl('circle', { cx, cy, r: R, class: 'cam-dial-rim' }));
  g.appendChild(knurl(cx, cy, R - 4, R - 0.5, 36));
  g.appendChild(svgEl('circle', { cx, cy, r: R - 5, class: 'cam-dial-face' }));
  g.appendChild(svgEl('circle', { cx, cy, r: 6.5, class: 'cam-btn' }));
  if (center) g.appendChild(svgEl('text', { x: cx, y: cy + 2, class: 'cam-btn-text tiny', 'text-anchor': 'middle' }, [center]));
}

/** Steuerkreuz / Wähltaste mit OK in der Mitte. */
function pad(g, cx, cy, R) {
  g.appendChild(svgEl('circle', { cx, cy, r: R, class: 'cam-btn' }));
  for (const a of [0, 90, 180, 270]) {
    const [x, y] = polar(cx, cy, R - 4, a);
    g.appendChild(svgEl('path', { d: 'M-2.5 1.5 L2.5 1.5 L0 -2 Z', transform: `translate(${x} ${y}) rotate(${a})`, class: 'cam-pad-arrow' }));
  }
  g.appendChild(svgEl('circle', { cx, cy, r: 6.5, class: 'cam-btn' }));
  g.appendChild(svgEl('text', { x: cx, y: cy + 2, class: 'cam-btn-text tiny', 'text-anchor': 'middle' }, ['OK']));
}

function joystick(g, cx, cy) {
  g.appendChild(svgEl('circle', { cx, cy, r: 9, class: 'cam-btn' }));
  g.appendChild(svgEl('circle', { cx, cy, r: 4, class: 'cam-dial-hub' }));
}

/** Taste auf der Rückseite: Kapsel, breit genug für die Beschriftung. */
function rearButton(svg, ctx, x, y, label) {
  const g = partGroup(ctx, 'button', { key: label });
  const w = Math.max(14, label.length * 4.4 + 6);
  g.appendChild(svgEl('rect', { x: x - w / 2, y: y - 6.5, width: w, height: 13, rx: 6.5, class: 'cam-btn' }));
  g.appendChild(svgEl('text', { x, y: y + 2.3, class: 'cam-btn-text', 'text-anchor': 'middle' }, [label]));
  svg.appendChild(g);
}

/** Taste auf der Deckkappe: flache Ellipse. */
function topButton(svg, ctx, x, y, label) {
  const g = partGroup(ctx, 'button', { key: label });
  const want = label.length * 2.4 + 3;
  const rx = Math.min(14, Math.max(6.5, want)); // nicht breiter, sonst ragt z. B. „AF·DRIVE“ ins Schulterdisplay
  g.appendChild(svgEl('ellipse', { cx: x, cy: y, rx: rx + 3, ry: 8, class: 'cam-hit' })); // größere Tippfläche
  g.appendChild(svgEl('ellipse', { cx: x, cy: y, rx, ry: 4, class: 'cam-btn' }));
  g.appendChild(svgEl('text', { x, y: y + 1.8, class: 'cam-btn-text tiny', 'text-anchor': 'middle', ...(want > rx ? { textLength: 2 * rx - 5, lengthAdjust: 'spacingAndGlyphs' } : {}) }, [label]));
  svg.appendChild(g);
}

function shutterButton(svg, ctx, x, y) {
  const g = partGroup(ctx, 'shutterButton');
  cylinder(g, x, y, 6.5, 3, { side: 'cam-release-rim', top: 'cam-release', knurlCount: 0 });
  svg.appendChild(g);
}

/** Sucherbuckel in der Mitte (Spiegellose, Spiegelreflex) oder Sucherfenster links (Messsucher). */
function viewfinder(svg, ctx, where, classic) {
  if (where === 'none') {
    return; // ohne Blitzschuh (vom Kursleiter gestrichen)
  }
  if (where === 'left') {
    // Sucher links außen sitzt auf der Rückwand: erst nach ihr zeichnen
    ctx.afterRear.push(() => {
      const g = partGroup(ctx, 'viewfinder');
      g.append(svgEl('rect', { x: 46, y: 72, width: 36, height: 16, rx: 8, class: 'cam-eyecup' }), svgEl('rect', { x: 51, y: 75, width: 26, height: 10, rx: 5, class: 'cam-window' }));
      svg.appendChild(g);
    });
    return;
  }
  // Prismenbuckel nach Skizze des Kursleiters (Skizzenblock, 2026-10-16): Kasten in Schrägansicht auf der Oberseite.
  // Alle Tiefenkanten laufen parallel (Richtung D), alle Ecken treffen genau aufeinander; daher nur der milde Strich.
  const D = [14, -22];                       // Tiefe: nach hinten oben
  const BL = [122, PN], BR = [186, PN];      // Vorderfläche unten, bündig mit der Kante zur Rückwand
  const TL = [130, 33], TR = [182, 33];      // Vorderfläche oben
  const add = (p, k = 1) => [p[0] + D[0] * k, p[1] + D[1] * k];
  const pt = (p) => p.join(' ');
  // Außenumriss als ein Pfad mit runden Ecken; die inneren Kanten setzen genau auf der Mitte der Rundungen an
  const silhouette = [[BL, 0], [TL, 17], [add(TL), 7], [add(TR), 7], [add(BR), 5], [BR, 0]];
  const mid = {};
  let d = '';
  silhouette.forEach(([p, rad], i) => {
    const prev = silhouette[(i + silhouette.length - 1) % silhouette.length][0], next = silhouette[(i + 1) % silhouette.length][0];
    if (!rad) { d += `${i ? 'L' : 'M'}${pt(p)} `; mid[i] = p; return; }
    const toward = (q) => { const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy); return [p[0] + dx / len * rad, p[1] + dy / len * rad]; };
    const a = toward(prev), b = toward(next);
    d += `${i ? 'L' : 'M'}${pt(a)} Q${pt(p)} ${pt(b)} `;
    mid[i] = [0.25 * a[0] + 0.5 * p[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * p[1] + 0.25 * b[1]];
  });
  // Innere Ecke oben rechts an der Vorderfläche (Treffpunkt von drei Kanten) deutlich gerundet; die Dachkante setzt auf der Mitte der Rundung an
  const IR = 12;
  const along = (p, q, len) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [p[0] + dx / l * len, p[1] + dy / l * len]; };
  const innA = along(TR, TL, IR), innB = along(TR, BR, IR);
  const innMid = [0.25 * innA[0] + 0.5 * TR[0] + 0.25 * innB[0], 0.25 * innA[1] + 0.5 * TR[1] + 0.25 * innB[1]];
  const g = partGroup(ctx, 'viewfinder');
  g.append(
    svgEl('path', { d: d + 'Z', class: 'cam-vf' }),
    // Kante Vorderfläche/Dach, Kante Vorderfläche/Seite, Kante Dach/Seite
    svgEl('path', { d: `M${pt(mid[1])} L${pt(innA)} Q${pt(TR)} ${pt(innB)} L${pt(BR)} M${pt(innMid)} L${pt(mid[3])}`, class: 'cam-vf-edge' }),
    // Okularfenster
    svgEl('rect', { x: 140, y: 44, width: 34, height: 15, rx: 6, class: 'cam-window' }),
  );
  // zwei Schraffurlinien auf dem Dach, parallel zur Vorderkante
  const hatch = [0.35, 0.65].map((k) => { const a1 = add(TL, k), a2 = add(TR, k); return `M${a1[0] + 5} ${a1[1]} H${a2[0] - 12}`; }).join(' ');
  g.appendChild(svgEl('path', { d: hatch, class: 'cam-vf-hatch' }));
  svg.appendChild(g);
}

/** Belichtungsskala −2 … +2 mit wanderndem Zeiger. diff > 0: zu hell. */
function exposureScale(svg, sx, sy, step, { labels = false, cls = 'cam-lcd-scale' } = {}) {
  const g = svgEl('g', { class: cls });
  g.appendChild(svgEl('line', { x1: sx - 2 * step, y1: sy, x2: sx + 2 * step, y2: sy }));
  for (let i = -2; i <= 2; i++) {
    const x = sx + i * step;
    g.appendChild(svgEl('line', { x1: x, y1: sy - (i === 0 ? 4 : 2.5), x2: x, y2: sy + 1 }));
    if (labels) g.appendChild(svgEl('text', { x, y: sy - 6, 'text-anchor': 'middle' }, [i > 0 ? `+${i}` : i < 0 ? `−${-i}` : '0']));
  }
  const marker = svgEl('path', { class: 'cam-marker' }); g.appendChild(marker);
  svg.appendChild(g);
  return (diff = 0) => {
    const d = Math.max(-2.4, Math.min(2.4, diff || 0));
    const x = sx + d * step; const h = step * 0.32;
    marker.setAttribute('d', `M${x - h} ${sy + 2 + h * 1.4} L${x + h} ${sy + 2 + h * 1.4} L${x} ${sy + 2} Z`);
    marker.classList.toggle('off', Math.abs(diff || 0) > 2.4);
  };
}

/** Rückmonitor: Livebild (ctx.live) mit Infozeile, sonst Infoanzeige mit drei Zeilen und Skala. */
function monitor(svg, ctx, M, crop) {
  const g = partGroup(ctx, 'monitor');
  g.appendChild(svgEl('rect', { x: M.x - 4, y: M.y - 4, width: M.w + 8, height: M.h + 8, rx: 11, class: 'cam-lcd-frame' }));
  g.appendChild(svgEl('rect', { x: M.x, y: M.y, width: M.w, height: M.h, rx: 7, class: 'cam-lcd' }));
  svg.appendChild(g);
  if (ctx.live) return { live: monitorLive(svg, ctx, { ...M, crop, frame: false }) };
  const lines = [0, 1, 2].map((i) => svgEl('text', { x: M.x + 12, y: M.y + 24 + i * 22, class: i === 2 ? 'cam-lcd-small' : 'cam-lcd-val' }));
  svg.append(...lines);
  return { lines, scale: exposureScale(svg, M.x + M.w - 50, M.y + M.h - 14, 12, { labels: true }) };
}

function monitorLive(svg, ctx, { x, y, w, h, crop, frame = true }) {
  if (frame) {
    svg.appendChild(svgEl('rect', { x: x - 4, y: y - 4, width: w + 8, height: h + 8, rx: 11, class: 'cam-lcd-frame' }));
    svg.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 7, class: 'cam-lcd' }));
  }
  // Livebild an die runden Ecken des Monitors anpassen
  const clip = svgEl('clipPath', { id: 'cam-lcd-clip' }, [svgEl('rect', { x, y, width: w, height: h, rx: 7 })]);
  svg.appendChild(svgEl('defs', {}, [clip]));
  const node = ctx.live;
  node.setAttribute('x', x); node.setAttribute('y', y); node.setAttribute('width', w); node.setAttribute('height', h);
  node.removeAttribute('clip-path');
  node.setAttribute('viewBox', crop); node.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  node.setAttribute('class', 'cam-live');
  // Zuschnitt über eine Gruppe: am verschachtelten svg selbst gälten die Koordinaten des Livebilds
  svg.appendChild(svgEl('g', { 'clip-path': 'url(#cam-lcd-clip)' }, [node]));
  const bh = 15;
  svg.appendChild(svgEl('rect', { x, y: y + h - bh, width: w, height: bh, class: 'cam-live-bar', 'clip-path': 'url(#cam-lcd-clip)' }));
  const txt = svgEl('text', { x: x + 5, y: y + h - 4.5, class: 'cam-live-text' }); svg.appendChild(txt);
  const setScale = w > 120 ? exposureScale(svg, x + w - 30, y + h - 8, 10, { cls: 'cam-live-scale' }) : null;
  return {
    set(parts, diff) {
      txt.innerHTML = '';
      parts.forEach((p, i) => { txt.appendChild(svgEl('tspan', { class: p.user ? 'user' : '' }, [(i ? '  ' : '') + p.t])); });
      setScale?.(diff);
    },
  };
}

const DEFAULT_DIALS = { aperturePriority: { aperture: 'front' }, shutterPriority: { shutter: 'rear' }, manual: { shutter: 'rear', aperture: 'front' }, bulb: { aperture: 'front' } };
/** Welches Rad stellt in diesem Modus welchen Wert? Aus data/camera-modes.json (dials), sonst Nikon-Belegung. */
function dialMap(brand, mode) {
  if (mode === 'program') return {};
  return (brand?.dials && brand.dials[mode]) || DEFAULT_DIALS[mode] || {};
}
/** Rad-Kennung und Taste aus einem Eintrag wie „front“ oder „front+Av±“. */
const splitDial = (v) => { const [dial, button] = String(v).split('+'); return { dial, button }; };
function dialCaption(map, names, mode) {
  const word = { aperture: 'Blende', shutter: 'Zeit' };
  // „am …“ braucht den Dativ: „vorderes Einstellrad“ → „am vorderen Einstellrad“
  const dat = (n) => String(n).replace(/^(vorder|hinter|ober|unter)es /, '$1en ');
  const parts = Object.entries(map).map(([p, v]) => { const { dial, button } = splitDial(v); return `${word[p]} am ${dat(names[dial] || dial)}${button ? ` (mit ${button} gedrückt)` : ''}`; });
  if (mode === 'program') return 'Kamera wählt Zeit und Blende';
  if (mode === 'aperturePriority') parts.push('Kamera wählt die Zeit');
  if (mode === 'shutterPriority') parts.push('Kamera wählt die Blende');
  if (mode === 'bulb') parts.push('Verschluss offen, solange du drückst');
  return parts.join(' · ');
}

// Gehäuse ohne Markenangabe: Modusrad links, Rad vorn am Griff, Daumenrad hinten.
const DEFAULT_BODY = { modeDial: 'left', topLcd: true, evf: 'center', front: 'grip', rear: 'thumb', pad: true, topButtons: [], rearButtons: ['Q', '▶'] };
const DEFAULT_DIALS_BODY = { isoDial: true, evf: 'center', front: 'grip', rear: 'thumb', evDial: false, rearButtons: ['Q', '▶'] };
// Plätze für Tasten auf der Rückseite rechts (oben zwei, unten zwei) und links (Messsucher-Kameras)
const REAR_SLOTS = [[272, 99], [306, 99], [274, 174], [306, 174]];
const LEFT_SLOTS = [[54, 114], [54, 138], [54, 162]];
const CTRL = { x: 290, y: 128 }; // Mitte von Schnellwahlrad, Steuerkreuz oder Joystick

/** Angedeutetes Objektiv: ragt hinter dem Gehäuse oben heraus, mit Schraffur (nur Zeichnung, kein Bedienteil). */
function lensBehind(svg, ctx) {
  const cx = 184, cy = 46, r = 40;
  const clip = svgEl('clipPath', { id: 'cam-lens-clip' }, [svgEl('circle', { cx, cy, r })]);
  svg.appendChild(svgEl('defs', {}, [clip]));
  // als Teil „Objektiv“ antippbar (Schalter AF/MF und Bildstabilisator sitzen dort)
  const lg = ctx ? partGroup(ctx, 'lens') : svgEl('g');
  lg.append(svgEl('circle', { cx, cy, r, class: 'cam-lens' }), svgEl('circle', { cx, cy, r: r - 7, class: 'cam-lens-ring' }));
  svg.appendChild(lg);
  let d = '';
  for (let i = 0; i < 8; i++) { const x = cx + 2 + i * 5; d += `M${x} ${PF + 1} L${x + 11} ${cy - r + 2} `; } // im sichtbaren Teil über dem Deckel
  svg.appendChild(svgEl('path', { d, class: 'cam-lens-hatch', 'clip-path': 'url(#cam-lens-clip)' }));
}

function plate(svg, classic, ctx) {
  lensBehind(svg, ctx);
  // Links: weicher Bogen von der Rückseite hinauf zur Oberseite. Rechts: stark gerundete Griffecke, die in die Seitenwand übergeht.
  svg.appendChild(svgEl('path', { d: `M80 ${PF} H296 Q322 ${PF} 326 ${PF + 18} L327 ${PN - 4} Q327 ${PN} 320 ${PN} H38 V${PN - 8} Q40 ${PF + 2} 80 ${PF} Z`, class: classic ? 'cam-top classic' : 'cam-top' }));
  svg.appendChild(svgEl('path', { d: `M74 ${PF + 6} h34 M80 ${PF + 10} h16 M270 ${PF + 7} q10 2 16 12`, class: 'cam-glint' }));
}
function rearFace(svg, classic) {
  // Seitenwand rechts: zeigt die Tiefe des Gehäuses (Ansicht leicht schräg von hinten)
  svg.appendChild(svgEl('path', { d: `M320 ${PF + 12} Q331 ${PF + 22} 331 ${PN + 8} V${BOT - 28} Q331 ${BOT - 4} 310 ${BOT} H300 L322 ${BOT - 20} V${PN} Z`, class: 'cam-side' }));
  svg.appendChild(svgEl('path', { d: `M38 ${PN} H308 Q322 ${PN} 322 ${PN + 12} V${BOT - 24} Q322 ${BOT} 298 ${BOT} H62 Q38 ${BOT} 38 ${BOT - 24} Z`, class: classic ? 'cam-body classic' : 'cam-body' }));
  // Glanzstriche und Schraffur wie bei einer Handzeichnung (Strichstil, siehe .cam-glint)
  svg.appendChild(svgEl('path', { d: `M44 ${PN + 16} q-1 12 0 24 M48 ${PN + 20} v10 M316 ${PN + 20} q1 18 0 36 M312 ${PN + 26} v14 M64 ${BOT - 5} h28 M70 ${BOT - 9} h14 M300 ${BOT - 6} q8 -2 12 -10`, class: 'cam-glint' }));
}

/** Bedienteile hinten rechts: Schnellwahlrad/Steuerrad, Steuerkreuz oder Joystick, dann Tasten. */
function rearControls(svg, ctx, body, names) {
  let ringG = null, wheelG = null;
  if (body.rear === 'ring') {
    ringG = partGroup(ctx, 'rearDial', { label: names.rear });
    rearRing(ringG, CTRL.x, CTRL.y, 17, body.ringCenter);
    svg.appendChild(ringG);
  } else if (body.ring) {
    wheelG = partGroup(ctx, 'controlWheel', { label: names.wheel || body.ring });
    rearRing(wheelG, CTRL.x, CTRL.y, 17, body.ringCenter || '');
    svg.appendChild(wheelG);
  } else if (body.pad) {
    const g = partGroup(ctx, 'pad'); pad(g, CTRL.x, CTRL.y, 15); svg.appendChild(g);
  } else if (body.joystick) {
    const g = partGroup(ctx, 'joystick'); joystick(g, CTRL.x, CTRL.y); svg.appendChild(g);
  }
  if (ringG || wheelG) {
    const label = ringG ? names.rear : (names.wheel || body.ring);
    // lange Namen nach links rücken, damit sie nicht an die Seitenwand stoßen (ca. 5,4 Einheiten je Zeichen)
    const long = String(label).length > 14; // z. B. „Schnellwahlrad 1“: etwas kleiner, damit es zwischen Monitor und Seitenwand passt
    svg.appendChild(svgEl('text', { x: Math.min(CTRL.x, 320 - String(label).length * (long ? 2.4 : 2.7)), y: CTRL.y + 29, class: long ? 'cam-dial-name small' : 'cam-dial-name', 'text-anchor': 'middle' }, [label]));
  }
  (body.rearButtons || []).slice(0, REAR_SLOTS.length).forEach((b, i) => rearButton(svg, ctx, ...REAR_SLOTS[i], b));
  (body.leftButtons || []).slice(0, LEFT_SLOTS.length).forEach((b, i) => rearButton(svg, ctx, ...LEFT_SLOTS[i], b));
  return { ringG, wheelG };
}

// ---------- Modusrad-Kameras von hinten ----------
function layoutPasmRear(svg, ctx) {
  const brand = ctx.brand;
  const body = { ...DEFAULT_BODY, ...(brand?.body || {}) };
  const names = { front: 'vorderes Rad', rear: 'hinteres Rad', ...(brand?.dials?.names || {}) };
  const modeRight = body.modeDial === 'right';
  const SX = body.front === 'release' ? 306 : 300, SY = body.front === 'release' ? 34 : 40; // Auslöser

  // Rad vorn am Griff liegt hinter der Deckkappe, also zuerst zeichnen
  let frontG = null;
  if (body.front === 'grip') { frontG = partGroup(ctx, 'frontDial', { label: names.front }); gripWheel(frontG, 298); svg.appendChild(frontG); }
  plate(svg, false, ctx);
  viewfinder(svg, ctx, body.evf);

  // Modusrad
  const MX = modeRight ? (body.rear === 'thumbTop' ? 222 : 234) : 92, MY = 46, MR = 24;
  const modeButton = body.modeDial === 'button'; // z. B. Canon R5: MODE-Taste + Hauptwahlrad, Modus im Schulterdisplay
  // Plätze für Tasten oben; bei MODE-Taste (Canon R5) um das Hauptwahlrad herum
  const modeLeftCluster = body.modeDial === 'button' && body.modeButtonSide === 'left'; // Nikon Z 8/Z 9/D850: Tastenblock links
  const topSlotsAll = modeRight ? [[266, 36], [270, 50], [274, 62]] : body.modeDial === 'button' && !modeLeftCluster ? [[270, 36], [272, 66], [304, 58]] : [[272, 40], [276, 52], [280, 63]];
  let modeItems = [];
  if (modeLeftCluster) {
    // Optional ein Rad für die Aufnahmebetriebsart (D850, Z 9), darauf vier Tasten im Quadrat
    if (body.releaseDial) {
      const rg = partGroup(ctx, 'releaseDial', { label: names.releaseDial || 'Aufnahmebetriebsart-Rad' });
      cylinder(rg, MX, MY + 4, 27, 7, { knurlCount: 26 });
      svg.appendChild(rg);
    }
    const slots = [[MX - 11, MY - 4], [MX + 11, MY - 4], [MX - 11, MY + 7], [MX + 11, MY + 7]];
    (body.leftTopButtons || ['MODE']).slice(0, 4).forEach((b, i) => {
      const [bx, by] = slots[i];
      const g = b === 'MODE' ? partGroup(ctx, 'modeDial', { label: 'MODE-Taste' }) : partGroup(ctx, 'button', { key: b });
      g.append(svgEl('ellipse', { cx: bx, cy: by, rx: 12, ry: 8, class: 'cam-hit' }), svgEl('ellipse', { cx: bx, cy: by, rx: 9, ry: 4, class: 'cam-btn' }), svgEl('text', { x: bx, y: by + 1.8, class: 'cam-btn-text tiny', 'text-anchor': 'middle' }, [b]));
      svg.appendChild(g);
    });
  } else if (modeButton) {
    const g = partGroup(ctx, 'modeDial', { label: 'MODE-Taste' });
    const [bx, by] = topSlotsAll[0];
    g.append(svgEl('ellipse', { cx: bx, cy: by, rx: 12, ry: 8, class: 'cam-hit' }), svgEl('ellipse', { cx: bx, cy: by, rx: 9, ry: 4, class: 'cam-btn' }), svgEl('text', { x: bx, y: by + 1.8, class: 'cam-btn-text tiny', 'text-anchor': 'middle' }, ['MODE']));
    svg.appendChild(g);
  }
  const modeG = modeButton ? null : partGroup(ctx, 'modeDial', { cls: 'cam-mode' });
  if (modeG) {
    modeG.appendChild(svgEl('ellipse', { cx: MX, cy: MY + 4, rx: MR + 10, ry: MR * K + 16, class: 'cam-hit' })); // leichter zu treffen
    const mry = cylinder(modeG, MX, MY, MR, 8);
    const my = MY + mry + 10;
    modeG.appendChild(svgEl('path', { d: `M${MX - 4} ${my + 6} L${MX + 4} ${my + 6} L${MX} ${my} Z`, class: 'cam-marker' }));
    if (body.modeDialLabel) modeG.appendChild(svgEl('text', { x: MX, y: MY - MR * K - 6, class: 'cam-dial-name', 'text-anchor': 'middle' }, [body.modeDialLabel]));
    modeItems = CONCEPTS.map((id) => { const txt = svgEl('text', { class: 'cam-mode-tick', 'text-anchor': 'middle' }); txt.addEventListener('click', (e) => { if (ctx.onModeSelect) { e.stopPropagation(); ctx.onModeSelect(id); } }); modeG.appendChild(txt); return { id, txt }; });
    svg.appendChild(modeG);
  }

  // Schulterdisplay
  let shoulder = null;
  if (body.topLcd && !modeRight) {
    const g = partGroup(ctx, 'topLcd');
    g.append(svgEl('path', { d: 'M219 38 H253 Q258 38 259 43 L261 55 Q262 60 257 60 H215 Q210 60 211 55 L213 43 Q214 38 219 38 Z', class: 'cam-lcd-frame' }), svgEl('path', { d: 'M220 41 H252 Q255 41 256 44 L257.5 54 Q258 57 255 57 H216 Q213 57 213.5 54 L215 44 Q216 41 220 41 Z', class: 'cam-lcd' }));
    shoulder = svgEl('text', { x: 236, y: 52.5, class: 'cam-lcd-text small', 'text-anchor': 'middle' }); g.appendChild(shoulder);
    if (modeButton) shoulder.style.fontSize = '6.4px';
    svg.appendChild(g);
  }

  // Tasten oben zwischen Modusrad/Display und Auslöser
  const topSlots = modeButton && !modeLeftCluster ? topSlotsAll.slice(1) : topSlotsAll;
  (body.topButtons || []).slice(0, topSlots.length).forEach((b, i) => topButton(svg, ctx, ...topSlots[i], b));

  // Zeitenrad rechts (Nikon Z fc, Z f)
  let shutterDialG = null, shutterDialCtl = null;
  if (body.shutterDial && !modeRight) {
    shutterDialG = partGroup(ctx, 'shutterDial', { label: names.shutterDial || 'Zeitenrad' });
    shutterDialG.classList.add('cam-cmd');
    shutterDialCtl = topDial(shutterDialG, { cx: 232, cy: 46, r: 22, h: 8, series: standardSeries('shutter', 1).filter((v) => v >= 1 / 4000 && v <= 1), format: (v) => formatShutter(v).replace('"', '').replace('1/', ''), label: names.shutterDial || 'Zeitenrad', degPerStop: 70 });
    svg.appendChild(shutterDialG);
  }

  // Belichtungskorrekturrad (Sony, Nikon Z fc/Z f)
  if (body.evDial) evDial(svg, ctx, 306, 56);

  // Auslöser mit vorderem Rad
  if (body.front === 'collar') {
    frontG = partGroup(ctx, 'frontDial', { label: names.front });
    frontG.classList.add('cam-cmd'); cylinder(frontG, SX, SY, 14, 5, { knurlCount: 18 }); svg.appendChild(frontG);
  }
  shutterButton(svg, ctx, SX, SY);
  if (body.front === 'release') {
    frontG = partGroup(ctx, 'frontDial', { label: names.front });
    frontG.classList.add('cam-cmd'); cylinder(frontG, 286, 50, 12, 5, { knurlCount: 18 }); svg.appendChild(frontG);
  }
  // Keine feste Beschriftung des vorderen Rads (vom Kursleiter gestrichen): Name erscheint beim Antippen und in der Moduszeile

  // Hinteres Rad oben (Olympus) steht auf der Deckkappe
  let rearTop = null;
  if (body.rear === 'thumbTop') {
    rearTop = partGroup(ctx, 'rearDial', { label: names.rear });
    rearTop.classList.add('cam-cmd'); cylinder(rearTop, 268, 58, 11, 5, { knurlCount: 16 }); svg.appendChild(rearTop);
  }

  // Rückseite
  rearFace(svg);
  ctx.afterRear.splice(0).forEach((f) => f());
  let thumb = null, thumbG = null;
  if (body.rear === 'thumb') { thumbG = partGroup(ctx, 'rearDial', { label: names.rear }); thumb = thumbWheel(thumbG, 246, PN, 40, 11, names.rear); svg.appendChild(thumbG); }
  if (rearTop) svg.appendChild(svgEl('text', { x: 268, y: PN + 9, class: 'cam-dial-name', 'text-anchor': 'middle' }, [names.rear]));
  const { ringG, wheelG } = rearControls(svg, ctx, body, names);
  const rearG = thumbG || rearTop || ringG;

  const scr = monitor(svg, ctx, { x: 52, y: 100, w: 186, h: 86 }, '0 42 400 176');
  const caption = svgEl('text', { x: 182, y: 214, class: 'cam-caption', 'text-anchor': 'middle' }); svg.appendChild(caption);

  return {
    height: 222, box: [30, 304],
    update({ aperture, shutter, iso, mode, exposure, isoAuto }) {
      const userAp = mode === 'aperturePriority' || mode === 'manual' || mode === 'bulb';
      const userSh = mode === 'shutterPriority' || mode === 'manual' || mode === 'bulb';
      const cur = CONCEPTS.indexOf(mode);
      modeItems.forEach((it, i) => {
        const phi = (90 + (i - cur) * 72) * Math.PI / 180; const s = Math.sin(phi);
        const x = MX + (MR - 8) * Math.cos(phi), y = MY + (MR - 8) * K * s;
        it.txt.textContent = shortLabel(brand?.modes?.[it.id], it.id);
        it.txt.setAttribute('x', x); it.txt.setAttribute('y', y + 3);
        it.txt.style.opacity = s > -0.5 ? String(Math.max(0.35, (s + 0.5) / 1.5)) : '0.2';
        it.txt.classList.toggle('current', it.id === mode);
        it.txt.style.cursor = ctx.onModeSelect ? 'pointer' : '';
      });
      const label = shortLabel(brand?.modes?.[mode], mode);
      if (shoulder) shoulder.textContent = `${modeButton ? `${label} ` : ''}${de(formatShutter(shutter))} ${de(formatAperture(aperture))}`;
      const isoText = `ISO ${isoAuto ? 'A ' : ''}${Math.round(iso)}`;
      if (scr.live) {
        scr.live.set([{ t: label, user: true }, { t: de(formatShutter(shutter)), user: userSh }, { t: de(formatAperture(aperture)), user: userAp }, { t: isoText, user: false }], exposure);
      } else {
        const [l1, l2, l3] = scr.lines;
        l1.textContent = `${label}   ${de(formatShutter(shutter))}`; l1.classList.toggle('user', userSh);
        l2.textContent = de(formatAperture(aperture)); l2.classList.toggle('user', userAp);
        l3.textContent = isoText;
        scr.scale(exposure);
      }
      const map = dialMap(brand, mode);
      const uses = (dial) => Object.entries(map).filter(([, v]) => splitDial(v).dial === dial).map(([p]) => p);
      // Räder bleiben grau; grün wird nur das angetippte bzw. in „Wo finde ich was?“ gewählte Teil (.hl)
      shutterDialCtl?.update(Math.min(1, Math.max(1 / 4000, shutter)));
      thumb?.update(uses('rear')[0] === 'aperture' ? Math.log2(aperture) * 2 : Math.log2(shutter));
      // Erst das Modusrad (bzw. die MODE-Taste), dann welches Rad was stellt
      // Bulb „in M“ (Nikon, Sony, Panasonic): kein B auf dem Modusrad, sondern M und Zeit über 30 s hinaus
      const bulbInM = mode === 'bulb' && /in M/.test(brand?.modes?.bulb || '');
      const modePart = bulbInM ? `${modeButton ? 'MODE-Taste: M' : 'Modusrad auf M'}, Zeit auf Bulb` : modeButton ? `MODE-Taste: ${label}` : `Modusrad auf ${label}`;
      caption.textContent = `${modePart} · ${dialCaption(map, names, mode)}`;
    },
  };
}

function evDial(svg, ctx, cx, cy) {
  const g = partGroup(ctx, 'evDial');
  const d = topDial(g, { cx, cy, r: 16, h: 6, series: [-3, -2, -1, 0, 1, 2, 3], posOf: (v) => v, format: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'), degPerStop: 56 });
  svg.appendChild(g);
  d.update(0);
}

// ---------- Zeitenrad-Kameras (Fujifilm, Leica) von hinten ----------
function layoutDialsRear(svg, ctx) {
  const brand = ctx.brand;
  const body = { ...DEFAULT_DIALS_BODY, ...(brand?.body || {}) };
  const rangefinder = body.evf === 'left';
  let frontG = null;
  if (body.front === 'grip') { frontG = partGroup(ctx, 'frontDial', { label: 'vorderes Einstellrad' }); gripWheel(frontG, 298); svg.appendChild(frontG); }
  plate(svg, true, ctx);
  viewfinder(svg, ctx, body.evf, true);
  let isoDial = null;
  if (body.isoDial) {
    const g = partGroup(ctx, 'isoDial');
    isoDial = topDial(g, { cx: rangefinder ? 92 : 82, cy: 46, r: rangefinder ? 22 : 26, h: 9, series: standardSeries('iso', 1).filter((v) => v >= 100 && v <= 12800), format: (v) => String(v), label: 'ISO', degPerStop: rangefinder ? 80 : 74 });
    svg.appendChild(g);
  }
  const sg = partGroup(ctx, 'shutterDial');
  const shutterDial = topDial(sg, { cx: rangefinder ? 244 : 236, cy: 46, r: 27, h: 9, series: standardSeries('shutter', 1).filter((v) => v >= 1 / 4000 && v <= 1), format: (v) => formatShutter(v).replace('"', '').replace('1/', ''), label: 'Zeit', withAuto: true, degPerStop: 68 });
  svg.appendChild(sg);
  if (body.evDial) evDial(svg, ctx, 308, 56);
  shutterButton(svg, ctx, 296, 38);

  rearFace(svg, true);
  ctx.afterRear.splice(0).forEach((f) => f());
  if (body.rear === 'thumb') { const g = partGroup(ctx, 'rearDial', { label: 'hinteres Einstellrad' }); thumbWheel(g, rangefinder ? 266 : 248, PN, 36, 10, rangefinder ? 'Daumenrad' : 'hinteres Rad').update(0); svg.appendChild(g); }
  rearControls(svg, ctx, body, { rear: 'hinteres Rad' });
  const M = rangefinder ? { x: 66, y: 100, w: 180, h: 86 } : { x: 52, y: 100, w: 186, h: 86 };
  const scr = monitor(svg, ctx, M, '20 30 360 225');
  const caption = svgEl('text', { x: 182, y: 214, class: 'cam-caption', 'text-anchor': 'middle' }); svg.appendChild(caption);
  return {
    height: 222, box: [30, 304],
    update({ aperture, shutter, iso, mode, exposure, isoAuto }) {
      const shutterAuto = mode === 'program' || mode === 'aperturePriority';
      const apertureAuto = mode === 'program' || mode === 'shutterPriority';
      isoDial?.update(iso, false);
      shutterDial.update(Math.min(1, shutter), shutterAuto);
      const isoText = `ISO ${isoAuto ? 'A ' : ''}${Math.round(iso)}`;
      const sh = `${shutterAuto ? 'A ' : ''}${de(formatShutter(shutter))}`;
      const ap = `${apertureAuto ? 'A ' : ''}${de(formatAperture(aperture))}`;
      if (scr.live) {
        scr.live.set([{ t: sh, user: !shutterAuto }, { t: ap, user: !apertureAuto }, { t: isoText, user: false }], exposure);
      } else {
        const [l1, l2, l3] = scr.lines;
        l1.textContent = `Zeit  ${shutterAuto ? 'A → ' : ''}${de(formatShutter(shutter))}`; l1.classList.toggle('user', !shutterAuto);
        l2.textContent = `Blende  ${apertureAuto ? 'A → ' : ''}${de(formatAperture(aperture))}`; l2.classList.toggle('user', !apertureAuto);
        l3.textContent = isoText;
        scr.scale(exposure);
      }
      const ring = `Blendenring am Objektiv ${apertureAuto ? 'auf A' : de(formatAperture(aperture))}`;
      caption.textContent = mode === 'bulb' ? `Zeitenrad auf B oder T · ${ring}` : `Zeitenrad ${shutterAuto ? 'auf A' : de(formatShutter(Math.min(1, shutter)))} · ${ring}`;
    },
  };
}

// ---------- Handy ----------
// Quer gehalten wie beim Fotografieren: Kamerainsel links, Auslöser rechts, Werte unter dem Handy
function layoutPhone(svg, ctx) {
  svg.appendChild(svgEl('rect', { x: 50, y: 8, width: 260, height: 126, rx: 20, class: 'cam-phone' }));
  const scrG = partGroup(ctx, 'phoneScreen');
  scrG.appendChild(svgEl('rect', { x: 56, y: 14, width: 248, height: 114, rx: 14, class: 'cam-screen' }));
  svg.appendChild(scrG);
  let screen = null;
  if (ctx.live) {
    screen = monitorLive(svg, ctx, { x: 80, y: 14, w: 188, h: 114, crop: '0 0 400 260', frame: false });
  } else {
    svg.appendChild(svgEl('rect', { x: 80, y: 84, width: 188, height: 44, class: 'cam-screen-ground' }));
    svg.appendChild(svgEl('circle', { cx: 236, cy: 44, r: 8, class: 'cam-screen-light' }));
    svg.appendChild(svgEl('rect', { x: 124, y: 104, width: 100, height: 2, class: 'cam-screen-road' }));
  }
  const evG = partGroup(ctx, 'sunSlider');
  evG.append(svgEl('line', { x1: 104, y1: 30, x2: 194, y2: 30, class: 'cam-ev-line' }), svgEl('circle', { cx: 149, cy: 30, r: 4.5, class: 'cam-ev-knob' }), svgEl('text', { x: 200, y: 33, class: 'cam-ev-sun' }, ['☼']));
  if (!ctx.live) svg.appendChild(evG); else ctx.parts.pop();
  svg.appendChild(svgEl('rect', { x: 62, y: 51, width: 10, height: 40, rx: 5, class: 'cam-notch' }));
  const rel = partGroup(ctx, 'phoneRelease');
  rel.append(svgEl('circle', { cx: 286, cy: 71, r: 12, class: 'cam-phone-release-rim' }), svgEl('circle', { cx: 286, cy: 71, r: 9, class: 'cam-phone-release' }));
  svg.appendChild(rel);
  const l1 = svgEl('text', { x: 110, y: 172, class: 'cam-value', 'text-anchor': 'middle' });
  const l2 = svgEl('text', { x: 110, y: 188, class: 'cam-value small', 'text-anchor': 'middle' });
  const r1 = svgEl('text', { x: 250, y: 172, class: 'cam-value', 'text-anchor': 'middle' });
  const r2 = svgEl('text', { x: 250, y: 188, class: 'cam-value small', 'text-anchor': 'middle' });
  const r3 = svgEl('text', { x: 250, y: 202, class: 'cam-value small', 'text-anchor': 'middle' });
  svg.append(svgEl('text', { x: 110, y: 154, class: 'cam-dial-name', 'text-anchor': 'middle' }, ['Blende']), svgEl('text', { x: 250, y: 154, class: 'cam-dial-name', 'text-anchor': 'middle' }, ['Automatik']), l1, l2, r1, r2, r3);
  return {
    height: 210,
    update({ aperture, shutter, iso, mode, brand, exposure }) {
      l1.textContent = de(formatAperture(aperture)); l2.textContent = 'fest, kein Ring';
      r1.textContent = de(formatShutter(shutter)); r2.textContent = `ISO ${Math.round(iso)}`;
      const manual = brand?.id === 'android' && (mode === 'manual' || mode === 'shutterPriority');
      r3.textContent = manual ? 'Pro-Modus: selbst gesetzt' : 'wählt das Handy';
      screen?.set([{ t: de(formatShutter(shutter)), user: manual }, { t: `ISO ${Math.round(iso)}`, user: false }], exposure);
    },
  };
}

// ---------- Lochkamera von hinten ----------
function layoutPinholeRear(svg, ctx) {
  // Klappe vorn über dem Loch steht offen nach oben: sie ist der Verschluss
  const flap = partGroup(ctx, 'pinholeFlap');
  flap.append(svgEl('path', { d: 'M156 52 H204 L200 20 H160 Z', class: 'cam-flap' }), svgEl('circle', { cx: 160, cy: 52, r: 2.5, class: 'cam-brass' }), svgEl('circle', { cx: 200, cy: 52, r: 2.5, class: 'cam-brass' }));
  svg.appendChild(flap);
  svg.appendChild(svgEl('path', { d: 'M72 52 H288 L310 86 H50 Z', class: 'cam-box' }));
  for (let i = 0; i < 3; i++) svg.appendChild(svgEl('path', { d: `M${70 - i * 6} ${60 + i * 9} Q180 ${57 + i * 9 + (i % 2 ? 2 : -2)} ${292 + i * 6} ${60 + i * 9}`, class: 'cam-grain' }));
  const level = partGroup(ctx, 'level');
  level.append(svgEl('ellipse', { cx: 180, cy: 70, rx: 12, ry: 4.5, class: 'cam-level' }), svgEl('circle', { cx: 181, cy: 70, r: 2.2, class: 'cam-level-bubble' }));
  svg.appendChild(level);
  svg.appendChild(svgEl('rect', { x: 50, y: 86, width: 260, height: 112, rx: 3, class: 'cam-box' }));
  for (let i = 0; i < 6; i++) svg.appendChild(svgEl('path', { d: `M54 ${98 + i * 17} q60 ${i % 2 ? 4 : -4} 126 0 t122 ${i % 2 ? -3 : 3}`, class: 'cam-grain' }));
  svg.appendChild(svgEl('path', { d: 'M72 52 H288 L310 86 H50 Z M50 86 H310 V198 H50 Z', class: 'cam-box-edge' }));
  const door = partGroup(ctx, 'filmDoor');
  door.append(svgEl('rect', { x: 84, y: 100, width: 192, height: 86, rx: 3, class: 'cam-door' }), svgEl('rect', { x: 262, y: 136, width: 8, height: 16, rx: 2, class: 'cam-brass' }), svgEl('text', { x: 180, y: 147, class: 'cam-dial-name', 'text-anchor': 'middle' }, ['Film hinter der Rückwand']));
  svg.appendChild(door);
  const a = svgEl('text', { x: 110, y: 216, class: 'cam-value small', 'text-anchor': 'middle' });
  const s = svgEl('text', { x: 250, y: 216, class: 'cam-value small', 'text-anchor': 'middle' });
  svg.append(a, s);
  return {
    height: 226,
    update({ aperture, shutter }) {
      a.textContent = `${de(formatAperture(aperture))} fest`;
      s.textContent = `Klappe auf: ${de(formatShutter(shutter))}`;
    },
  };
}

const REAR = { pasm: layoutPasmRear, dials: layoutDialsRear, phone: layoutPhone, pinhole: layoutPinholeRear };

export function cameraDials(initial = {}) {
  const svg = svgEl('svg', { viewBox: '0 0 360 222', class: 'camera-svg', role: 'img', 'aria-label': 'Stilisierte Kamera von hinten oben mit Rädern und Tasten' });
  const ctx = { onModeSelect: initial.onModeSelect, live: initial.live || null, parts: [], afterRear: [], brand: null };
  let brand = initial.brand || null;
  let layoutId = initial.layout || brand?.layout || 'pasm';
  let impl = null, hl = null, hlName = null;
  const state = { aperture: initial.aperture || 8, shutter: initial.shutter || 1 / 125, iso: initial.iso || 100, mode: initial.mode || 'manual', exposure: 0, isoAuto: false };
  if (initial.onPart) {
    svg.classList.add('pickable');
    svg.addEventListener('click', (e) => { const p = e.target.closest?.('[data-part]'); if (p) initial.onPart(p.dataset.part); });
  }
  function build() {
    svg.innerHTML = '';
    svg.appendChild(sketchFilter());
    ctx.parts = []; ctx.afterRear = []; ctx.brand = brand;
    impl = (REAR[layoutId] || REAR.pasm)(svg, ctx);
    const [bx, bw] = impl.box || [0, 360];
    svg.setAttribute('viewBox', `${bx} 0 ${bw} ${impl.height || 222}`);
    svg.dataset.layout = layoutId;
    impl.update({ ...state, brand });
    if (hl) api.highlight(hl, hlName);
  }

  /** Namensschild neben einem Teil: über dem Teil, wenn Platz ist, sonst darunter; bleibt im Bild. */
  function callout(node, text) {
    let box;
    try { box = node.getBBox(); } catch { return; }
    const [vx, , vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
    const g = svgEl('g', { class: 'cam-callout', 'aria-hidden': 'true' });
    const label = svgEl('text', { class: 'cam-callout-text', 'text-anchor': 'middle' }, [text]);
    const bg = svgEl('rect', { rx: 4, class: 'cam-callout-bg' });
    g.append(bg, label);
    svg.appendChild(g);
    const w = Math.max(24, label.getComputedTextLength?.() || text.length * 5.2) + 12, h = 15;
    const cx = Math.min(Math.max(box.x + box.width / 2, vx + w / 2 + 2), vx + vw - w / 2 - 2);
    const above = box.y - h - 4 >= 2;
    const y = above ? box.y - h - 4 : Math.min(box.y + box.height + 4, vh - h - 2);
    bg.setAttribute('x', cx - w / 2); bg.setAttribute('y', y); bg.setAttribute('width', w); bg.setAttribute('height', h);
    label.setAttribute('x', cx); label.setAttribute('y', y + 10.6);
  }
  const api = {
    el: svg,
    update(values) {
      for (const k of ['aperture', 'shutter', 'iso', 'mode', 'exposure', 'isoAuto']) if (values[k] != null) state[k] = values[k];
      impl.update({ ...state, brand });
    },
    setBrand(b) {
      const changed = b !== brand; brand = b || null;
      const next = initial.layout || brand?.layout || 'pasm';
      if (next !== layoutId || changed) { layoutId = next; hl = null; build(); } else impl.update({ ...state, brand });
    },
    setLayout(id) { if (id && id !== layoutId && REAR[id]) { layoutId = id; build(); } else if (!id) { const next = brand?.layout || 'pasm'; if (next !== layoutId) { layoutId = next; build(); } } },
    setLive(node) { ctx.live = node || null; build(); },
    /** Alle Bedienteile dieser Kamera: [{ id, kind, key, label }] in Zeichenreihenfolge. */
    parts() { return ctx.parts.map((p) => ({ ...p })); },
    /** Kurze Moduszeile, wie sie unter der Grafik steht (z. B. „Av · Hauptwahlrad: Blende · Kamera wählt die Zeit“). */
    caption() { return svg.querySelector('.cam-caption')?.textContent || ''; },
    /** Ein Bedienteil hervorheben (null = keins). */
    highlight(id, name) {
      hl = id || null; hlName = hl ? name || null : null;
      for (const n of svg.querySelectorAll('.cam-part.hl')) n.classList.remove('hl');
      svg.querySelector('.cam-callout')?.remove();
      if (!hl) return;
      const nodes = [...svg.querySelectorAll(`[data-part="${CSS.escape(hl)}"]`)];
      for (const n of nodes) n.classList.add('hl');
      if (hlName && nodes.length) callout(nodes[0], hlName);
    },
  };
  build();
  return api;
}
