// Rechner: Schärfentiefe. Brennweite, Blende, Entfernung und Sensorformat → Nah- und Fernpunkt,
// Schärfentiefe und hyperfokale Distanz, dazu eine Skala mit dem scharfen Bereich. Rechnung in core/dof.js.
import { dof, DOF_FORMATS } from '../core/dof.js';
import { el, numberField, seriesSelect, stepFromSetting, fmtNum, button, bigValue } from '../lib/ui.js';
import { getSession, setSession } from '../lib/session.js';
import { ownSensorCrop } from '../lib/camera-profile.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); for (const c of kids) n.append(c); return n; };

// Skala: logarithmisch von 0,25 m bis 200 m, rechts daneben „unendlich“
const X0 = 14, X1 = 270, XINF = 296, DMIN = 0.25, DMAX = 200;
const xOf = (d) => (d === Infinity ? XINF : X0 + (Math.log(Math.min(Math.max(d, DMIN), DMAX)) - Math.log(DMIN)) / (Math.log(DMAX) - Math.log(DMIN)) * (X1 - X0));
const TICKS = [0.5, 1, 2, 5, 10, 20, 50, 100];

export async function init(root, ctx) {
  const { t } = ctx;
  const step = stepFromSetting(ctx);
  const last = getSession('lastExposure', null);
  const state = getSession('dof', { focal: 50, aperture: last?.aperture || 8, distance: 3, format: null });

  // Sensorformat: anfangs das der eigenen Kamera (Einstellungen Marke/Modell), sonst Vollformat
  if (!state.format) {
    const crop = await ownSensorCrop(ctx);
    state.format = DOF_FORMATS.find((f) => f.crop === crop)?.id || 'ff';
  }

  const focal = numberField({ label: t('calc.dof.focal'), value: state.focal, unit: 'mm', min: 1, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { state.focal = v; update(); } });
  const aperture = seriesSelect({ kind: 'aperture', step, value: state.aperture, label: t('common.aperture'), onChange: (v) => { state.aperture = v; update(); } });
  const distance = numberField({ label: t('calc.dof.distance'), value: state.distance, unit: 'm', min: 0.1, stepAttr: '0.1', onChange: (v) => { state.distance = v; update(); } });
  const formatSel = el('select', { class: 'select' }, DOF_FORMATS.map((f) => el('option', { value: f.id, text: t(`calc.dof.formats.${f.id}`), selected: f.id === state.format })));
  formatSel.addEventListener('change', () => { state.format = formatSel.value; update(); });
  root.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'fields' }, [focal.field, aperture.field]),
    el('div', { class: 'fields' }, [distance.field, el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('calc.dof.format') }), formatSel])]),
  ]));

  const out = el('div', { class: 'card' });
  root.appendChild(out);

  const fmtDist = (m) => (m === Infinity ? t('calc.dof.infinity')
    : m < 1 ? `${fmtNum(m * 100, 0)} cm`
      : m < 10 ? `${fmtNum(m, 2)} m`
        : m < 100 ? `${fmtNum(m, 1)} m` : `${fmtNum(m, 0)} m`);
  const row = (label, value, hint) => el('div', { class: 'row' }, [
    el('span', { class: 'row-label' }, [el('span', { text: label }), hint ? el('span', { class: 'row-hint', text: hint }) : null]),
    el('strong', { text: value }),
  ]);

  function scale(r) {
    const svg = svgEl('svg', { class: 'dof-scale', viewBox: '0 0 310 50', role: 'img', 'aria-label': t('calc.dof.scaleLabel', { near: fmtDist(r.near), far: fmtDist(r.far) }) });
    svg.append(svgEl('line', { class: 'dof-axis', x1: X0, y1: 22, x2: XINF, y2: 22 }));
    for (const d of TICKS) {
      const x = xOf(d);
      svg.append(svgEl('line', { class: 'dof-tick', x1: x, y1: 18, x2: x, y2: 26 }), svgEl('text', { class: 'dof-tick-text', x, y: 40, 'text-anchor': 'middle' }, [d < 1 ? '0,5' : String(d)]));
    }
    svg.append(svgEl('text', { class: 'dof-tick-text', x: XINF, y: 40, 'text-anchor': 'middle' }, ['∞']), svgEl('text', { class: 'dof-tick-text', x: X0, y: 40, 'text-anchor': 'start' }, ['m']));
    const x1 = xOf(r.near), x2 = xOf(r.far);
    svg.append(svgEl('rect', { class: 'dof-zone', x: x1, y: 13, width: Math.max(2, x2 - x1), height: 18, rx: 3 }));
    svg.append(svgEl('line', { class: 'dof-focus', x1: xOf(state.distance), y1: 8, x2: xOf(state.distance), y2: 34 }));
    return svg;
  }

  function update() {
    out.innerHTML = '';
    const fm = DOF_FORMATS.find((f) => f.id === state.format) || DOF_FORMATS[0];
    const r = dof({ focal: state.focal, aperture: state.aperture, distance: state.distance, crop: fm.crop });
    if (!r) { out.appendChild(el('p', { class: 'muted', text: t('calc.dof.invalid') })); return; }
    out.append(
      bigValue({ label: t('calc.dof.total'), value: fmtDist(r.total), sub: t('calc.dof.range', { near: fmtDist(r.near), far: fmtDist(r.far) }) }),
      scale(r),
      row(t('calc.dof.near'), fmtDist(r.near)),
      row(t('calc.dof.far'), fmtDist(r.far)),
      row(t('calc.dof.hyperfocal'), fmtDist(r.hyperfocal), t('calc.dof.hyperfocalHint', { half: fmtDist(r.hyperfocal / 2) })),
      el('div', { class: 'btn-row' }, [button(t('calc.dof.toHyperfocal'), { onClick: () => { state.distance = Math.round(r.hyperfocal * 10) / 10; distance.setValue(state.distance); update(); } })]),
      el('p', { class: 'muted small', style: 'margin:8px 0 0', text: [
        t('calc.dof.coc', { coc: fmtNum(r.coc, 3) }),
        fm.crop !== 1 && state.focal > 0 ? t('calc.dof.equivalent', { mm: fmtNum(state.focal * fm.crop, 0) }) : '',
      ].filter(Boolean).join(' ') }),
    );
    setSession('dof', state);
  }
  update();
  return () => {};
}
