// Simulator „Probieren“: Vektorszene, Prinzipdarstellung. Nicht fotorealistisch, ehrlich beschriftet.
import { el, fmtShutter, fmtAperture, fmtStops, fmtNum } from '../lib/ui.js';
import { standardSeries, shutterFor, apertureFor } from '../core/exposure.js';
import { createScene, SCENE_EV } from '../lib/scene.js';
import { cameraDials } from '../lib/camera-svg.js';


export function simulator(root, ctx, devices, cameraModes) {
  const { t } = ctx;
  const brands = cameraModes?.brands || [];
  const state = { device: devices.find((d) => d.id === 'phone') || devices[0], aperture: 1.8, shutter: 1 / 30, iso: 400, nd: 0, mode: 'manual', brand: brands.find((b) => b.id === ctx.getSetting('cameraBrand', '')) || null };

  // ---- Szene (gemeinsam mit der virtuellen Kamera) ----
  const scene = createScene({ label: t('learn.sim.sceneLabel') });
  const svg = scene.el;
  svg.setAttribute('class', 'sim-svg');

  // ---- Anzeige ----
  const readout = el('div', { class: 'sim-readout' });
  const dials = cameraDials({ ...state, onModeSelect: (m) => { state.mode = m; applyMode(); draw(); } });
  // Marke für die Beschriftung des Modusrads
  const brandSel = el('select', { class: 'select' }, [el('option', { value: '', text: t('settings.cameraNone') }), ...brands.map((b) => el('option', { value: b.id, text: b.name, selected: b === state.brand }))]);
  brandSel.addEventListener('change', () => { state.brand = brands.find((b) => b.id === brandSel.value) || null; ctx.setSetting('cameraBrand', brandSel.value); dials.setBrand(state.brand); draw(); });
  dials.setBrand(state.brand);
  const modeBar = el('div', { class: 'chips' }, (cameraModes?.concepts || []).map((c) => el('button', { type: 'button', class: 'chip quick', 'aria-pressed': String(c.id === state.mode), dataset: { mode: c.id }, text: c.name, onClick: () => { state.mode = c.id; applyMode(); draw(); } })));
  const modeHint = el('p', { class: 'muted small', style: 'margin:6px 0 0' });

  // ---- Regler ----
  const apertures = standardSeries('aperture', 1).filter((a) => a >= 1.4 && a <= 22);
  const shutters = standardSeries('shutter', 1).filter((v) => v >= 1 / 4000 && v <= 480);
  const isos = standardSeries('iso', 1).filter((v) => v >= 50 && v <= 25600);
  const nds = [0, 1, 2, 3, 4, 6, 8, 10];
  function range({ label, list, value, format, onChange, id }) {
    const out = el('span', { class: 'graphic-value' });
    const input = el('input', { type: 'range', class: 'range', min: 0, max: list.length - 1, step: 1, id });
    const idx = list.findIndex((v) => Math.abs(Math.log2(v / (value || 1))) < 0.01 || v === value);
    input.value = String(idx >= 0 ? idx : 0);
    out.textContent = format(list[Number(input.value)]);
    input.addEventListener('input', () => { const v = list[Number(input.value)]; out.textContent = format(v); onChange(v); });
    const hint = el('span', { class: 'row-hint' });
    return { field: el('label', { class: 'graphic-slider' }, [el('span', { class: 'field-label' }, [label, ' ', out]), input, hint]), input, out, hint };
  }
  const apSl = range({ label: t('common.aperture'), list: apertures, value: state.aperture, format: fmtAperture, onChange: (v) => { state.aperture = v; draw(); } });
  const shSl = range({ label: t('common.shutter'), list: shutters, value: state.shutter, format: fmtShutter, onChange: (v) => { state.shutter = v; draw(); } });
  const isoSl = range({ label: t('common.iso'), list: isos, value: state.iso, format: (v) => String(v), onChange: (v) => { state.iso = v; draw(); } });
  const ndSl = range({ label: t('learn.sim.nd'), list: nds, value: 0, format: (v) => (v ? `${v} ${t('common.stops')}` : t('learn.sim.noNd')), onChange: (v) => { state.nd = v; draw(); } });

  const devBar = el('div', { class: 'segmented' }, devices.filter((d) => ['phone', 'ff', 'pinhole'].includes(d.id)).map((d) => el('button', {
    type: 'button', class: 'segment', 'aria-current': String(d === state.device), text: t(`learn.sim.devices.${d.id}`),
    onClick: (e) => { state.device = d; devBar.querySelectorAll('.segment').forEach((x) => x.setAttribute('aria-current', 'false')); e.currentTarget.setAttribute('aria-current', 'true'); applyDevice(); draw(); },
  })));

  function setSlider(sl, list, value) {
    const idx = list.reduce((best, v, i) => (Math.abs(Math.log2(v / value)) < Math.abs(Math.log2(list[best] / value)) ? i : best), 0);
    sl.input.value = String(idx);
    return list[idx];
  }
  function applyMode() {
    const m = state.mode;
    const fixed = !!state.device.apertureFixed;
    apSl.input.disabled = fixed || m === 'program' || m === 'shutterPriority';
    shSl.input.disabled = m === 'program' || m === 'aperturePriority';
    modeBar.querySelectorAll('.chip').forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.mode === m)));
    const label = state.brand ? `${state.brand.name}: ${state.brand.modes[m]}` : t(`learn.sim.modeNames.${m}`);
    modeHint.textContent = `${label} · ${t(`learn.sim.modeHints.${m}`)}`;
  }
  /** Automatik der Kamera: nachgebenden Wert zur Szene passend setzen (mit Grenzen der Kamera). */
  function autoExpose() {
    const m = state.mode;
    const target = SCENE_EV - state.nd;
    if (m === 'program') {
      if (!state.device.apertureFixed) { state.aperture = setSlider(apSl, apertures, 5.6); apSl.out.textContent = fmtAperture(state.aperture); }
      state.shutter = setSlider(shSl, shutters.filter((v) => v <= 1 / 30), shutterFor(target, state.aperture, state.iso)); shSl.out.textContent = fmtShutter(state.shutter);
    } else if (m === 'aperturePriority') {
      state.shutter = setSlider(shSl, shutters.filter((v) => v <= 30), shutterFor(target, state.aperture, state.iso)); shSl.out.textContent = fmtShutter(state.shutter);
    } else if (m === 'shutterPriority' && !state.device.apertureFixed) {
      state.aperture = setSlider(apSl, apertures, apertureFor(target, state.shutter, state.iso)); apSl.out.textContent = fmtAperture(state.aperture);
    }
  }

  function applyDevice() {
    const d = state.device;
    dials.setLayout(d.id === 'phone' ? 'phone' : d.id === 'pinhole' ? 'pinhole' : null);
    if (d.apertureFixed) {
      state.aperture = d.aperture;
      apSl.input.disabled = true;
      apSl.out.textContent = `${fmtAperture(d.aperture)} (${t('learn.sim.fixed')})`;
      apSl.hint.textContent = d.id === 'phone' ? t('learn.sim.phoneFixed') : t('learn.sim.pinholeFixed');
    } else {
      apSl.input.disabled = false;
      const idx = apertures.indexOf(2.8); apSl.input.value = String(idx); state.aperture = 2.8; apSl.out.textContent = fmtAperture(2.8);
      apSl.hint.textContent = '';
    }
    applyMode();
  }

  function draw() {
    autoExpose();
    const d = state.device;
    const { evCam, diff, opening } = scene.render({ aperture: state.aperture, shutter: state.shutter, iso: state.iso, nd: state.nd, device: d });
    const tSec = state.shutter;
    dials.update({ aperture: state.aperture, shutter: state.shutter, iso: state.iso, mode: state.mode });
    readout.innerHTML = '';
    readout.append(
      el('div', {}, [el('strong', { text: t('learn.sim.exposure') }), ` EV ${fmtNum(evCam, 1)} · ${t('learn.sim.scene')} EV ${SCENE_EV} → ${fmtStops(diff)} ${t('common.stops')} ${diff > 0.3 ? t('learn.sim.tooBright') : diff < -0.3 ? t('learn.sim.tooDark') : t('learn.sim.right')}`]),
      el('div', { class: 'muted small', text: `${t('learn.sim.opening')} ${fmtNum(opening, 1)} mm · ${t('learn.sim.motion')} ${tSec >= 1 ? fmtShutter(tSec) : t('learn.sim.frozen')}` }),
    );
  }

  root.append(
    el('p', { class: 'muted small', text: t('learn.sim.intro') }),
    devBar,
    el('div', { class: 'sim-stage' }, [svg]),
    readout,
    el('div', { class: 'card' }, [modeBar, modeHint, el('p', { class: 'small', style: 'margin:8px 0 0' }, [el('a', { href: '#/camera', text: t('learn.sim.toCamera') })])]),
    el('div', { class: 'card' }, [apSl.field, shSl.field, isoSl.field, ndSl.field]),
    el('p', { class: 'muted small', text: t('learn.sim.disclaimer') }),
  );
  applyDevice();
  draw();
}
