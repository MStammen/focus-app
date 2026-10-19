// Rechner 4.1 Belichtung: Ausgangsmessung → Zielwerte bei gleicher Belichtung.
import { ev, shutterFor, apertureFor, isoFor, nearestStandard, stopsBetween } from '../core/exposure.js';
import { el, seriesSelect, segmented, STEP_OPTIONS, stepFromSetting, fmtValue, fmtStops, fmtNum, button } from '../lib/ui.js';
import { getSession, setSession } from '../lib/session.js';
import { cameraDials } from '../lib/camera-svg.js';
import { cameraBridge } from '../lib/camera-bridge.js';

// Modus ↔ welcher Wert nachgibt: Av → Zeit, Tv → Blende, M mit ISO-Automatik → ISO
const MODE_YIELD = { aperturePriority: 'shutter', shutterPriority: 'aperture', manual: 'iso' };
const YIELD_MODE = { shutter: 'aperturePriority', aperture: 'shutterPriority', iso: 'manual' };

const KINDS = ['aperture', 'shutter', 'iso'];
// Lichtwert-Helfer: Lichtwerte bei ISO 100 nach ANSI PH2.7 (gerundet, Tabelle „Exposure value“ in der englischen Wikipedia).
// Bei Spannen ist ev die Mitte, range die Spanne aus der Tabelle. Texte: calc.light.items.<id>
const LIGHT_GROUPS = [
  ['day', [['snow', 16], ['sun', 15], ['hazy', 14], ['cloudy', 13], ['overcast', 12], ['shade', 12]]],
  ['evening', [['beforeSunset', 13, '12–14'], ['sunset', 12], ['afterSunset', 10, '9–11']]],
  ['night', [['neon', 9.5, '9–10'], ['brightStreet', 8], ['nightStreet', 7.5, '7–8'], ['traffic', 5], ['floodlit', 4, '3–5'], ['distantCity', 2], ['fullMoonLight', -2.5, '−3 bis −2']]],
  ['indoor', [['office', 7.5, '7–8'], ['home', 6, '5–7']]],
];
const LIGHTS = Object.fromEntries(LIGHT_GROUPS.flatMap(([, items]) => items.map(([id, ev, range]) => [id, { ev, range }])));
const LOCK_OPEN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h-1V6a4 4 0 0 0-7.8-1.3l1.9.7A2 2 0 0 1 14 6v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-5 8.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>';
const LOCK_CLOSED = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V6zm2 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>';

