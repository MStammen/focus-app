// Rechner 4.3 Lochkamera: Loch messen, Loch bauen, Belichtung übertragen.
import { fNumber, optimalDiameter, rateDiameter, angleOfView, transferExposure, FORMATS } from '../core/pinhole.js';
import { el, segmented, numberField, seriesSelect, stepFromSetting, fmtNum, fmtAperture, fmtShutter, fmtStops, button, bigValue } from '../lib/ui.js';
import { getSession, setSession } from '../lib/session.js';
import { cameraBridge } from '../lib/camera-bridge.js';

const MODES = ['have', 'build', 'transfer'];

export async function init(root, ctx) {
  const { t } = ctx;
  const step = stepFromSetting(ctx);
  const state = getSession('pinhole', {
    mode: 'have',
    have: { diameter: 0.3, focal: 50 },
    build: { focal: 50, format: '135', canWidth: 100 },
    transfer: { aperture: 8, shutter: 1 / 125, iso: 100, pinholeAperture: null, filmIso: 100 },
  });

  const body = el('div');
  root.appendChild(segmented({
    ariaLabel: t('calc.tabs.pinhole'),
    active: state.mode,
    items: MODES.map((id) => ({ id, label: t(`calc.pinhole.${id}`) })),
    onSelect: (id) => { state.mode = id; setSession('pinhole', state); root.replaceChild(render(), body0()); },
  }));
  root.appendChild(body);
  function body0() { return root.querySelector('.pinhole-body'); }

  function render() {
    const wrap = el('div', { class: 'pinhole-body' });
    if (state.mode === 'have') renderHave(wrap);
    else if (state.mode === 'build') renderBuild(wrap);
    else renderTransfer(wrap);
    return wrap;
  }
  body.className = 'pinhole-body';
  root.replaceChild(render(), body);

  // ---- Ich habe ein Loch ----
  function renderHave(wrap) {
    const s = state.have;
    const out = el('div', { class: 'card' });
    const d = numberField({ label: t('calc.pinhole.diameter'), value: s.diameter, unit: 'mm', min: 0.01, stepAttr: '0.01', onChange: (v) => { s.diameter = v; update(); } });
    const f = numberField({ label: t('calc.pinhole.focal'), value: s.focal, unit: 'mm', min: 1, stepAttr: '1', onChange: (v) => { s.focal = v; update(); } });
    wrap.appendChild(el('div', { class: 'card' }, [el('div', { class: 'fields' }, [d.field, f.field])]));
    wrap.appendChild(out);
    function update() {
      out.innerHTML = '';
      if (!(s.diameter > 0 && s.focal > 0)) { out.appendChild(el('p', { class: 'muted', text: t('calc.pinhole.invalid') })); return; }
      const n = fNumber(s.diameter, s.focal);
      const rating = rateDiameter(s.diameter, s.focal);
      out.appendChild(bigValue({ label: t('calc.pinhole.fnumber'), value: fmtAperture(n), sub: t('calc.pinhole.fnumberFormula') }));
      out.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'row-label' }, [el('span', { text: t('calc.pinhole.optimum') }), el('span', { class: 'row-hint', text: t('calc.pinhole.optimumFormula') })]),
        el('strong', { text: `${fmtNum(rating.optimum, 2)} mm` }),
      ]));
      out.appendChild(el('div', { class: 'row' }, [
        el('span', { class: 'row-label' }, [
          el('span', { class: rating.verdict === 'nearOptimum' ? 'status-ok' : 'status-warn', text: t(`calc.pinhole.rating.${rating.verdict}`) }),
          el('span', { class: 'row-hint', text: t('calc.pinhole.ratio', { percent: fmtNum(rating.ratio * 100, 0) }) }),
        ]),
      ]));
      out.appendChild(el('div', { class: 'btn-row' }, [
        button(t('calc.pinhole.transfer'), { primary: true, onClick: () => { state.transfer.pinholeAperture = n; state.transfer.fromHave = true; state.mode = 'transfer'; setSession('pinhole', state); root.replaceChild(render(), body0()); root.querySelector('.segmented .segment[aria-current]')?.removeAttribute('aria-current'); root.querySelectorAll('.segmented .segment')[2]?.setAttribute('aria-current', 'true'); } }),
      ]));
      setSession('pinhole', state);
      setSession('pinholeAperture', n);
    }
    update();
  }

  // ---- Ich baue ein Loch ----
  function renderBuild(wrap) {
    const s = state.build;
    const out = el('div', { class: 'card' });
    const f = numberField({ label: t('calc.pinhole.focal'), value: s.focal, unit: 'mm', min: 1, stepAttr: '1', onChange: (v) => { s.focal = v; update(); } });
    const formatSel = el('select', { class: 'select' });
    for (const fm of FORMATS) formatSel.appendChild(el('option', { value: fm.id, text: fm.name, selected: fm.id === s.format }));
    formatSel.addEventListener('change', () => { s.format = formatSel.value; canField.field.hidden = s.format !== 'can'; update(); });
    const canField = numberField({ label: t('calc.pinhole.canWidth'), value: s.canWidth, unit: 'mm', min: 1, stepAttr: '1', onChange: (v) => { s.canWidth = v; update(); } });
    canField.field.hidden = s.format !== 'can';
    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'fields' }, [f.field, el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('calc.pinhole.format') }), formatSel])]),
      canField.field,
    ]));
    wrap.appendChild(out);
    function update() {
      out.innerHTML = '';
      if (!(s.focal > 0)) { out.appendChild(el('p', { class: 'muted', text: t('calc.pinhole.invalid') })); return; }
      const dOpt = optimalDiameter(s.focal);
      const n = fNumber(dOpt, s.focal);
      const fm = FORMATS.find((x) => x.id === s.format) || FORMATS[0];
      const w = fm.id === 'can' ? s.canWidth : fm.width;
      const h = fm.id === 'can' ? null : fm.height;
      const a = angleOfView(s.focal, w, h);
      out.appendChild(bigValue({ label: t('calc.pinhole.optimum'), value: `${fmtNum(dOpt, 2)} mm`, sub: t('calc.pinhole.optimumFormula') }));
      out.appendChild(el('div', { class: 'row' }, [el('span', { class: 'row-label', text: t('calc.pinhole.fnumber') }), el('strong', { text: fmtAperture(n) })]));
      const parts = [];
      if (a.horizontal) parts.push(`${fmtNum(a.horizontal, 0)}° ${t('calc.pinhole.angleH')}`);
      if (a.vertical) parts.push(`${fmtNum(a.vertical, 0)}° ${t('calc.pinhole.angleV')}`);
      if (a.diagonal) parts.push(`${fmtNum(a.diagonal, 0)}° ${t('calc.pinhole.angleD')}`);
      out.appendChild(el('div', { class: 'row' }, [el('span', { class: 'row-label', text: t('calc.pinhole.angle') }), el('strong', { text: parts.join(' · ') || '–' })]));
      setSession('pinhole', state);
      setSession('pinholeAperture', n);
    }
    update();
  }

  // ---- Belichtung übertragen ----
  function renderTransfer(wrap) {
    const s = state.transfer;
    if (!s.pinholeAperture) s.pinholeAperture = getSession('pinholeAperture', 250);
    const last = getSession('lastExposure', null);
    if (last && !s.touched) { s.aperture = last.aperture; s.shutter = last.shutter; s.iso = last.iso; }
    const refCard = el('div', { class: 'card' }, [el('h2', { text: t('calc.pinhole.reference'), style: 'margin-top:0' })]);
    const fields = el('div', { class: 'fields' });
    const sel = {};
    for (const k of ['aperture', 'shutter', 'iso']) {
      sel[k] = seriesSelect({ kind: k, step, value: s[k], label: t(`common.${k}`), onChange: (v) => { s[k] = v; s.touched = true; update(); } });
      fields.appendChild(sel[k].field);
    }
    refCard.appendChild(fields);
    wrap.appendChild(refCard);

    const pinCard = el('div', { class: 'card' });
    const n = numberField({ label: t('calc.pinhole.pinholeAperture'), value: Math.round(s.pinholeAperture * 10) / 10, min: 1, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { s.pinholeAperture = v; s.fromHave = false; update(); } });
    const filmIso = seriesSelect({ kind: 'iso', step: 1 / 3, value: s.filmIso, label: t('calc.pinhole.filmIso'), onChange: (v) => { s.filmIso = v; update(); } });
    pinCard.appendChild(el('div', { class: 'fields' }, [n.field, filmIso.field]));
    const fromHave = el('p', { class: 'muted small', text: t('calc.pinhole.fromHave') });
    pinCard.appendChild(fromHave);
    wrap.appendChild(pinCard);

    const out = el('div', { class: 'card' });
    wrap.appendChild(out);

    function update() {
      fromHave.hidden = !s.fromHave;
      out.innerHTML = '';
      if (!(s.pinholeAperture > 0)) { out.appendChild(el('p', { class: 'muted', text: t('calc.pinhole.invalid') })); return; }
      const r = transferExposure({ aperture: s.aperture, shutter: s.shutter, iso: s.iso }, s.pinholeAperture, s.filmIso);
      out.appendChild(bigValue({ label: t('calc.pinhole.resultTime'), value: fmtShutter(r.seconds),
        sub: t('calc.pinhole.stopsLine', { a: fmtStops(r.apertureStops), i: fmtStops(r.isoStops), t: fmtStops(r.totalStops) }) }));
      out.appendChild(el('div', { class: 'btn-row' }, [
        button(t('calc.pinhole.schwarzschild'), { primary: true, onClick: () => ctx.navigate(`calc/film?seconds=${r.seconds}`) }),
        r.seconds >= 1 ? button(t('calc.pinhole.timer'), { onClick: () => ctx.navigate(`timer?seconds=${r.seconds}`) }) : null,
      ]));
      const bridge = cameraBridge(ctx); bridge.update({ seconds: r.seconds, iso: s.filmIso }); out.appendChild(bridge.el);
      setSession('pinhole', state);
      setSession('lastShutter', r.seconds);
    }
    update();
  }

  return () => {};
}
