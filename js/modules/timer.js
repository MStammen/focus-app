// Timer: Countdown und Intervall. Signale über Web Audio, Vibration, Wake Lock.
import { el, segmented, numberField, fmtSeconds, fmtShutter, button, titleWithInfo } from '../lib/ui.js';
import { unlockAudio, signals, vibrate, vibrations } from '../lib/audio.js';
import { getSession, setSession } from '../lib/session.js';

const QUICK = [1, 2, 4, 8, 15, 30, 60, 120, 240];
const RADIUS = 110;
const CIRC = 2 * Math.PI * RADIUS;

function pad(n) { return String(n).padStart(2, '0'); }
function digits(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return s.toFixed(1).replace('.', ',');
  const total = Math.ceil(s);
  if (total < 3600) return `${Math.floor(total / 60)}:${pad(total % 60)}`;
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
/** Ziffern mit Einheit dahinter: „2,0 s“, „0:30 min“, „1:05:00 h“. */
function digitNodes(ms) {
  const s = Math.max(0, ms) / 1000;
  const unit = s < 10 ? 's' : Math.ceil(s) < 3600 ? 'min' : 'h';
  return [digits(ms), el('span', { class: 'timer-unit', text: unit })];
}

export async function init(root, ctx) {
  const { t, query } = ctx;
  const state = getSession('timer', { mode: 'countdown', seconds: 30, frames: 5, pause: 5 });
  const q = parseFloat(query.get('seconds'));
  if (q > 0) { state.seconds = Math.round(q * 10) / 10; state.mode = 'countdown'; }
  let sound = ctx.getSetting('sound', true);
  let vib = ctx.getSetting('vibration', true);
  let wakeLock = null;
  let run = null; // laufender Ablauf

  const head = titleWithInfo(ctx, { title: t('timer.title'), key: 'timer' });
  root.append(head.row, head.box);
  const modeBar = segmented({
    ariaLabel: t('timer.title'), active: state.mode,
    items: [{ id: 'countdown', label: t('timer.mode.countdown') }, { id: 'interval', label: t('timer.mode.interval') }],
    onSelect: (id) => { state.mode = id; setSession('timer', state); showSetup(); modeBar.querySelectorAll('.segment').forEach((s) => s.setAttribute('aria-current', s.textContent === t(`timer.mode.${id}`) ? 'true' : 'false')); },
  });
  root.appendChild(modeBar);
  const stage = el('div');
  root.appendChild(stage);

  // ---------- Einstellen ----------
  function showSetup() {
    stage.innerHTML = '';
    modeBar.hidden = false;
    const card = el('div', { class: 'card' });
    const display = el('div', { class: 'timer-set' }, [el('div', { class: 'timer-digits', 'aria-live': 'polite' }, digitNodes(state.seconds * 1000))]);
    card.appendChild(el('div', { class: 'big-value-label', style: 'text-align:center', text: state.mode === 'interval' ? t('timer.exposure') : t('timer.set') }));
    card.appendChild(display);
    const adjust = (delta) => { state.seconds = Math.max(1, Math.round((state.seconds + delta) * 10) / 10); refresh(); };
    card.appendChild(el('div', { class: 'adjust-row' }, [
      button('−1 min', { onClick: () => adjust(-60) }), button('−10 s', { onClick: () => adjust(-10) }), button('−1 s', { onClick: () => adjust(-1) }),
      button('+1 s', { onClick: () => adjust(1) }), button('+10 s', { onClick: () => adjust(10) }), button('+1 min', { onClick: () => adjust(60) }),
    ]));
    const quick = el('div', { class: 'chips', style: 'justify-content:center' });
    for (const s of QUICK) quick.appendChild(el('button', { type: 'button', class: 'chip quick', text: fmtShutter(s), 'aria-pressed': String(s === state.seconds), onClick: () => { state.seconds = s; refresh(); } }));
    card.appendChild(quick);
    const minF = numberField({ label: t('common.minutes'), value: Math.floor(state.seconds / 60), min: 0, stepAttr: '1', inputmode: 'numeric', onChange: fromFields });
    const secF = numberField({ label: t('common.seconds'), value: Math.round((state.seconds % 60) * 10) / 10, min: 0, max: 59.9, stepAttr: '0.1', onChange: fromFields });
    function fromFields() { const m = minF.getValue() || 0; const s = secF.getValue() || 0; state.seconds = Math.max(0.1, m * 60 + s); display.firstChild.replaceChildren(...digitNodes(state.seconds * 1000)); quick.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); setSession('timer', state); }
    card.appendChild(el('div', { class: 'fields' }, [minF.field, secF.field]));
    stage.appendChild(card);

    const total = el('p', { class: 'muted small', style: 'text-align:center;margin:8px 0 0' });
    if (state.mode === 'interval') {
      const framesF = numberField({ label: t('timer.frames'), value: state.frames, min: 1, max: 99, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { state.frames = Math.max(1, Math.round(v || 1)); setSession('timer', state); totalLine(); } });
      const pauseF = numberField({ label: t('timer.pause'), value: state.pause, unit: 's', min: 0, stepAttr: '1', inputmode: 'numeric', onChange: (v) => { state.pause = Math.max(0, v || 0); setSession('timer', state); totalLine(); } });
      stage.appendChild(el('div', { class: 'card' }, [el('div', { class: 'fields' }, [framesF.field, pauseF.field]), total]));
    }
    function totalLine() { if (state.mode === 'interval') total.textContent = t('timer.total', { t: fmtSeconds(state.frames * state.seconds + Math.max(0, state.frames - 1) * state.pause) }); }

    const toggles = el('div', { class: 'btn-row', style: 'justify-content:center' }, [
      el('button', { type: 'button', class: 'icon-toggle', 'aria-pressed': String(sound), text: `♪ ${t('timer.sound')}`, onClick: (e) => { sound = !sound; ctx.setSetting('sound', sound); e.currentTarget.setAttribute('aria-pressed', String(sound)); } }),
      'vibrate' in navigator ? el('button', { type: 'button', class: 'icon-toggle', 'aria-pressed': String(vib), text: `≋ ${t('timer.vibration')}`, onClick: (e) => { vib = !vib; ctx.setSetting('vibration', vib); e.currentTarget.setAttribute('aria-pressed', String(vib)); } }) : null,
    ]);
    stage.appendChild(toggles);

    if (!ctx.getSetting('timerHintShown', false)) stage.appendChild(el('p', { class: 'notice small', text: t('timer.hint') }));

    stage.appendChild(el('div', { class: 'timer-bottom' }, [button(t('timer.start'), { primary: true, block: true, onClick: start })]));
    stage.lastChild.firstChild.classList.add('huge');

    function refresh() {
      display.firstChild.replaceChildren(...digitNodes(state.seconds * 1000));
      minF.setValue(Math.floor(state.seconds / 60));
      secF.setValue(Math.round((state.seconds % 60) * 10) / 10);
      quick.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === fmtShutter(state.seconds))));
      setSession('timer', state);
      totalLine();
    }
    totalLine();
  }

  // ---------- Laufen ----------
  async function requestWake() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
  }
  function releaseWake() { try { wakeLock?.release(); } catch { /* egal */ } wakeLock = null; }
  const onVisible = () => { if (document.visibilityState === 'visible' && run) requestWake(); };
  document.addEventListener('visibilitychange', onVisible);

  function signal(name) {
    if (sound) signals[name]?.();
    if (vib) vibrate(vibrations[name]);
  }

  function start() {
    unlockAudio();
    ctx.setSetting('timerHintShown', true);
    requestWake();
    const plan = state.mode === 'interval'
      ? Array.from({ length: state.frames }, (_, i) => [{ kind: 'exposure', ms: state.seconds * 1000, frame: i + 1 }, i < state.frames - 1 ? { kind: 'pause', ms: state.pause * 1000, frame: i + 1 } : null]).flat().filter(Boolean)
      : [{ kind: 'exposure', ms: state.seconds * 1000, frame: 1 }];
    run = { plan, index: 0, startedAt: Date.now(), elapsedExposure: 0 };
    showRunning();
    nextPhase();
  }

  let interval = null;
  function nextPhase() {
    const phase = run.plan[run.index];
    if (!phase) return finish();
    phase.start = Date.now();
    phase.end = phase.start + phase.ms;
    phase.lastMinute = null;
    phase.tenDone = false;
    if (phase.kind === 'exposure') signal('start');
    clearInterval(interval);
    interval = setInterval(tick, 100);
    tick();
  }

  function tick() {
    if (!run) return;
    const phase = run.plan[run.index];
    const remaining = phase.end - Date.now();
    if (phase.kind === 'exposure') {
      const secs = Math.ceil(remaining / 1000);
      if (secs > 10 && secs % 60 === 0 && phase.lastMinute !== secs && secs < phase.ms / 1000) { phase.lastMinute = secs; signal('minute'); }
      if (!phase.tenDone && phase.ms > 12000 && remaining <= 10000) { phase.tenDone = true; signal('tenSeconds'); }
    }
    updateRunning(phase, remaining);
    if (remaining <= 0) {
      clearInterval(interval);
      if (phase.kind === 'exposure') { run.elapsedExposure += phase.ms; signal('end'); }
      run.index += 1;
      nextPhase();
    }
  }

  let digitsEl, subEl, ringFg, frameEl;
  function showRunning() {
    stage.innerHTML = '';
    modeBar.hidden = true;
    const total = run.plan.length;
    digitsEl = el('div', { class: 'timer-digits', role: 'timer', 'aria-live': 'off' });
    subEl = el('div', { class: 'timer-sub' });
    frameEl = el('div', { class: 'timer-sub' });
    ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 240 240');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    for (const [c, cls] of [[bg, 'ring-bg'], [ringFg, 'ring-fg']]) { c.setAttribute('cx', '120'); c.setAttribute('cy', '120'); c.setAttribute('r', String(RADIUS)); c.setAttribute('class', cls); }
    ringFg.setAttribute('stroke-dasharray', String(CIRC));
    svg.append(bg, ringFg);
    stage.appendChild(el('div', { class: 'timer-stage' }, [
      el('div', { class: 'timer-ring' }, [svg, el('div', { class: 'timer-center' }, [frameEl, digitsEl, subEl])]),
      el('p', { class: 'muted small', text: wakeLock ? t('timer.wake') : ('wakeLock' in navigator ? '' : t('timer.noWake')) }),
    ]));
    stage.appendChild(el('div', { class: 'timer-bottom' }, [button(t('timer.cancel'), { block: true, danger: true, onClick: cancel })]));
    stage.lastChild.firstChild.classList.add('huge');
    void total;
  }

  function updateRunning(phase, remaining) {
    digitsEl.replaceChildren(...digitNodes(remaining));
    const frac = Math.max(0, Math.min(1, remaining / phase.ms));
    ringFg.setAttribute('stroke-dashoffset', String(CIRC * (1 - frac)));
    const totalFrames = run.plan.filter((p) => p.kind === 'exposure').length;
    frameEl.textContent = totalFrames > 1 ? t('timer.frame', { n: phase.frame, total: totalFrames }) : '';
    subEl.textContent = phase.kind === 'pause' ? t('timer.pauseNext', { t: fmtSeconds(Math.max(0, remaining) / 1000) }) : `${t('timer.remaining')} · ${fmtSeconds(phase.ms / 1000)}`;
    ringFg.style.opacity = phase.kind === 'pause' ? '0.35' : '1';
  }

  function cancel() {
    clearInterval(interval);
    const exposed = run.elapsedExposure + (run.plan[run.index]?.kind === 'exposure' ? Math.min(run.plan[run.index].ms, Date.now() - run.plan[run.index].start) : 0);
    run = null;
    releaseWake();
    showDone(t('timer.cancelled', { t: fmtSeconds(exposed / 1000) }), exposed / 1000, false);
  }

  function finish() {
    clearInterval(interval);
    const frames = run.plan.filter((p) => p.kind === 'exposure').length;
    const seconds = state.seconds;
    run = null;
    releaseWake();
    showDone(frames > 1 ? t('timer.finishedInterval', { n: frames, t: fmtSeconds(seconds) }) : t('timer.finishedExposure', { t: fmtSeconds(seconds) }), seconds, true);
  }

  function showDone(text, seconds, complete) {
    stage.innerHTML = '';
    stage.appendChild(el('div', { class: 'card', style: 'text-align:center' }, [
      el('div', { class: 'big-value-label', text: complete ? t('timer.done') : t('timer.cancel') }),
      el('div', { class: 'timer-digits', style: 'margin:8px 0' }, digitNodes(0)),
      el('p', { text }),
    ]));
    stage.appendChild(el('div', { class: 'btn-row' }, [
      button(t('timer.toLog'), { primary: true, onClick: () => ctx.navigate(`log?new=1&source=timer&shutter=${seconds}&frames=${state.mode === 'interval' ? state.frames : 1}`) }),
      button(t('timer.again'), { onClick: start }),
      button(t('timer.newTime'), { onClick: showSetup }),
    ]));
  }

  showSetup();
  return () => {
    clearInterval(interval);
    run = null;
    releaseWake();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
