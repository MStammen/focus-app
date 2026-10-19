// Rechner 4.2 ND-Filter: zwei Richtungen.
//   Filter → Zeit: Ausgangszeit + Filterstapel → neue Zeit.
//   Zeit → Filter: Ausgangszeit + gewünschte Zeit → passende Filter aus „Meine Filter“ (suggestNdFilters).
import { ndStops, shutterWithNd, nearestStandard, ND_FILTERS, suggestNdFilters } from '../core/exposure.js';
import { el, seriesSelect, numberField, stepFromSetting, fmtShutter, fmtNum, button, chip, bigValue, segmented } from '../lib/ui.js';
import { getSession, setSession } from '../lib/session.js';
import { cameraBridge } from '../lib/camera-bridge.js';

const TARGETS = [1, 2, 4, 8, 15, 30, 60, 120, 240, 480]; // gängige Zielzeiten in Sekunden
const OWN_DEFAULT = ['ND8', 'ND64', 'ND1000'];
const DENSITIES = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.2, 4.5, 4.8, 5.0];

function toCore(f) {
  if (f.kind === 'factor') return { factor: f.value };
  if (f.kind === 'density') return { density: f.value };
  return { stops: f.value };
}

export async function init(page, ctx) {
  const { t } = ctx;
  const step = stepFromSetting(ctx);
  const state = getSession('nd', { base: getSession('lastShutter', 1 / 125), filters: [] });
  state.dir = state.dir || 'target';
  state.target = state.target || 30;

  // Richtung wählen; „Zeit → Filter“ zuerst, weil man draußen meist eine Zielzeit im Kopf hat
  const root = el('div');
  const targetView = el('div');
  const dirBar = segmented({
    ariaLabel: t('calc.nd.direction'), active: state.dir,
    items: ['target', 'stack'].map((id) => ({ id, label: t(`calc.nd.dir.${id}`) })),
    onSelect: (id) => { state.dir = id; showDir(); },
  });
  page.append(dirBar, targetView, root);
  function showDir() {
    targetView.hidden = state.dir !== 'target';
    root.hidden = state.dir !== 'stack';
    dirBar.querySelectorAll('.segment').forEach((s, i) => s.setAttribute('aria-current', ['target', 'stack'][i] === state.dir ? 'true' : 'false'));
    setSession('nd', state);
    if (state.dir === 'target') recomputeTarget();
  }

  // Ausgangszeit
  const baseCard = el('div', { class: 'card' });
  const base = seriesSelect({ kind: 'shutter', step, value: state.base, label: t('calc.nd.base'), onChange: (v) => { state.base = v; recompute(); } });
  baseCard.appendChild(base.field);
  const lastShutter = getSession('lastShutter', null);
  if (lastShutter) {
    baseCard.appendChild(el('div', { class: 'btn-row' }, [
      button(`${t('calc.nd.fromExposure')} (${fmtShutter(lastShutter)})`, { onClick: () => { state.base = lastShutter; base.setValue(lastShutter); recompute(); } }),
    ]));
  }
  root.appendChild(baseCard);

  // Filter hinzufügen
  const addCard = el('div', { class: 'card' }, [el('h2', { text: t('calc.nd.addFilter'), style: 'margin-top:0' })]);
  const select = el('select', { class: 'select', 'aria-label': t('calc.nd.addFilter') });
  const gNd = el('optgroup', { label: t('calc.nd.optgroupNd') });
  for (const f of ND_FILTERS) gNd.appendChild(el('option', { value: `f:${f.factor}`, text: `${f.name} · ${fmtNum(ndStops({ factor: f.factor }), 1)} ${t('common.stops')}` }));
  const gD = el('optgroup', { label: t('calc.nd.optgroupDensity') });
  for (const d of DENSITIES) gD.appendChild(el('option', { value: `d:${d}`, text: `${t('calc.nd.density', { d: fmtNum(d, 1) })} · ${fmtNum(ndStops({ density: d }), 1)} ${t('common.stops')}` }));
  const gS = el('optgroup', { label: t('calc.nd.optgroupStops') });
  gS.appendChild(el('option', { value: 's', text: t('calc.nd.customStops') }));
  select.append(gNd, gD, gS);
  const stopsInput = numberField({ label: t('calc.nd.stopsInput'), value: 3, min: 0, max: 30, stepAttr: '0.1' });
  stopsInput.field.hidden = true;
  select.addEventListener('change', () => { stopsInput.field.hidden = select.value !== 's'; });
  addCard.appendChild(el('div', { class: 'fields' }, [el('div', { class: 'field' }, [el('span', { class: 'field-label', text: t('calc.nd.addFilter') }), select]), stopsInput.field]));
  addCard.appendChild(el('div', { class: 'btn-row' }, [button(t('calc.nd.add'), {
    primary: true,
    onClick: () => {
      const v = select.value;
      if (v === 's') {
        const n = stopsInput.getValue();
        if (!(n > 0)) return;
        state.filters.push({ kind: 'stops', value: n });
      } else if (v.startsWith('f:')) {
        const factor = Number(v.slice(2));
        state.filters.push({ kind: 'factor', value: factor, name: ND_FILTERS.find((f) => f.factor === factor)?.name || `ND${factor}` });
      } else {
        state.filters.push({ kind: 'density', value: Number(v.slice(2)) });
      }
      recompute();
    },
  })]));
  root.appendChild(addCard);

  // Stapel
  const stackCard = el('div', { class: 'card' }, [el('h2', { text: t('calc.nd.filters'), style: 'margin-top:0' })]);
  const chips = el('div', { class: 'chips' });
  const emptyNote = el('p', { class: 'muted small', text: t('calc.nd.none') });
  stackCard.append(chips, emptyNote);
  root.appendChild(stackCard);

  // Ergebnis
  const resultCard = el('div', { class: 'card' });
  const big = el('div');
  const calcLine = el('p', { class: 'calc-line small' });
  const timerBtn = button(t('calc.nd.timer'), { primary: true, block: true });
  const shortNote = el('p', { class: 'muted small', style: 'text-align:center', text: t('calc.nd.timerShort') });
  const bridge = cameraBridge(ctx);
  resultCard.append(big, calcLine, timerBtn, shortNote, bridge.el);
  root.appendChild(resultCard);

  function filterLabel(f) {
    const exact = ndStops(toCore(f));
    const nominal = Math.round(exact);
    if (f.kind === 'stops') return `${fmtNum(f.value, 1)} ${t('common.stops')}`;
    const name = f.kind === 'factor' ? f.name : t('calc.nd.density', { d: fmtNum(f.value, 1) });
    const exactText = Math.abs(exact - nominal) > 0.005 ? ` (${t('calc.nd.exactStops', { stops: fmtNum(exact, 2) })})` : '';
    return `${name} · ${t('calc.nd.stopsLabel', { stops: nominal })}${exactText}`;
  }

  function recompute() {
    chips.innerHTML = '';
    state.filters.forEach((f, i) => {
      chips.appendChild(chip(filterLabel(f), { removeLabel: t('common.remove'), onRemove: () => { state.filters.splice(i, 1); recompute(); } }));
    });
    emptyNote.hidden = state.filters.length > 0;

    const total = state.filters.reduce((s, f) => s + ndStops(toCore(f)), 0);
    const result = shutterWithNd(state.base, state.filters.map(toCore));
    const nearest = nearestStandard(result, 'shutter', step);
    const differs = Math.abs(Math.log2(result / nearest)) > 0.005;
    big.innerHTML = '';
    big.appendChild(bigValue({
      label: t('calc.nd.result'),
      value: fmtShutter(result),
      sub: `${t('calc.nd.total', { stops: fmtNum(total, 2) })}${differs ? ' · ' + t('calc.nd.nearest', { value: fmtShutter(nearest) }) : ''}`,
    }));
    calcLine.textContent = t('calc.nd.calcLine', { base: fmtShutter(state.base), stops: fmtNum(total, 2), result: fmtShutter(result) });
    const ok = result >= 1;
    timerBtn.hidden = !ok;
    shortNote.hidden = ok;
    timerBtn.onclick = () => ctx.navigate(`timer?seconds=${result}`);
    bridge.update({ seconds: result });
    setSession('nd', state);
    setSession('ndResult', result);
  }

  // ---------- Zeit → Filter ----------
  const tBaseCard = el('div', { class: 'card' });
  const tBase = seriesSelect({ kind: 'shutter', step, value: state.base, label: t('calc.nd.baseMeasured'), onChange: (v) => { state.base = v; base.setValue(v); recomputeTarget(); recompute(); } });
  tBaseCard.appendChild(tBase.field);
  if (lastShutter) tBaseCard.appendChild(el('div', { class: 'btn-row' }, [button(`${t('calc.nd.fromExposure')} (${fmtShutter(lastShutter)})`, { onClick: () => { state.base = lastShutter; tBase.setValue(lastShutter); base.setValue(lastShutter); recomputeTarget(); recompute(); } })]));
  targetView.appendChild(tBaseCard);

  const goalCard = el('div', { class: 'card' }, [el('h2', { text: t('calc.nd.target'), style: 'margin-top:0' })]);
  const goalChips = el('div', { class: 'chips' });
  const goalInput = numberField({ label: t('calc.nd.targetSeconds'), value: state.target, min: 0.1, stepAttr: 'any', inputmode: 'decimal' });
  const markGoal = () => goalChips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.s) === state.target)));
  for (const s of TARGETS) goalChips.appendChild(el('button', { type: 'button', class: 'chip quick', dataset: { s: String(s) }, text: fmtShutter(s), onClick: () => { state.target = s; goalInput.input.value = String(s); markGoal(); recomputeTarget(); } }));
  goalInput.input.addEventListener('input', () => { const v = goalInput.getValue(); if (v > 0) { state.target = v; markGoal(); recomputeTarget(); } });
  goalCard.append(goalChips, goalInput.field);
  targetView.appendChild(goalCard);

  // Meine Filter: welche ND-Filter man besitzt (Einstellung, gilt für alle Vorschläge)
  const ownCard = el('div', { class: 'card' }, [el('h2', { text: t('calc.nd.own'), style: 'margin-top:0' })]);
  const ownChips = el('div', { class: 'chips' });
  const ownNames = () => ctx.getSetting('ndOwn', OWN_DEFAULT);
  const drawOwn = () => {
    ownChips.innerHTML = '';
    for (const f of ND_FILTERS) {
      const on = ownNames().includes(f.name);
      ownChips.appendChild(el('button', { type: 'button', class: 'chip quick', 'aria-pressed': String(on), text: `${f.name} · ${fmtNum(ndStops(f), 0)}`, onClick: () => {
        const list = new Set(ownNames());
        if (list.has(f.name)) list.delete(f.name); else list.add(f.name);
        ctx.setSetting('ndOwn', ND_FILTERS.map((x) => x.name).filter((n) => list.has(n)));
        drawOwn(); recomputeTarget();
      } }));
    }
  };
  drawOwn();
  ownCard.append(ownChips, el('p', { class: 'muted small', style: 'margin:6px 0 0', text: t('calc.nd.ownHint') }));
  targetView.appendChild(ownCard);

  const sugCard = el('div', { class: 'card' });
  const tBridge = cameraBridge(ctx);
  targetView.appendChild(sugCard);
  targetView.appendChild(tBridge.el);

  function recomputeTarget() {
    if (!(state.base > 0) || !(state.target > 0)) return;
    const needed = Math.log2(state.target / state.base);
    const own = ND_FILTERS.filter((f) => ownNames().includes(f.name));
    sugCard.innerHTML = '';
    sugCard.appendChild(bigValue({ label: t('calc.nd.needed'), value: needed > 0 ? t('calc.nd.stopsShort', { stops: fmtNum(needed, 1) }) : '0', sub: t('calc.nd.neededLine', { base: fmtShutter(state.base), target: fmtShutter(state.target) }) }));
    if (needed <= 0.3) { sugCard.appendChild(el('p', { class: 'small', text: t('calc.nd.noFilter') })); tBridge.update({ seconds: state.base }); setSession('nd', state); return; }
    if (!own.length) { sugCard.appendChild(el('p', { class: 'notice small', text: t('calc.nd.ownEmpty') })); setSession('nd', state); return; }
    const list = el('div', { class: 'nd-suggest' });
    suggestNdFilters(needed, own).forEach((s, i) => {
      const time = state.base * Math.pow(2, s.stops);
      const diff = s.error;
      const note = Math.abs(diff) < 0.2 ? t('calc.nd.fits') : diff > 0 ? t('calc.nd.longer', { stops: fmtNum(diff, 1) }) : t('calc.nd.shorter', { stops: fmtNum(-diff, 1) });
      const row = el('div', { class: `nd-suggest-row${i === 0 ? ' best' : ''}` }, [
        el('div', { class: 'nd-suggest-filters', text: s.filters.map((f) => f.name).join(' + ') }),
        el('div', { class: 'nd-suggest-time', text: t('calc.nd.resultTime', { time: fmtShutter(time) }) }),
        el('div', { class: 'muted small', text: `${fmtNum(s.stops, 1)} ${t('common.stops')} · ${note}` }),
        el('div', { class: 'btn-row', style: 'margin-top:6px' }, [
          time >= 1 ? button(t('calc.nd.timer'), { primary: i === 0, onClick: () => ctx.navigate(`timer?seconds=${time}`) }) : null,
          button(t('calc.nd.toStack'), { onClick: () => { state.filters = s.filters.map((f) => ({ kind: 'factor', value: f.factor, name: f.name })); state.dir = 'stack'; recompute(); showDir(); } }),
        ]),
      ]);
      list.appendChild(row);
      if (i === 0) tBridge.update({ seconds: time });
    });
    sugCard.appendChild(el('h2', { text: t('calc.nd.suggestions'), style: 'margin:12px 0 8px' }));
    sugCard.appendChild(list);
    setSession('nd', state);
  }

  markGoal();
  recompute();
  showDir();
  return () => {};
}
