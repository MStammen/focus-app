// Rechner: Sterne. Längste Zeit ohne Strichspuren (500er- und NPF-Regel), Startwerte für die Milchstraße,
// Sternspuren-Planer und Mondphase. Rechnungen in core/stars.js.
import { rule500, pixelPitch, ruleNpf, starIso, trailPlan, moonPhase, nextMoons } from '../core/stars.js';
import { DOF_FORMATS } from '../core/dof.js';
import { standardSeries, nearestStandard } from '../core/exposure.js';
import { el, numberField, seriesSelect, stepFromSetting, fmtNum, fmtAperture, fmtShutter, button, bigValue } from '../lib/ui.js';
import { getSession, setSession } from '../lib/session.js';
import { ownSensorCrop } from '../lib/camera-profile.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/** Mond als kleine Scheibe: beleuchteter Teil rechts beim zunehmenden, links beim abnehmenden Mond (Nordhalbkugel). */
function moonIcon({ illumination, waxing }) {
  const r = 20, c = 24;
  const svg = svgEl('svg', { class: 'moon-icon', viewBox: '0 0 48 48', 'aria-hidden': 'true' });
  svg.append(svgEl('circle', { class: 'moon-dark', cx: c, cy: c, r }));
  const rx = Math.abs(1 - 2 * illumination) * r;
  const lit = svgEl('path', { class: 'moon-lit', d: `M${c} ${c - r} A${r} ${r} 0 0 1 ${c} ${c + r} A${rx} ${r} 0 0 ${illumination > 0.5 ? 1 : 0} ${c} ${c - r} Z` });
  if (!waxing) lit.setAttribute('transform', `translate(${2 * c} 0) scale(-1 1)`);
  svg.append(lit);
  return svg;
}

