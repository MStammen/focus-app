// Szene für Simulator und virtuelle Kamera: Straße bei Dämmerung mit Laterne, Fahrzeug, Wasser, Person.
// Prinzipdarstellung, nicht fotorealistisch. Mehrere Szenen pro Seite möglich (eigene Filter-IDs).
import { ev } from '../core/exposure.js';

export const SCENE_EV = 5; // Dämmerung mit Laterne, bezogen auf ISO 100
/** Lichtsituationen der Szene: Lichtwert (ISO 100) und Farben. */
export const LIGHTS = {
  dusk: { ev: 5, sky: '#0e1420', building: '#232c3a', road: '#2a2f38', water: '#1a3550', lamp: true },
  day: { ev: 14, sky: '#9cc3e6', building: '#a9a196', road: '#6b6f75', water: '#3f7fae', lamp: false },
};

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const c of children) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}
let counter = 0;

/**
 * createScene({ label }) → { el, render({ aperture, shutter, iso, nd, device }) → { diff, seen, … } }
 * device: { id, focal, apertureFixed } aus data/devices.json.
 * render gibt { evCam, diff, opening } zurück; diff > 0 heißt: Bild zu hell.
 */
export function createScene({ label = '' } = {}) {
  const id = `sc${++counter}`;
  const svg = s('svg', { viewBox: '0 0 400 260', role: 'img', 'aria-label': label });
  const defs = s('defs');
  const mkBlur = (name) => { const f = s('filter', { id: `${id}-${name}`, x: '-10%', y: '-10%', width: '120%', height: '120%' }); const b = s('feGaussianBlur', { stdDeviation: 0 }); f.appendChild(b); defs.appendChild(f); return b; };
  const bgBlur = mkBlur('bg'), fgBlur = mkBlur('fg');
  const motion = s('filter', { id: `${id}-motion`, x: '-50%', width: '200%' }); const motionBlur = s('feGaussianBlur', { stdDeviation: '0 0' }); motion.appendChild(motionBlur); defs.appendChild(motion);
  const noiseF = s('filter', { id: `${id}-noise` }); noiseF.append(s('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 2, stitchTiles: 'stitch' }), s('feColorMatrix', { type: 'saturate', values: 0 })); defs.appendChild(noiseF);
  const glow = s('radialGradient', { id: `${id}-glow` }); glow.append(s('stop', { offset: 0, 'stop-color': '#ffe6a0', 'stop-opacity': 0.95 }), s('stop', { offset: 1, 'stop-color': '#ffe6a0', 'stop-opacity': 0 })); defs.appendChild(glow);
  svg.appendChild(defs);
  const sky = s('rect', { width: 400, height: 260, fill: '#0e1420' }); svg.appendChild(sky);
  const bg = s('g', { filter: `url(#${id}-bg)` });
  for (let i = 0; i < 7; i++) bg.appendChild(s('rect', { x: i * 58 - 10, y: 70 + (i % 3) * 14, width: 44, height: 120, fill: '#232c3a' }));
  svg.appendChild(bg);
  // Straße und Wasser
  const road = s('rect', { x: 0, y: 170, width: 400, height: 40, fill: '#2a2f38' }); svg.appendChild(road);
  const waterWavy = s('path', { fill: '#1a3550' }), waterFlat = s('rect', { x: 0, y: 210, width: 400, height: 50, fill: '#1a3550' });
  let wave = 'M0 215 '; for (let x = 0; x <= 400; x += 20) wave += `Q${x + 5} ${208 + (x / 20 % 2) * 12} ${x + 20} 215 `; wave += 'L400 260 L0 260 Z';
  waterWavy.setAttribute('d', wave);
  svg.append(waterFlat, waterWavy);
  // Laterne
  const lanternGlow = s('circle', { cx: 300, cy: 70, r: 40, fill: `url(#${id}-glow)` });
  const lampHead = s('circle', { cx: 300, cy: 70, r: 7, fill: '#fff6d8' });
  svg.append(s('rect', { x: 297, y: 70, width: 6, height: 100, fill: '#3b4252' }), lanternGlow, lampHead);
  const star = s('g', { stroke: '#fff6d8', 'stroke-width': 1.5, 'stroke-linecap': 'round' }); svg.appendChild(star);
  // Fahrzeug mit Lichtspur
  const car = s('g', { filter: `url(#${id}-motion)` });
  car.append(s('rect', { x: 120, y: 150, width: 70, height: 24, rx: 6, fill: '#5a6b85' }), s('rect', { x: 135, y: 140, width: 40, height: 14, rx: 4, fill: '#7d8ea8' }), s('circle', { cx: 186, cy: 162, r: 4, fill: '#fff2c0' }), s('circle', { cx: 124, cy: 162, r: 3, fill: '#ff5a4a' }));
  const trail = s('line', { x1: 186, y1: 162, x2: 186, y2: 162, stroke: '#ffd080', 'stroke-width': 5, 'stroke-linecap': 'round' });
  svg.append(trail, car);
  // Person im Vordergrund
  const fg = s('g', { filter: `url(#${id}-fg)` });
  fg.append(s('circle', { cx: 60, cy: 170, r: 16, fill: '#404a5a' }), s('rect', { x: 42, y: 186, width: 36, height: 74, rx: 8, fill: '#404a5a' }));
  svg.appendChild(fg);
  // Belichtung und Rauschen
  const dark = s('rect', { width: 400, height: 260, fill: '#000', opacity: 0 });
  const bright = s('rect', { width: 400, height: 260, fill: '#fff', opacity: 0 });
  const noise = s('rect', { width: 400, height: 260, filter: `url(#${id}-noise)`, opacity: 0, style: 'mix-blend-mode: overlay' });
  svg.append(dark, bright, noise);

  let lightId = null;
  function setLight(id) {
    if (id === lightId) return;
    lightId = LIGHTS[id] ? id : 'dusk';
    const L = LIGHTS[lightId];
    sky.setAttribute('fill', L.sky); road.setAttribute('fill', L.road);
    for (const r of bg.children) r.setAttribute('fill', L.building);
    waterFlat.setAttribute('fill', L.water); waterWavy.setAttribute('fill', L.water);
    lanternGlow.style.display = L.lamp ? '' : 'none';
    lampHead.setAttribute('fill', L.lamp ? '#fff6d8' : '#8a8f99');
  }
  setLight('dusk');

  function render({ aperture, shutter, iso, nd = 0, device, light = 'dusk' }) {
    setLight(light);
    const sceneEv = LIGHTS[lightId].ev;
    const d = device || { id: 'ff', focal: 50, apertureFixed: false };
    const evCam = ev(aperture, shutter, iso) + nd;
    const diff = sceneEv - evCam;
    dark.setAttribute('opacity', String(Math.min(0.92, Math.max(0, -diff) * 0.3)));
    bright.setAttribute('opacity', String(Math.min(0.9, Math.max(0, diff) * 0.25)));
    // Bewegung: Fahrzeug, Lichtspur (beim Handy gestrichelt), Wasser
    motionBlur.setAttribute('stdDeviation', `${Math.min(60, shutter * 60)} 0`);
    car.setAttribute('opacity', String(shutter >= 4 ? 0.15 : 1));
    trail.setAttribute('x2', String(186 + Math.min(200, shutter * 60)));
    trail.setAttribute('opacity', String(shutter >= 0.5 ? Math.min(1, shutter / 2) : 0));
    trail.setAttribute('stroke-dasharray', d.id === 'phone' ? '6 5' : '0');
    waterWavy.setAttribute('opacity', String(Math.max(0, 1 - shutter / 4)));
    // Schärfentiefe über den Öffnungsdurchmesser bei gleichem Ausschnitt
    const opening = d.focal / aperture;
    const dofBlur = d.id === 'pinhole' ? 1.5 : Math.min(7, opening / 4);
    bgBlur.setAttribute('stdDeviation', String(dofBlur));
    fgBlur.setAttribute('stdDeviation', String(dofBlur * 0.8));
    // Rauschen mit der ISO
    noise.setAttribute('opacity', String(Math.min(0.6, Math.max(0, Math.log2(iso / 100)) * 0.09)));
    // Blendenstern ab f/8, nur mit echter Blende
    star.innerHTML = '';
    if (LIGHTS[lightId].lamp && !d.apertureFixed && aperture >= 8) {
      const len = 10 + (aperture - 8) * 1.4;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI; star.appendChild(s('line', { x1: 300 - Math.cos(a) * len, y1: 70 - Math.sin(a) * len, x2: 300 + Math.cos(a) * len, y2: 70 + Math.sin(a) * len })); }
    }
    lanternGlow.setAttribute('r', String(40 + Math.max(0, diff) * 10));
    // Was im Bild zu sehen ist (für die Zeile unter der Kamera), passend zur Zeichnung oben
    const seen = {
      motion: shutter >= 4 ? 'gone' : shutter >= 0.5 ? 'trail' : shutter >= 1 / 15 ? 'blur' : 'frozen',
      water: shutter >= 2 ? 'smooth' : shutter >= 0.5 ? 'calm' : 'waves',
      dof: dofBlur >= 3 ? 'shallow' : dofBlur <= 1 ? 'deep' : 'medium',
      star: star.childNodes.length > 0,
      noise: iso >= 1600,
    };
    return { evCam, diff, opening, sceneEv, seen };
  }

  return { el: svg, render };
}
