// Rechner „Mattscheibe“: Wo wird es scharf? Linse oder Loch, Motiv, Mattscheibe, Blende, Format –
// die Seitenansicht zeigt die Strahlen, darunter der Blick auf die Mattscheibe (aus der Seminar-Präsentation).
import { FOCUS_FORMATS, APERTURES, imageDistance, WALL_DIST } from '../core/focus.js';
import { createFocusSim, LENS_FRAC, de, len, rangeTxt, fN } from '../lib/focus-sim.js';
import { el, segmented, bigValue, button, moreBox } from '../lib/ui.js';
import { getSession, setSession } from '../lib/session.js';

const G_MIN = 15, G_MAX = 30000;      // Motivabstand
const F_MIN = 6, F_MAX = 600;         // Brennweite
const S_MIN = 3, S_MAX = WALL_DIST;   // Mattscheibe höchstens bis zur Wand
const D_MIN = 0.2, D_MAX = 600;       // Loch
const STEPS = 1000;
const logMap = (v, a, b) => a * Math.pow(b / a, v / STEPS);
const logInv = (x, a, b) => Math.round(STEPS * Math.log(x / a) / Math.log(b / a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerpLog = (a, b, k) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k);

export async function init(root, ctx) {
  const { t } = ctx;
  const S = getSession('focus', {
    mode: 'lens', f: 50, d: 2, g: 2000, s: imageDistance(50, 2000), N: 5.6, fmt: 'kb', poster: true, sun: false, labels: true,
  });
  let anim = null;
  const save = () => setSession('focus', S);

  const sim = createFocusSim(t);

  // ---- Linse oder Loch ----
  const modeBar = segmented({
    ariaLabel: t('calc.focus.modeLabel'), active: S.mode,
    items: [{ id: 'lens', label: t('calc.focus.lens') }, { id: 'pin', label: t('calc.focus.pinhole') }],
    onSelect: (id) => { S.mode = id; modeBar.querySelectorAll('.segment').forEach((b, i) => b.setAttribute('aria-current', String((i === 0) === (id === 'lens')))); if (S.fmt === 'wall') S.s = WALL_DIST; update(); },
  });
  root.appendChild(modeBar);

  // ---- Grafik ----
  const frontSub = el('span', { class: 'muted small' });
  root.appendChild(el('div', { class: 'focus-sim' }, [
    el('div', { class: 'focus-scroll' }, [sim.side]),
    el('div', { class: 'focus-front-head' }, [el('h2', { text: t('calc.focus.frontTitle') }), frontSub]),
    sim.front,
  ]));

  // ---- Ergebnis ----
  const result = el('div', { class: 'card focus-result' });
  root.appendChild(result);

  // ---- Regler ----
  function slider(key, max = STEPS) {
    const value = el('span', { class: 'graphic-value' });
    const name = el('span', { text: t(`calc.focus.${key}`) });
    const input = el('input', { type: 'range', class: 'range', min: 0, max, step: 1, 'aria-label': t(`calc.focus.${key}`) });
    const field = el('label', { class: 'graphic-slider' }, [el('span', { class: 'field-label focus-lab' }, [name, value]), input]);
    return { field, input, value, name, off(on) { input.disabled = on; field.classList.toggle('off', on); } };
  }
  const sf = slider('focal'), sg = slider('subject'), ss = slider('screen'), sn = slider('aperture', APERTURES.length - 1), sd = slider('hole');
  const live = (fn) => () => { stop(); fn(); update(); };
  sf.input.addEventListener('input', live(() => { const r = S.s / S.f; S.f = logMap(+sf.input.value, F_MIN, F_MAX); if (S.mode === 'lens' && S.fmt !== 'wall') S.s = clamp(r * S.f, S_MIN, S_MAX); }));
  sg.input.addEventListener('input', live(() => { S.g = logMap(+sg.input.value, G_MIN, G_MAX); }));
  ss.input.addEventListener('input', live(() => { S.s = logMap(+ss.input.value, S_MIN, S_MAX); }));
  sn.input.addEventListener('input', live(() => { S.N = APERTURES[+sn.input.value]; }));
  sd.input.addEventListener('input', live(() => { S.d = logMap(+sd.input.value, D_MIN, D_MAX); }));

  const fmtSel = el('select', { class: 'select', 'aria-label': t('calc.focus.format') },
    Object.keys(FOCUS_FORMATS).map((k) => el('option', { value: k, text: t(`calc.focus.formats.${k}`), selected: k === S.fmt })));
  fmtSel.addEventListener('change', live(() => { S.fmt = fmtSel.value; if (S.fmt === 'wall') S.s = WALL_DIST; }));

  const toggle = (key, label) => {
    const b = el('button', { type: 'button', class: 'chip quick', 'aria-pressed': String(!!S[key]), text: label });
    b.addEventListener('click', () => { S[key] = !S[key]; b.setAttribute('aria-pressed', String(S[key])); update(); });
    return b;
  };
  const focusBtn = button(t('calc.focus.focusBtn'), { primary: true, onClick: focusNow });

  root.appendChild(el('div', { class: 'card focus-controls' }, [
    sf.field, sg.field, ss.field, sn.field, sd.field,
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('calc.focus.format') }), fmtSel]),
    el('div', { class: 'chips' }, [toggle('poster', t('calc.focus.poster')), toggle('sun', t('calc.focus.sun')), toggle('labels', t('calc.focus.labels'))]),
    el('div', { class: 'btn-row' }, [focusBtn]),
  ]));

  // ---- Mehr dazu: Werte und Erklärung ----
  const details = el('div');
  root.appendChild(moreBox(ctx, 'focus', [
    details,
    ...t('calc.focus.more').split('|').map((p) => el('p', { class: 'muted small', text: p.trim() })),
  ]));

  // Scharfstellen: Mattscheibe auf die Figur – bei der Wand (steht fest) wandert stattdessen die Figur
  function focusNow() {
    if (S.mode !== 'lens') return;
    if (S.fmt === 'wall') { if (S.s > S.f) animate({ g: 1 / (1 / S.f - 1 / S.s) }, 900); }
    else if (S.g > S.f) animate({ s: clamp(imageDistance(S.f, S.g), S_MIN, S_MAX) }, 700);
  }
  function animate(to, ms) {
    stop();
    const from = { g: S.g, s: S.s }, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      for (const key of Object.keys(to)) S[key] = lerpLog(from[key], to[key], e);
      update();
      anim = k < 1 ? requestAnimationFrame(step) : null;
    };
    anim = requestAnimationFrame(step);
  }
  function stop() { if (anim) { cancelAnimationFrame(anim); anim = null; } }

  function syncControls() {
    const pin = S.mode === 'pin', wall = S.fmt === 'wall';
    sf.off(pin); sn.off(pin); ss.off(wall); sd.off(!pin);
    sd.name.textContent = t(pin ? 'calc.focus.hole' : 'calc.focus.opening');
    ss.name.textContent = t(wall ? 'calc.focus.wallFixed' : 'calc.focus.screen');
    sf.input.value = logInv(S.f, F_MIN, F_MAX); sf.value.textContent = `${de(S.f, S.f < 10 ? 1 : 0)} mm`;
    sg.input.value = logInv(S.g, G_MIN, G_MAX); sg.value.textContent = len(S.g);
    ss.input.value = logInv(clamp(S.s, S_MIN, S_MAX), S_MIN, S_MAX); ss.value.textContent = S.s < 100 ? `${de(S.s, 1)} mm` : len(S.s);
    const dShow = pin ? S.d : S.f / S.N;
    sd.input.value = logInv(clamp(dShow, D_MIN, D_MAX), D_MIN, D_MAX); sd.value.textContent = dShow < 100 ? `${de(dShow, 1)} mm` : len(dShow);
    sn.input.value = APERTURES.reduce((bi, v, i) => (Math.abs(Math.log(v / S.N)) < Math.abs(Math.log(APERTURES[bi] / S.N)) ? i : bi), 0);
    sn.value.textContent = fN(S.N);
    focusBtn.disabled = pin || (wall ? S.s <= S.f : S.g <= S.f);
  }

  function update() {
    const r = sim.draw(S);
    syncControls();
    const fmt = r.fmt;
    frontSub.textContent = t('calc.focus.frontSub', { fmt: r.fmtName, w: de(fmt.w, 1), h: de(fmt.h, 1) });

    // Ergebnis: groß die Hauptsache, darunter je Motiv scharf/unscharf
    const subj = r.res.find((q) => !q.poster);
    result.innerHTML = '';
    if (r.pin) {
      result.appendChild(bigValue({ label: t('calc.focus.read.spotLabel'), value: spot(subj.blur), sub: t('calc.focus.read.holeLine', { d: de(S.d, 1), s: len(S.s), n: de(S.s / S.d, 0) }) }));
    } else if (r.DOF) {
      result.appendChild(bigValue({ label: t('calc.focus.read.dofLabel'), value: rangeTxt(r.DOF.near, r.DOF.far), sub: t('calc.focus.read.focusLine', { d: r.gFocus > G_MAX ? '∞' : len(r.gFocus) }) }));
    } else {
      result.appendChild(bigValue({ label: t('calc.focus.read.dofLabel'), value: '–', sub: t('calc.focus.read.noImage') }));
    }
    for (const q of r.res.slice().reverse()) {
      const name = t(q.poster ? 'calc.focus.poster' : 'calc.focus.subject');
      const crop = q.H * q.m > fmt.h ? t('calc.focus.read.crop') : '';
      let text, cls = 'muted';
      if (q.virt || q.lim) { text = t('calc.focus.read.nowhere', { name }); cls = 'focus-bad'; }
      else if (r.pin) text = t('calc.focus.read.spot', { name, spot: spot(q.blur) }) + crop;
      else if (q.sharp) { text = t('calc.focus.read.sharp', { name }) + crop; cls = 'status-ok'; }
      else { text = t('calc.focus.read.blurred', { name, spot: spot(q.blur) }) + crop; cls = 'focus-bad'; }
      result.appendChild(el('p', { class: `small ${cls}`, style: 'margin:6px 0 0', text }));
    }

    details.innerHTML = '';
    const lines = [
      t(r.pin ? 'calc.focus.read.screenPin' : 'calc.focus.read.screenLens', { s: len(S.s), n: fN(r.Neff) }),
      r.pin ? null : t('calc.focus.read.openingLine', { d: len(S.f / S.N), f: de(S.f, S.f < 10 ? 1 : 0), N: de(S.N, 1), light: S.N < 1.05 ? t('calc.focus.read.fullLight') : t('calc.focus.read.light', { x: de(S.N * S.N, S.N * S.N < 10 ? 1 : 0) }) }),
      t('calc.focus.read.coc', { fmt: r.fmtName, c: de(r.coc, r.coc < 0.1 ? 3 : 2) }),
    ].filter(Boolean);
    for (const line of lines) details.appendChild(el('p', { class: 'small', style: 'margin:4px 0', text: line }));
    save();
  }
  const spot = (b) => (!isFinite(b) ? '∞' : b < 0.01 ? '< 0,01 mm' : `${de(b, b < 1 ? 2 : 1)} mm`);

  update();
  // Handy: Seitenansicht anfangs um die Linse zeigen (Figur, Linse, Mattscheibe); das Poster liegt links
  const scroller = root.querySelector('.focus-scroll');
  requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth * LENS_FRAC - scroller.clientWidth * 0.5; });
  return () => stop();
}