export async function init(root, ctx) {
  const { t } = ctx;
  const step = stepFromSetting(ctx);
  const state = getSession('stars', { focal: 14, aperture: 2.8, megapixels: 24, format: null, frame: 30, gap: 1, total: 60 });
  if (!state.format) {
    const crop = await ownSensorCrop(ctx);
    state.format = DOF_FORMATS.find((f) => f.crop === crop)?.id || 'ff';
  }
  const save = () => setSession('stars', state);
  const card = (title, kids) => el('div', { class: 'card' }, [el('h2', { text: title, style: 'margin-top:0' }), ...kids]);
  const row = (label, value, hint) => el('div', { class: 'row' }, [
    el('span', { class: 'row-label' }, [el('span', { text: label }), hint ? el('span', { class: 'row-hint', text: hint }) : null]),
    el('strong', { text: value }),
  ]);
  // Mond-Zeilen: Bezeichnung über dem Datum, weil die Daten lang sind
  const stack = (label, value, hint) => el('div', { class: 'moon-row' }, [el('div', { class: 'muted small', text: label }), el('div', { class: 'moon-row-value', text: value }), hint ? el('div', { class: 'muted small', text: hint }) : null]);
  const secs = (s) => (s < 60 ? `${fmtNum(s, s < 10 ? 1 : 0)} s` : fmtShutter(s));

  // ---- 1 + 2: Sterne als Punkte, Startwerte ----
  const focal = numberField({ label: t('calc.stars.focal'), value: state.focal, unit: 'mm', min: 1, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { state.focal = v; update(); } });
  const aperture = seriesSelect({ kind: 'aperture', step, value: state.aperture, label: t('common.aperture'), onChange: (v) => { state.aperture = v; update(); } });
  const mp = numberField({ label: t('calc.stars.megapixels'), value: state.megapixels, unit: 'MP', min: 1, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { state.megapixels = v; update(); } });
  const formatSel = el('select', { class: 'select' }, DOF_FORMATS.map((f) => el('option', { value: f.id, text: t(`calc.dof.formats.${f.id}`), selected: f.id === state.format })));
  formatSel.addEventListener('change', () => { state.format = formatSel.value; update(); });
  const pointsOut = el('div');
  const startOut = el('div');
  root.append(
    card(t('calc.stars.pointsTitle'), [
      el('div', { class: 'fields' }, [focal.field, aperture.field]),
      el('div', { class: 'fields' }, [el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('calc.dof.format') }), formatSel]), mp.field]),
      pointsOut,
    ]),
    card(t('calc.stars.startTitle'), [el('div', { class: 'stars-start' }, [startOut])]),
  );

  function update() {
    pointsOut.innerHTML = ''; startOut.innerHTML = '';
    const crop = (DOF_FORMATS.find((f) => f.id === state.format) || DOF_FORMATS[0]).crop;
    if (!(state.focal > 0 && state.megapixels > 0)) { pointsOut.appendChild(el('p', { class: 'muted', text: t('calc.stars.invalid') })); save(); return; }
    const t500 = rule500(state.focal, crop);
    const tNpf = ruleNpf(state.focal, state.aperture, pixelPitch(state.megapixels, crop));
    pointsOut.append(
      bigValue({ label: t('calc.stars.maxTime'), value: secs(tNpf), sub: t('calc.stars.maxTimeSub') }),
      row(t('calc.stars.npf'), secs(tNpf), t('calc.stars.npfHint')),
      row(t('calc.stars.rule500'), secs(t500), t('calc.stars.rule500Hint')),
    );
    // Startwerte: längste Standardzeit unter der NPF-Grenze, ISO passend zu den üblichen Milchstraßen-Werten
    const series = standardSeries('shutter', 1 / 3).filter((s) => s <= tNpf);
    const shutter = series.length ? series[series.length - 1] : tNpf;
    const iso = Math.min(25600, Math.max(100, nearestStandard(starIso(state.aperture, shutter), 'iso', 1 / 3)));
    startOut.append(
      bigValue({ label: t('calc.stars.startValues'), value: `${fmtAperture(state.aperture)} · ${fmtShutter(shutter)} · ISO\u00a0${Math.round(iso)}`, sub: t('calc.stars.startSub') }),
      el('p', { class: 'muted small', style: 'margin:6px 0 0', text: t('calc.stars.startTips') }),
      el('div', { class: 'btn-row' }, [
        button(t('calc.stars.toExposure'), { primary: true, onClick: () => {
          const v = { aperture: state.aperture, shutter, iso };
          setSession('exposure', { ...getSession('exposure', {}), src: { ...v }, dst: { ...v }, yield: 'shutter' });
          ctx.navigate('calc/exposure');
        } }),
        button(t('calc.stars.toTimer'), { onClick: () => ctx.navigate(`timer?seconds=${shutter}`) }),
      ]),
    );
    save();
  }

  // ---- 3: Sternspuren ----
  const frame = numberField({ label: t('calc.stars.frame'), value: state.frame, unit: 's', min: 1, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { state.frame = v; updateTrails(); } });
  const gap = numberField({ label: t('calc.stars.gap'), value: state.gap, unit: 's', min: 0, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { state.gap = v; updateTrails(); } });
  const total = numberField({ label: t('calc.stars.total'), value: state.total, unit: 'min', min: 1, stepAttr: '5', inputmode: 'numeric', onChange: (v) => { state.total = v; updateTrails(); } });
  const trailsOut = el('div');
  root.appendChild(card(t('calc.stars.trailsTitle'), [el('div', { class: 'fields' }, [frame.field, gap.field]), el('div', { class: 'fields' }, [total.field]), trailsOut]));
  function updateTrails() {
    trailsOut.innerHTML = '';
    const p = trailPlan({ frameSeconds: state.frame, gapSeconds: state.gap ?? 0, totalMinutes: state.total });
    if (!p) { trailsOut.appendChild(el('p', { class: 'muted', text: t('calc.stars.invalid') })); save(); return; }
    trailsOut.append(
      bigValue({ label: t('calc.stars.frames'), value: String(p.frames), sub: t('calc.stars.framesSub', { arc: fmtNum(p.arcDegrees, 0) }) }),
      el('p', { class: 'muted small', style: 'margin:6px 0 0', text: t('calc.stars.trailsTips') }),
    );
    save();
  }

  // ---- 4: Mond ----
  const now = new Date();
  const ph = moonPhase(now);
  const { newMoons, fullMoons } = nextMoons(now, 2);
  const fmtDate = (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const name = ph.illumination < 0.03 ? 'new' : ph.illumination > 0.97 ? 'full' : ph.waxing ? 'waxing' : 'waning';
  const dark = (d) => `${fmtDate(new Date(d.getTime() - 3 * 86400000))} – ${fmtDate(new Date(d.getTime() + 3 * 86400000))}`;
  root.appendChild(card(t('calc.stars.moonTitle'), [
    el('div', { class: 'moon-today' }, [moonIcon(ph), el('div', {}, [
      el('div', { class: 'big-value-label', text: t('calc.stars.moonToday') }),
      el('div', { class: 'moon-name', text: `${t(`calc.stars.moon.${name}`)} · ${fmtNum(ph.illumination * 100, 0)} %` }),
      el('div', { class: 'muted small', text: t(ph.illumination < 0.25 ? 'calc.stars.moonGood' : ph.illumination < 0.6 ? 'calc.stars.moonOk' : 'calc.stars.moonBad') }),
    ])]),
    stack(t('calc.stars.nextNew'), newMoons.map(fmtDate).join(' · ')),
    stack(t('calc.stars.nextFull'), fullMoons.map(fmtDate).join(' · ')),
    stack(t('calc.stars.darkNights'), dark(newMoons[0]), t('calc.stars.darkNightsHint')),
    el('p', { class: 'muted small', style: 'margin:8px 0 0', text: t('calc.stars.moonNote') }),
  ]));

  update();
  updateTrails();
  return () => {};
}
