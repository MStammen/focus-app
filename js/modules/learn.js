// Lernen: Verstehen (Erklärkarten), Probieren (Simulator), Aufgaben, Vergleich.
import { COURSE_OPEN } from '../lib/features.js';
import { el, segmented, button, fmtNum, titleWithInfo } from '../lib/ui.js';
import { renderMarkdown, markdownTitle } from '../lib/markdown.js';
import { graphic } from './learn-graphics.js';
import { simulator } from './learn-sim.js';
import { loadBuiltinFilms } from '../lib/films-store.js';
import { allEntries } from '../lib/db.js';

const TABS = ['cards', 'sim', 'tasks', 'compare'];
const TASK_KEY = 'focuslab.tasks';
const cache = {};

async function getJson(path) {
  if (!cache[path]) cache[path] = fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); });
  return cache[path];
}
async function getText(path) {
  if (!cache[path]) cache[path] = fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.text(); });
  return cache[path];
}
function readProgress() { try { return JSON.parse(localStorage.getItem(TASK_KEY) || '{}') || {}; } catch { return {}; } }
function writeProgress(p) { try { localStorage.setItem(TASK_KEY, JSON.stringify(p)); } catch { /* egal */ } }

export async function init(root, ctx) {
  const { t, subpath } = ctx;
  if (subpath[0] === 'camera') { ctx.navigate('camera'); return () => {}; }
  if (!COURSE_OPEN) {
    { const head = titleWithInfo(ctx, { title: t('nav.learn'), key: 'learn' }); root.append(head.row, head.box); }
    root.appendChild(el('div', { class: 'placeholder soon' }, [el('p', { class: 'soon-title', text: t('learn.soon.title') }), el('p', { text: t('learn.soon.text') })]));
    return () => {};
  }
  let tab = TABS.includes(subpath[0]) ? subpath[0] : subpath[0] === 'card' ? 'cards' : 'cards';
  { const head = titleWithInfo(ctx, { title: t('nav.learn'), key: 'learn' }); root.append(head.row, head.box); }
  root.appendChild(segmented({
    ariaLabel: t('nav.learn'), active: tab,
    items: TABS.map((id) => ({ id, label: t(`learn.tabs.${id}`), href: `#/learn/${id === 'cards' ? '' : id}` })),
  }));
  const body = el('div');
  root.appendChild(body);
  const urls = [];

  try {
    if (subpath[0] === 'card' && subpath[1]) await showCard(subpath[1]);
    else if (tab === 'sim') await showSim();
    else if (tab === 'tasks') await showTasks();
    else if (tab === 'compare') await showCompare();
    else await showCards();
  } catch (err) {
    console.error(err);
    body.appendChild(el('p', { class: 'notice', text: t('learn.loadError') }));
  }

  // ---------- Verstehen ----------
  async function showCards() {
    const { cards } = await getJson('./content/cards/index.json');
    const list = el('div', { class: 'learn-list' });
    for (const [i, c] of cards.entries()) {
      const md = await getText(`./content/cards/${c.file}`);
      list.appendChild(el('a', { class: 'learn-item', href: `#/learn/card/${c.id}` }, [
        el('span', { class: 'learn-num', text: String(i + 1) }),
        el('span', { class: 'learn-item-title', text: markdownTitle(md) || c.id }),
      ]));
    }
    body.appendChild(list);
  }

  async function showCard(id) {
    const { cards } = await getJson('./content/cards/index.json');
    const idx = cards.findIndex((c) => c.id === id);
    if (idx < 0) { body.appendChild(el('p', { class: 'notice', text: t('learn.notFound') })); return; }
    const c = cards[idx];
    const md = await getText(`./content/cards/${c.file}`);
    const article = el('article', { class: 'card learn-card' });
    article.innerHTML = renderMarkdown(md);
    body.appendChild(article);
    if (c.graphic === 'compare') {
      body.appendChild(el('div', { class: 'btn-row' }, [button(t('learn.tabs.compare'), { primary: true, onClick: () => ctx.navigate('learn/compare') })]));
    } else {
      const [films, devices, cameraModes] = await Promise.all([loadBuiltinFilms(), getJson('./data/devices.json').then((d) => d.devices), getJson('./data/camera-modes.json')]);
      const g = graphic(c.graphic, { films, devices, cameraModes, modedialOptions: { brandId: ctx.getSetting('cameraBrand', ''), onBrandChange: (id) => ctx.setSetting('cameraBrand', id) } });
      if (g) body.appendChild(el('div', { class: 'card' }, [g]));
    }
    body.appendChild(el('div', { class: 'btn-row' }, [
      c.calc ? button(c.calcLabel, { primary: true, onClick: () => ctx.navigate(c.calc) }) : null,
      idx > 0 ? button(t('learn.prev'), { onClick: () => ctx.navigate(`learn/card/${cards[idx - 1].id}`) }) : null,
      idx < cards.length - 1 ? button(t('learn.next'), { onClick: () => ctx.navigate(`learn/card/${cards[idx + 1].id}`) }) : button(t('learn.allCards'), { onClick: () => ctx.navigate('learn') }),
    ]));
  }

  // ---------- Probieren ----------
  async function showSim() {
    const [{ devices }, cameraModes] = await Promise.all([getJson('./data/devices.json'), getJson('./data/camera-modes.json').catch(() => null)]);
    simulator(body, ctx, devices, cameraModes);
  }

  // ---------- Aufgaben ----------
  async function showTasks() {
    const { tasks } = await getJson('./content/tasks.json');
    const progress = readProgress();
    const done = tasks.filter((x) => progress[x.id]?.done).length;
    const head = el('p', { class: 'muted small', text: t('learn.tasks.progress', { done, total: tasks.length }) });
    body.appendChild(head);
    for (const task of tasks) body.appendChild(taskCard(task, progress, () => {
      const d = tasks.filter((x) => progress[x.id]?.done).length;
      head.textContent = t('learn.tasks.progress', { done: d, total: tasks.length });
    }));
    body.appendChild(el('div', { class: 'btn-row' }, [button(t('learn.tasks.reset'), { onClick: () => { writeProgress({}); ctx.navigate('learn/tasks'); body.innerHTML = ''; showTasks(); } })]));
  }

  function taskCard(task, progress, onChange) {
    const state = progress[task.id] || { done: false, attempts: 0 };
    const card = el('div', { class: `card task${state.done ? ' done' : ''}` });
    card.appendChild(el('h2', { style: 'margin-top:0', text: `${state.done ? '✓ ' : ''}${task.title}` }));
    card.appendChild(el('p', { text: task.question }));
    const feedback = el('p', { class: 'small', hidden: true });
    let getAnswer;
    if (task.type === 'number') {
      const input = el('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': task.title });
      card.appendChild(el('div', { class: 'fields' }, [el('label', { class: 'field' }, [el('span', { class: 'field-label', text: task.unit ? `${t('learn.tasks.answer')} (${task.unit})` : t('learn.tasks.answer') }), input])]));
      getAnswer = () => { const v = parseFloat(String(input.value).replace(',', '.')); return Number.isFinite(v) ? Math.abs(v - task.answer) <= task.tolerance : null; };
    } else {
      const name = `task-${task.id}`;
      const group = el('div', { class: 'choices', role: 'radiogroup', 'aria-label': task.title });
      task.choices.forEach((c, i) => {
        group.appendChild(el('label', { class: 'choice' }, [el('input', { type: 'radio', name, value: String(i) }), el('span', { text: c })]));
      });
      card.appendChild(group);
      getAnswer = () => { const sel = group.querySelector('input:checked'); return sel ? Number(sel.value) === task.answer : null; };
    }
    const solution = el('details', { class: 'panel' }, [el('summary', { text: t('learn.tasks.solution') }), el('div', { class: 'panel-body' }, [el('p', { text: task.solution }), task.calc ? el('p', {}, [el('a', { href: `#/${task.calc}`, text: t('learn.tasks.openCalc') })]) : null])]);
    card.appendChild(el('div', { class: 'btn-row' }, [button(t('learn.tasks.check'), { primary: true, onClick: () => {
      const ok = getAnswer();
      feedback.hidden = false;
      if (ok === null) { feedback.textContent = t('learn.tasks.noAnswer'); feedback.className = 'small muted'; return; }
      state.attempts += 1;
      if (ok) { state.done = true; feedback.textContent = t('learn.tasks.correct'); feedback.className = 'small status-ok'; card.classList.add('done'); solution.open = true; }
      else { feedback.textContent = t('learn.tasks.wrong'); feedback.className = 'small status-warn'; }
      progress[task.id] = state; writeProgress(progress); onChange();
    } })]));
    card.append(feedback, solution);
    return card;
  }

  // ---------- Vergleich ----------
  async function showCompare() {
    const { scenes } = await getJson('./content/compare/index.json');
    body.appendChild(el('p', { class: 'muted small', text: t('learn.compare.intro') }));
    const entries = (await allEntries().catch(() => [])).filter((e) => e.image);
    for (const id of scenes) {
      const meta = await getJson(`./content/compare/${id}/meta.json`);
      body.appendChild(sceneCard(meta, entries));
    }
  }

  function sceneCard(meta, entries) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', { style: 'margin-top:0', text: meta.title }));
    card.appendChild(el('p', { class: 'muted small', text: meta.description }));
    const sources = meta.images.map((im) => ({ id: im.id, label: im.label, src: `./content/compare/${meta.id}/${im.file}`, data: im.data, notes: im.notes }));
    for (const e of entries) {
      const u = URL.createObjectURL(e.image); urls.push(u);
      sources.push({ id: `log-${e.id}`, label: `${t('learn.compare.own')}: ${new Date(e.createdAt).toLocaleDateString('de-DE')}`, src: u, data: e.capture ? `${t(`capture.modes.${e.capture.mode}.name`)}, ${fmtNum(e.capture.duration, 0)} s, ${e.capture.frames} ${t('capture.meta.framesShort')}` : '', notes: e.note || '' });
    }
    const sel = (label, idx) => {
      const select = el('select', { class: 'select' }, sources.map((s2, i) => el('option', { value: String(i), text: s2.label, selected: i === idx })));
      return { select, field: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), select]) };
    };
    const left = sel(t('learn.compare.left'), 0), right = sel(t('learn.compare.right'), Math.min(1, sources.length - 1));
    card.appendChild(el('div', { class: 'fields' }, [left.field, right.field]));
    const frame = el('div', { class: 'compare' });
    const imgA = el('img', { class: 'compare-after', alt: '' }), imgB = el('img', { class: 'compare-before', alt: '' });
    const labA = el('span', { class: 'compare-label right' }), labB = el('span', { class: 'compare-label left' });
    frame.append(imgA, imgB, labB, labA);
    const slider = el('input', { type: 'range', class: 'range', min: 0, max: 100, value: 50, 'aria-label': t('capture.compare') });
    const apply = () => { imgB.style.clipPath = `inset(0 ${100 - Number(slider.value)}% 0 0)`; };
    slider.addEventListener('input', apply);
    let dragging = false;
    const fromEvent = (e) => { const r = frame.getBoundingClientRect(); slider.value = String(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))); apply(); };
    frame.addEventListener('pointerdown', (e) => { dragging = true; fromEvent(e); });
    frame.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
    window.addEventListener('pointerup', () => { dragging = false; });
    const info = el('div', { class: 'compare-info' });
    function update() {
      const a = sources[Number(right.select.value)], b = sources[Number(left.select.value)];
      imgA.src = a.src; imgB.src = b.src; labA.textContent = a.label; labB.textContent = b.label;
      info.innerHTML = '';
      for (const x of [b, a]) info.appendChild(el('div', { class: 'small' }, [el('strong', { text: x.label }), x.data ? ` · ${x.data}` : '', x.notes ? el('div', { class: 'muted', text: x.notes }) : null]));
      apply();
    }
    left.select.addEventListener('change', update); right.select.addEventListener('change', update);
    update();
    card.append(frame, slider, info);
    if (meta.differences?.length) card.appendChild(el('p', { class: 'muted small', text: `${t('learn.compare.lookFor')}: ${meta.differences.join(' · ')}` }));
    if (entries.length === 0) card.appendChild(el('p', { class: 'muted small', text: t('learn.compare.noOwn') }));
    return card;
  }

  return () => { for (const u of urls) URL.revokeObjectURL(u); };
}