export async function init(root, ctx) {
  const { t } = ctx;
  let step = stepFromSetting(ctx);
  const state = getSession('exposure', {
    src: { aperture: 8, shutter: 1 / 125, iso: 100 },
    dst: { aperture: 8, shutter: 1 / 125, iso: 100 },
    yield: 'shutter',
  });

  // Stufenraster
  function buildStepRow() {
    const row = el('div', { class: 'row' }, [
      el('span', { class: 'row-label', text: t('calc.stepGrid') }),
      segmented({
        small: true, ariaLabel: t('calc.stepGrid'),
        active: ctx.getSetting('stepGrid', '1/3'),
        items: STEP_OPTIONS.map((o) => ({ id: o.key, label: o.label })),
        onSelect: (key) => {
          ctx.setSetting('stepGrid', key);
          step = STEP_OPTIONS.find((o) => o.key === key).value;
          for (const k of KINDS) { src[k].setStep(step); dst[k].setStep(step); }
          recompute();
          row.replaceWith(buildStepRow());
        },
      }),
    ]);
    return row;
  }
  root.appendChild(buildStepRow());

  // Ausgangsmessung
  const src = {};
  const srcCard = el('div', { class: 'card' }, [el('h2', { text: t('calc.exposure.source'), style: 'margin-top:0' })]);
  const srcFields = el('div', { class: 'fields' });
  for (const k of KINDS) {
    src[k] = seriesSelect({ kind: k, step, value: state.src[k], label: t(`common.${k}`), onChange: (v) => { state.src[k] = v; state.light = null; showLight(); recompute(); } });
    srcFields.appendChild(src[k].field);
  }
  srcCard.appendChild(srcFields);
  const evLine = el('p', { class: 'muted small', style: 'margin:10px 0 0' });
  srcCard.appendChild(evLine);
  // Licht schätzen statt messen: Situation wählen → Zeit passend zu Blende und ISO der Ausgangsmessung
  const lightSel = el('select', { class: 'select', 'aria-label': t('calc.light.label') }, [
    el('option', { value: '', text: t('calc.light.none') }),
    ...LIGHT_GROUPS.map(([g, items]) => el('optgroup', { label: t(`calc.light.groups.${g}`) }, items.map(([id]) => el('option', { value: id, text: t(`calc.light.items.${id}`) })))),
  ]);
  const lightLine = el('p', { class: 'small', style: 'margin:6px 0 0' });
  srcCard.append(el('label', { class: 'field', style: 'margin-top:12px' }, [el('span', { class: 'field-label', text: t('calc.light.label') }), lightSel]), lightLine);
  function showLight() {
    const L = LIGHTS[state.light];
    lightSel.value = L ? state.light : '';
    lightLine.hidden = !L;
    if (!L) return;
    // Sehr lange Zeit: Beispiel mit offener Blende und höherer ISO nennen
    const long = state.src.shutter > 30 ? ` ${t('calc.light.long', { time: fmtValue('shutter', nearestStandard(shutterFor(L.ev, 2.8, 1600), 'shutter', 1 / 3)) })}` : '';
    lightLine.textContent = `${t('calc.light.line', { range: L.range ? t('calc.light.range', { range: L.range }) : '' })}${long} ${t('calc.light.hint')}`;
  }
  lightSel.addEventListener('change', () => {
    state.light = lightSel.value || null;
    const L = LIGHTS[state.light];
    if (L) {
      state.src.shutter = nearestStandard(shutterFor(L.ev, state.src.aperture, state.src.iso), 'shutter', step);
      src.shutter.setValue(state.src.shutter);
    }
    showLight();
    recompute();
  });
  showLight();
  root.appendChild(srcCard);

  // Stilisierte Kamera ohne Marke: zeigt die Zielwerte. Antippen des Modusrads wechselt den Modus.
  // Der Rechner hängt bewusst nicht an Marke und Modell aus den Einstellungen.
  const dials = cameraDials({ ...state.dst, onModeSelect: (m) => { if (MODE_YIELD[m]) setYield(MODE_YIELD[m]); } });
  root.appendChild(el('div', { class: 'card' }, [dials.el]));

  // Ziel
  const dst = {};
  const readouts = {};
  const locks = {};
  const dstCard = el('div', { class: 'card' }, [
    el('h2', { text: t('calc.exposure.target'), style: 'margin-top:0' }),
    el('p', { class: 'muted small', text: t('calc.exposure.yieldHint') }),
  ]);
  // Modus direkt wählen: legt fest, welcher Wert nachgibt (wie das Schloss)
  const modeBar = el('div', { class: 'segmented small calc-modes', role: 'group', 'aria-label': t('calc.exposure.modeLabel') });
  const modeLine = el('p', { class: 'small mode-line' });
  dstCard.append(el('span', { class: 'field-label', text: t('calc.exposure.modeLabel') }), modeBar, modeLine);
  function updateModeLine() {
    const concept = YIELD_MODE[state.yield];
    // Umschalter mit neutralen Bezeichnungen (Kürzel der gängigen Marken in Klammern)
    modeBar.replaceChildren(...Object.keys(MODE_YIELD).map((m) => el('button', {
      type: 'button', class: 'segment', 'aria-current': m === concept ? 'true' : 'false',
      text: t(`calc.exposure.modeShort.${m}`),
      onClick: () => setYield(MODE_YIELD[m]),
    })));
    modeLine.textContent = t(`calc.exposure.modes.${concept}`);
  }
  for (const k of KINDS) {
    dst[k] = seriesSelect({ kind: k, step, value: state.dst[k], label: t(`common.${k}`), onChange: (v) => { state.dst[k] = v; recompute(); } });
    readouts[k] = el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: `${t(`common.${k}`)} · ${t('calc.exposure.computed')}` }),
      el('div', { class: 'readout', 'aria-live': 'polite' }),
      el('span', { class: 'muted small readout-sub' }),
    ]);
    locks[k] = el('button', {
      type: 'button', class: 'lock-button', 'aria-pressed': 'false',
      'aria-label': t('calc.exposure.lockLabel', { name: t(`common.${k}`) }),
      onClick: () => setYield(k),
    });
    dstCard.appendChild(el('div', { class: 'param-row' }, [dst[k].field, readouts[k], locks[k]]));
  }
  root.appendChild(dstCard);

  // Differenz
  const diffCard = el('div', { class: 'card' }, [el('h2', { text: t('calc.exposure.diffTitle'), style: 'margin-top:0' })]);
  const diffTable = el('table', { class: 'stops-table' });
  diffCard.appendChild(diffTable);
  const roundingNote = el('p', { class: 'muted small', style: 'margin:8px 0 0', text: t('calc.exposure.roundingNote') });
  diffCard.appendChild(roundingNote);
  root.appendChild(diffCard);

  const timerBtn = button(t('calc.exposure.timerButton'), { primary: true, block: true, onClick: () => ctx.navigate(`timer?seconds=${state.dst.shutter}`) });
  root.appendChild(timerBtn);
  const bridge = cameraBridge(ctx);
  root.appendChild(bridge.el);

  function setYield(k) {
    if (state.yield === k) return;
    // Der bisher berechnete Wert wird wieder wählbar: auf Standardwert einrasten.
    const prev = state.yield;
    state.dst[prev] = nearestStandard(state.dst[prev], prev, step);
    dst[prev].setValue(state.dst[prev]);
    state.yield = k;
    recompute();
  }

  function recompute() {
    const e = ev(state.src.aperture, state.src.shutter, state.src.iso);
    evLine.textContent = t('calc.exposure.ev', { value: fmtNum(e, 1) });
    const y = state.yield;
    if (y === 'shutter') state.dst.shutter = shutterFor(e, state.dst.aperture, state.dst.iso);
    else if (y === 'aperture') state.dst.aperture = apertureFor(e, state.dst.shutter, state.dst.iso);
    else state.dst.iso = isoFor(e, state.dst.aperture, state.dst.shutter);

    const used = { ...state.dst };
    for (const k of KINDS) {
      const isYield = k === y;
      dst[k].field.hidden = isYield;
      readouts[k].hidden = !isYield;
      locks[k].setAttribute('aria-pressed', String(isYield));
      locks[k].innerHTML = isYield ? LOCK_OPEN : LOCK_CLOSED;
      if (isYield) {
        const exact = state.dst[k];
        const nearest = nearestStandard(exact, k, step);
        const differs = Math.abs(Math.log2(exact / nearest)) > 0.005;
        readouts[k].querySelector('.readout').textContent = fmtValue(k, differs ? nearest : exact);
        const sub = readouts[k].querySelector('.readout-sub');
        sub.textContent = differs ? t('calc.exposure.exactLine', { value: fmtValue(k, exact) }) : '';
        if (nearest === exact && (k === 'iso' ? exact < 25 || exact > 102400 : k === 'aperture' ? exact > 256 || exact < 1 : exact < 1 / 8000 || exact > 28800)) {
          sub.textContent = t('calc.exposure.outOfRange');
        }
        used[k] = differs ? nearest : exact;
      }
    }

    diffTable.innerHTML = '';
    let sum = 0;
    for (const k of KINDS) {
      const s = stopsBetween(state.src[k], used[k], k);
      sum += s;
      diffTable.appendChild(el('tr', {}, [
        el('td', { text: t(`common.${k}`) }),
        el('td', { text: `${fmtValue(k, state.src[k])} → ${fmtValue(k, used[k])}` }),
        el('td', { text: fmtStops(s) }),
      ]));
    }
    diffTable.appendChild(el('tr', {}, [el('td', { text: t('calc.exposure.sum') }), el('td'), el('td', { text: fmtStops(sum) })]));
    roundingNote.hidden = Math.abs(sum) < 0.02;

    dials.update({ ...used, mode: state.yield === 'shutter' ? 'aperturePriority' : state.yield === 'aperture' ? 'shutterPriority' : 'manual' });
    updateModeLine();
    timerBtn.hidden = !(state.dst.shutter >= 1);
    bridge.update({ seconds: used.shutter, aperture: used.aperture, iso: used.iso });
    setSession('exposure', state);
    setSession('lastShutter', state.dst.shutter);
    setSession('lastExposure', { ...used });
  }

  recompute();
  return () => {};
}
