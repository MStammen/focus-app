// Rechner 4.4 Film / Schwarzschild: Filmwahl, gemessene Zeit → korrigierte Zeit, eigene Filme.
import { SUPPORT_TIMES, correctedTime, availablePoints, validateFilm, exportFilms } from '../core/film.js';
import { getAllFilms, getOverrides, setOverrides, saveCustomFilm, deleteCustomFilm, getCustomFilms, newCustomId } from '../lib/films-store.js';
import { el, numberField, fmtShutter, fmtNum, fmtStops, button, bigValue, downloadText } from '../lib/ui.js';
import { getSession, setSession } from '../lib/session.js';
import { cameraBridge } from '../lib/camera-bridge.js';

const QUICK = [1, 2, 4, 8, 15, 30, 60, 120];

export async function init(root, ctx) {
  const { t, query } = ctx;
  const state = getSession('film', { filmId: 'ilford-hp5-plus', measured: 30 });
  const q = parseFloat(query.get('seconds'));
  if (q > 0) state.measured = Math.round(q * 10) / 10;

  let films = await getAllFilms();
  let film = films.find((f) => f.id === state.filmId) || films[0];

  // Filmwahl
  const selectCard = el('div', { class: 'card' });
  const select = el('select', { class: 'select', 'aria-label': t('calc.film.film') });
  function fillSelect() {
    select.innerHTML = '';
    const gB = el('optgroup', { label: t('calc.film.builtin') });
    const gC = el('optgroup', { label: t('calc.film.custom') });
    for (const f of films) (f.custom ? gC : gB).appendChild(el('option', { value: f.id, text: `${f.name} · ISO ${f.iso}${f.hasOverrides ? ' *' : ''}`, selected: f.id === film.id }));
    select.appendChild(gB);
    if (gC.children.length) select.appendChild(gC);
  }
  fillSelect();
  select.addEventListener('change', () => { film = films.find((f) => f.id === select.value); state.filmId = film.id; rerender(); });
  const infoLine = el('p', { class: 'muted small', style: 'margin:8px 0 0' });
  const noteLine = el('p', { class: 'small', style: 'margin:6px 0 0' });
  selectCard.append(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('calc.film.film') }), select]), infoLine, noteLine);
  root.appendChild(selectCard);

  // Gemessene Zeit
  const measCard = el('div', { class: 'card' });
  const measured = numberField({ label: t('calc.film.measured'), value: state.measured, unit: 's', min: 0.1, stepAttr: '0.1', onChange: (v) => { state.measured = v; compute(); } });
  measCard.appendChild(measured.field);
  const quick = el('div', { class: 'chips' });
  for (const s of QUICK) {
    quick.appendChild(el('button', { type: 'button', class: 'chip quick', text: fmtShutter(s), 'aria-pressed': String(s === state.measured), onClick: () => { state.measured = s; measured.setValue(s); compute(); } }));
  }
  measCard.appendChild(quick);
  root.appendChild(measCard);

  // Ergebnis
  const resultCard = el('div', { class: 'card' });
  root.appendChild(resultCard);

  // Stützpunkte
  const pointsPanel = el('details', { class: 'panel' }, [el('summary', { text: t('calc.film.points') })]);
  const pointsBody = el('div', { class: 'panel-body' });
  pointsPanel.appendChild(pointsBody);
  root.appendChild(pointsPanel);

  // Eigene Filme
  const ownPanel = el('details', { class: 'panel' }, [el('summary', { text: t('calc.film.newFilm') })]);
  const ownBody = el('div', { class: 'panel-body' });
  ownPanel.appendChild(ownBody);
  root.appendChild(ownPanel);

  function rerender() {
    const src = film.source || {};
    infoLine.textContent = film.custom
      ? `${film.maker ? film.maker + ' · ' : ''}ISO ${film.iso}`
      : `${t('calc.film.source', { title: src.title || '–', date: src.date || '–' })}${film.hasOverrides ? ' · ' + t('calc.film.overridden') : ''}`;
    noteLine.textContent = film.note || '';
    compute();
    renderPoints();
    renderOwn();
    setSession('film', state);
  }

  function compute() {
    for (const c of quick.children) c.setAttribute('aria-pressed', String(state.measured > 0 && c.textContent === fmtShutter(state.measured)));
    resultCard.innerHTML = '';
    if (!(state.measured > 0)) { resultCard.appendChild(el('p', { class: 'muted', text: t('calc.film.invalidTime') })); return; }
    const r = correctedTime(film.points, state.measured);
    if (r.seconds == null) {
      resultCard.appendChild(bigValue({ label: t('calc.film.corrected'), value: '–' }));
      resultCard.appendChild(el('p', { class: 'notice', text: t('calc.film.status.noData') }));
    } else {
      resultCard.appendChild(bigValue({ label: t('calc.film.corrected'), value: fmtShutter(r.seconds), sub: t('calc.film.addedStops', { stops: fmtStops(r.stops) }) }));
      const warn = r.status === 'gap' || r.status === 'extrapolated';
      resultCard.appendChild(el('p', { class: `small ${warn ? 'notice' : 'muted'}`, style: 'text-align:center', text: t(`calc.film.status.${r.status}`) }));
      if (r.seconds >= 1) resultCard.appendChild(button(t('calc.film.timer'), { primary: true, block: true, onClick: () => ctx.navigate(`timer?seconds=${r.seconds}`) }));
      const bridge = cameraBridge(ctx); bridge.update({ seconds: r.seconds }); resultCard.appendChild(bridge.el);
      setSession('lastShutter', r.seconds);
    }
    if (film.type === 'color') resultCard.appendChild(el('p', { class: 'muted small', style: 'margin-top:12px', text: t('calc.film.colorNote') }));
    setSession('film', state);
  }

  function renderPoints() {
    pointsBody.innerHTML = '';
    pointsBody.appendChild(el('p', { class: 'muted small', text: t('calc.film.pointsHint') }));
    const table = el('table', { class: 'points-table' }, [el('tr', {}, [
      el('th', { text: t('calc.film.colMeasured') }), el('th', { text: film.custom ? t('calc.film.colOwn') : t('calc.film.colMaker') }), film.custom ? null : el('th', { text: t('calc.film.colOwn') }),
    ])]);
    const overrides = film.custom ? null : (getOverrides(film.id) || {});
    for (const tt of SUPPORT_TIMES) {
      const makerVal = film.custom ? null : (builtinPoint(film, tt));
      const input = el('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', 'aria-label': `${tt} s`,
        value: film.custom ? (film.points[tt] ?? '') : (overrides[tt] ?? '') });
      input.addEventListener('change', async () => {
        const v = parseFloat(String(input.value).replace(',', '.'));
        if (film.custom) {
          const pts = { ...film.points };
          if (Number.isFinite(v) && v > 0) pts[tt] = v; else delete pts[tt];
          film = saveCustomFilm({ ...film, points: pts });
        } else {
          const o = { ...overrides };
          if (Number.isFinite(v) && v > 0) o[tt] = v; else delete o[tt];
          setOverrides(film.id, o);
        }
        await reload();
      });
      table.appendChild(el('tr', {}, [
        el('td', { text: `${tt} s` }),
        film.custom ? el('td', {}, [input]) : el('td', { text: makerVal == null ? '–' : fmtNum(makerVal, makerVal < 10 ? 1 : 0) }),
        film.custom ? null : el('td', {}, [input]),
      ]));
    }
    pointsBody.appendChild(table);
    if (!film.custom && film.hasOverrides) {
      pointsBody.appendChild(el('div', { class: 'btn-row' }, [button(t('common.reset'), { onClick: async () => { setOverrides(film.id, null); await reload(); } })]));
    }
    if (film.custom) {
      pointsBody.appendChild(el('div', { class: 'btn-row' }, [button(t('common.delete'), { danger: true, onClick: async () => {
        if (!confirm(t('calc.film.deleteConfirm', { name: film.name }))) return;
        deleteCustomFilm(film.id); state.filmId = 'ilford-hp5-plus'; await reload();
      } })]));
    }
  }

  function builtinPoint(f, tt) {
    const raw = builtinRaw.get(f.id);
    return raw ? raw.points[tt] : f.points[tt];
  }
  const builtinRaw = new Map();
  async function cacheBuiltin() {
    const { loadBuiltinFilms } = await import('../lib/films-store.js');
    for (const f of await loadBuiltinFilms()) builtinRaw.set(f.id, f);
  }
  await cacheBuiltin();

  function renderOwn() {
    ownBody.innerHTML = '';
    const name = numberLike('text', t('calc.film.name'), '');
    const iso = numberField({ label: t('calc.film.iso'), value: 400, min: 1, stepAttr: '1', inputmode: 'numeric' });
    const type = el('select', { class: 'select' }, [el('option', { value: 'bw', text: t('calc.film.typeBw') }), el('option', { value: 'color', text: t('calc.film.typeColor') })]);
    const note = numberLike('text', t('calc.film.note'), '');
    ownBody.appendChild(el('div', { class: 'fields' }, [name.field, iso.field]));
    ownBody.appendChild(el('div', { class: 'fields' }, [el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('calc.film.type') }), type]), note.field]));
    const table = el('table', { class: 'points-table' }, [el('tr', {}, [el('th', { text: t('calc.film.colMeasured') }), el('th', { text: t('calc.film.colOwn') })])]);
    const inputs = {};
    for (const tt of SUPPORT_TIMES) {
      inputs[tt] = el('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', 'aria-label': `${tt} s` });
      table.appendChild(el('tr', {}, [el('td', { text: `${tt} s` }), el('td', {}, [inputs[tt]])]));
    }
    ownBody.appendChild(table);
    const errors = el('p', { class: 'notice small', hidden: true });
    ownBody.appendChild(errors);
    ownBody.appendChild(el('div', { class: 'btn-row' }, [
      button(t('common.save'), { primary: true, onClick: async () => {
        const points = {};
        for (const tt of SUPPORT_TIMES) { const v = parseFloat(String(inputs[tt].value).replace(',', '.')); if (v > 0) points[tt] = v; }
        const f = { id: newCustomId(), name: name.input.value.trim(), maker: '', iso: iso.getValue(), type: type.value, points, note: note.input.value.trim(), custom: true };
        const errs = validateFilm(f);
        if (errs.length) { errors.hidden = false; errors.textContent = errs.join(' · '); return; }
        saveCustomFilm(f); state.filmId = f.id; ctx.showToast(t('calc.film.saved')); ownPanel.open = false; await reload();
      } }),
      getCustomFilms().length ? button(t('calc.film.export'), { onClick: () => downloadText('focus-filme.json', exportFilms(getCustomFilms())) }) : null,
    ]));
  }

  function numberLike(type, label, value) {
    const input = el('input', { class: 'input', type, value });
    return { input, field: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), input]) };
  }

  async function reload() {
    films = await getAllFilms();
    film = films.find((f) => f.id === state.filmId) || films[0];
    fillSelect();
    rerender();
  }

  rerender();
  return () => {};
}
