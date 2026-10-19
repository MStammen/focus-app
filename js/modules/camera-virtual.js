// Virtuelle Kamera: stilisierte Kamera der eigenen Marke mit Livebild im Rückmonitor.
// Automatiken regeln wie an der echten Kamera, Grenzen der eigenen Kamera (Einstellungen) gelten.
import { el, fmtShutter, fmtAperture, fmtStops } from '../lib/ui.js';
import { standardSeries, shutterFor, apertureFor } from '../core/exposure.js';
import { cameraDials } from '../lib/camera-svg.js';
import { createScene, LIGHTS } from '../lib/scene.js';
import { cameraLimits, withModel } from '../lib/camera-profile.js';
import { modeDial, shortLabel } from '../lib/mode-dial.js';

const ND_STEPS = [0, 3, 6, 10];
const HANDHELD = 1 / 30; // Programmautomatik geht nicht unter diese Zeit, sie erhöht lieber die ISO
const BULB_MAX = 480;

/**
 * virtualCamera(root, ctx, { modes, devices, light, lightSwitch, start, onChange, onPart, afterCamera })
 * → { state, dials, setLight(id), redraw() }
 * graphicNote: Element direkt unter der Grafik (Erklärung zum angetippten Teil). showReadout: Auswertung unter der Kamera (Belichtung, Bewegung, Hinweise). onPart(id): Bedienteil an der Grafik angetippt. afterCamera: Element unter den Kameraeinstellungen.
 */
export function virtualCamera(root, ctx, { modes, devices = [], light = 'dusk', lightSwitch = true, showReadout = true, start = {}, onChange, onPart, onModeTurn, afterCamera, graphicNote } = {}) {
  const { t } = ctx;
  const brands = modes.brands;
  const deviceFor = (layout) => devices.find((d) => d.id === (layout === 'phone' ? 'phone' : 'ff')) || { id: layout === 'phone' ? 'phone' : 'ff', focal: layout === 'phone' ? 6 : 50, aperture: 1.8, apertureFixed: layout === 'phone' };
  const state = {
    brand: withModel(brands.find((b) => b.id === ctx.getSetting('cameraBrand', '')) || brands[0], ctx.getSetting('cameraModel', '')),
    mode: 'aperturePriority', aperture: 4, shutter: 1 / 60, iso: 400, nd: 0, isoAuto: false, light, diff: 0,
    ...start,
  };
  state.userIso = state.iso;
  let limits = cameraLimits(ctx, modes, state.brand);

  const scene = createScene({ label: t('learn.sim.sceneLabel') });
  const dials = cameraDials({ ...state, brand: state.brand, live: scene.el, onPart, onModeSelect: (m) => { state.mode = m; draw(); onModeTurn?.(m); } });

  const brandSel = el('select', { class: 'select' }, brands.map((b) => el('option', { value: b.id, text: b.name, selected: b.id === state.brand.id })));
  // Modell: Gehäuse, Radbelegung und Grenzen genau dieses Modells (data/camera-modes.json → models)
  const modelSel = el('select', { class: 'select' });
  const modelField = el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('camera.model') }), modelSel]);
  function fillModels() {
    const base = brands.find((b) => b.id === state.brand.id);
    const models = base.models || [];
    modelSel.innerHTML = '';
    modelSel.append(el('option', { value: '', text: t('camera.modelGeneric', { brand: base.name }) }), ...models.map((m) => el('option', { value: m.id, text: m.name, selected: m.id === state.brand.model?.id })));
    modelField.hidden = !models.length;
  }
  function applyCamera(brandId, modelId) {
    state.brand = withModel(brands.find((b) => b.id === brandId), modelId);
    ctx.setSetting('cameraBrand', brandId); ctx.setSetting('cameraModel', modelId || '');
    limits = cameraLimits(ctx, modes, state.brand); dials.setBrand(state.brand); modeBar.setBrand(state.brand); showModeRow(); showSensor(); buildSliders(); draw();
  }
  brandSel.addEventListener('change', () => { applyCamera(brandSel.value, ''); fillModels(); });
  modelSel.addEventListener('change', () => applyCamera(state.brand.id, modelSel.value));
  fillModels();
  // Sensorformat des Modells (bzw. der Marke, wo eindeutig) als kleine Grafik wie beim Modusrad:
  // Umriss = Vollformat 36 × 24 mm, grün und mittig darin der Sensor der Kamera im echten Größenverhältnis.
  const NS = 'http://www.w3.org/2000/svg';
  const svgN = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const sensorFig = svgN('svg', { class: 'sensor-fig', viewBox: '0 0 40 36', role: 'img' });
  const ffRect = svgN('rect', { class: 'sensor-ff', x: 2, y: 2, width: 36, height: 24, rx: 1 });
  const camRect = svgN('rect', { class: 'sensor-cam', rx: 0.8 });
  // Strich von der gestrichelten Linie zur Beschriftung „Vollformat 36 × 24 mm“
  const ffLeader = svgN('path', { class: 'sensor-leader', d: 'M33 26 V30.5' });
  const ffLabel = svgN('text', { class: 'sensor-label', x: 38, y: 34.2, 'text-anchor': 'end' });
  ffLabel.textContent = t('camera.sensorFF');
  sensorFig.append(ffRect, camRect, ffLeader, ffLabel);
  const sensorTitle = el('p', { class: 'mode-row-title field-label', text: t('camera.sensorTitle') });
  const sensorName = el('p', { class: 'mode-row-name' });
  const sensorText = el('p', { class: 'mode-row-text small' });
  const sensorLine = el('div', { class: 'mode-row sensor-row' }, [el('div', { class: 'sensor-fig-wrap' }, [sensorFig]), el('div', { class: 'mode-row-info' }, [sensorTitle, sensorName, sensorText])]);
  function showSensor() {
    const s = state.brand.sensor;
    sensorLine.hidden = !s;
    if (!s) return;
    const w = 36 / s.crop, h = 24 / s.crop;
    camRect.setAttribute('x', 20 - w / 2); camRect.setAttribute('y', 14 - h / 2); camRect.setAttribute('width', w); camRect.setAttribute('height', h);
    sensorFig.setAttribute('aria-label', t('camera.sensorFig', { format: s.format }));
    sensorName.textContent = s.format;
    sensorText.textContent = s.crop === 1 ? t('camera.sensorFullText', { size: s.size }) : t('camera.sensorText', { size: s.size, crop: String(s.crop).replace('.', ',') });
  }
  showSensor();


  // Das wichtigste Rad als drehbares Rad unter der Kamera: Modusrad, MODE-Taste oder Zeitenrad und Blendenring
  const modeBar = modeDial({ concepts: modes.concepts, brand: state.brand, value: state.mode, label: t('camera.dialTitle.modeDial'), onSelect: (m) => { state.mode = m; draw(); onModeTurn?.(m); } });
  // Kleines Rad über der Kamera, daneben was die Stellung bedeutet
  const modeTitle = el('p', { class: 'mode-row-title field-label' });
  const modeName = el('p', { class: 'mode-row-name' });
  const modeMeaning = el('p', { class: 'mode-row-text small' });
  const modeBrand = el('p', { class: 'mode-row-text small muted' });
  const modeRow = el('div', { class: 'mode-row' }, [modeBar.el, el('div', { class: 'mode-row-info' }, [modeTitle, modeName, modeMeaning, modeBrand])]);
  // Handys haben kein Moduswahlrad: Zeile ausblenden
  const showModeRow = () => { modeRow.hidden = state.brand.layout === 'phone'; };
  showModeRow();
  const ndBar = el('div', { class: 'chips' }, ND_STEPS.map((n) => el('button', { type: 'button', class: 'chip quick', dataset: { nd: String(n) }, text: n ? `ND ${n}` : t('learn.sim.noNd'), onClick: () => { state.nd = n; draw(); } })));
  const lightBar = el('div', { class: 'chips' }, Object.keys(LIGHTS).map((id) => el('button', { type: 'button', class: 'chip quick', dataset: { light: id }, text: t(`camera.light.${id}`), onClick: () => { state.light = id; draw(); } })));
  lightBar.hidden = !lightSwitch;
  const readout = el('div', { class: 'cam-readout small' });
  const seenLine = el('p', { class: 'cam-seen small', 'aria-live': 'polite' });

  // ---- Regler, begrenzt auf die eigene Kamera ----
  let apertures, shutters, isos, apSl, shSl, isoSl;
  const sliderBox = el('div');
  function range(label, list, value, format, onInput) {
    const out = el('span', { class: 'graphic-value' });
    const input = el('input', { type: 'range', class: 'range', min: 0, max: list.length - 1, step: 1 });
    const idx = list.reduce((best, v, i) => (Math.abs(Math.log2(v / value)) < Math.abs(Math.log2(list[best] / value)) ? i : best), 0);
    input.value = String(idx);
    out.textContent = format(list[idx]);
    input.addEventListener('input', () => { const v = list[Number(input.value)]; out.textContent = format(v); onInput(v); });
    return { field: el('label', { class: 'graphic-slider' }, [el('span', { class: 'field-label' }, [label, ' ', out]), input]), input, out, list };
  }
  function buildSliders() {
    apertures = standardSeries('aperture', 1 / 3).filter((a) => a >= limits.apMin - 0.05 && a <= limits.apMax + 0.05);
    if (!apertures.length) apertures = [limits.apMin];
    shutters = standardSeries('shutter', 1).filter((v) => v >= 1 / 4000 && v <= BULB_MAX);
    isos = standardSeries('iso', 1).filter((v) => v >= limits.isoMin * 0.99 && v <= limits.isoMax * 1.01);
    if (!isos.length) isos = [100];
    state.aperture = Math.min(Math.max(state.aperture, apertures[0]), apertures[apertures.length - 1]);
    state.userIso = Math.min(Math.max(state.userIso, isos[0]), isos[isos.length - 1]);
    state.iso = state.userIso;
    apSl = range(t('common.aperture'), apertures, state.aperture, fmtAperture, (v) => { state.aperture = v; draw(); });
    shSl = range(t('common.shutter'), shutters, state.shutter, fmtShutter, (v) => { state.shutter = v; draw(); });
    isoSl = range(t('common.iso'), isos, state.iso, (v) => String(v), (v) => { state.iso = v; state.userIso = v; draw(); });
    sliderBox.innerHTML = '';
    sliderBox.append(apSl.field, shSl.field, isoSl.field);
  }
  const nearest = (list, value) => list.reduce((best, v) => (Math.abs(Math.log2(v / value)) < Math.abs(Math.log2(best / value)) ? v : best), list[0]);
  function setSlider(sl, value, format, max = Infinity) {
    const v = nearest(sl.list.filter((x) => x <= max * 1.001), value);
    sl.input.value = String(sl.list.indexOf(v)); sl.out.textContent = format(v);
    return v;
  }

  /** Automatik wie an der Kamera; Zielbelichtung ist die Szene (mit ND), die Grenzen der Kamera gelten. */
  function autoExpose() {
    const m = state.mode;
    const phone = state.brand.layout === 'phone';
    const target = LIGHTS[state.light].ev - state.nd;
    state.isoAuto = false;
    if (phone) state.aperture = 1.8;
    if (m === 'program') {
      if (!phone) state.aperture = setSlider(apSl, Math.min(Math.max(5.6, apertures[0]), apertures[apertures.length - 1]), fmtAperture);
      let tNeed = shutterFor(target, state.aperture, isos[0]);
      let iso = isos[0];
      if (tNeed > HANDHELD) { iso = Math.min(limits.isoMax, Math.min(6400, isos[0] * tNeed / HANDHELD)); tNeed = shutterFor(target, state.aperture, iso); }
      state.iso = setSlider(isoSl, iso, (v) => `A ${v}`);
      state.isoAuto = true;
      state.shutter = setSlider(shSl, tNeed, fmtShutter, limits.maxShutter);
    } else {
      if (state.iso !== state.userIso) state.iso = setSlider(isoSl, state.userIso, (v) => String(v));
      if (m === 'aperturePriority') state.shutter = setSlider(shSl, shutterFor(target, state.aperture, state.iso), fmtShutter, limits.maxShutter);
      else if (m === 'shutterPriority' && !phone) state.aperture = setSlider(apSl, apertureFor(target, state.shutter, state.iso), fmtAperture);
      if ((m === 'manual' || m === 'shutterPriority') && state.shutter > limits.maxShutter) state.shutter = setSlider(shSl, limits.maxShutter, fmtShutter, limits.maxShutter);
    }
    if (phone) apSl.out.textContent = `${fmtAperture(1.8)} (${t('learn.sim.fixed')})`;
    apSl.input.disabled = phone || m === 'program' || m === 'shutterPriority';
    shSl.input.disabled = m === 'program' || m === 'aperturePriority';
    isoSl.input.disabled = m === 'program';
  }

  function draw() {
    autoExpose();
    const m = state.mode;
    const device = deviceFor(state.brand.layout);
    const { diff, seen } = scene.render({ aperture: state.aperture, shutter: state.shutter, iso: state.iso, nd: state.nd, device, light: state.light });
    state.diff = diff;
    dials.update({ aperture: state.aperture, shutter: state.shutter, iso: state.iso, mode: m, exposure: diff, isoAuto: state.isoAuto });
    modeBar.set(m);
    const layout = state.brand.layout;
    const dialTitle = t(`camera.dialTitle.${layout === 'dials' ? 'dials' : state.brand.body?.modeDial === 'button' ? 'button' : layout === 'phone' ? 'phone' : 'modeDial'}`);
    modeBar.setTitle(dialTitle);
    const concept = modes.concepts.find((x) => x.id === m);
    modeTitle.textContent = dialTitle;
    modeName.textContent = `${shortLabel(state.brand, m)} · ${concept?.name || ''}`;
    modeMeaning.textContent = concept ? t('camera.modeMeaning', { you: concept.youSet, cam: concept.cameraSets }) : '';
    const full = state.brand.modes?.[m];
    modeBrand.textContent = full && full !== shortLabel(state.brand, m) ? `${state.brand.name}: ${full}` : '';
    modeBrand.hidden = !modeBrand.textContent;
    ndBar.querySelectorAll('.chip').forEach((ch) => ch.setAttribute('aria-pressed', String(Number(ch.dataset.nd) === state.nd)));
    lightBar.querySelectorAll('.chip').forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.light === state.light)));

    const ok = Math.abs(diff) <= 0.4;
    const verdict = ok ? t('camera.exposureOk') : diff > 0 ? t('camera.tooBright', { stops: fmtStops(diff) }) : t('camera.tooDark', { stops: fmtStops(diff) });
    const motion = state.shutter >= 2 ? t('camera.motionSmooth') : state.shutter >= 1 / 15 ? t('camera.motionBlur') : t('camera.motionFrozen');
    const notes = [];
    const target = LIGHTS[state.light].ev - state.nd;
    if (state.isoAuto && state.iso >= 1600) notes.push(t('camera.autoIsoHigh', { iso: Math.round(state.iso) }));
    if ((m === 'aperturePriority' || m === 'manual') && !ok && diff < 0 && shutterFor(target, state.aperture, state.iso) > limits.maxShutter) notes.push(t('camera.limitShutter', { max: fmtShutter(limits.maxShutter), bulb: limits.bulb || t('camera.noBulb') }));
    if (m === 'shutterPriority' && !ok) notes.push(t('camera.apertureLimit'));
    if (state.light === 'day' && diff > 2 && state.shutter >= 1) notes.push(t('camera.needNd'));
    // Im Bild: Belichtung (nur wenn daneben), Bewegung, Wasser, Schärfe, Blendenstern, Rauschen
    const seenParts = [
      ok ? null : diff > 0 ? t('camera.seen.bright') : t('camera.seen.dark'),
      t(`camera.seen.motion_${seen.motion}`),
      t(`camera.seen.water_${seen.water}`),
      seen.dof === 'medium' ? null : t(`camera.seen.dof_${seen.dof}`),
      seen.star ? t('camera.seen.star') : null,
      seen.noise ? t('camera.seen.noise') : null,
    ].filter(Boolean);
    seenLine.replaceChildren(el('span', { class: 'cam-seen-label', text: t('camera.seen.label') }), ` ${seenParts.join(', ')}.`);
    readout.innerHTML = '';
    readout.append(
      el('span', { class: `verdict ${ok ? 'ok' : 'warn'}`, text: verdict }),
      el('span', { class: 'muted', text: `${motion} · ${t('camera.noise', { iso: Math.round(state.iso) })}${state.nd ? ` · ND ${state.nd} ${t('common.stops')}` : ''}` }),
      ...notes.map((n) => el('span', { class: 'muted', text: n })),
    );
    onChange?.(state);
  }

  buildSliders();
  // Bereich unter der Kamera; camera-view.js zeigt per Umschalter immer genau einen (Regler · Was ist wo · ND-Filter)
  const acc = (key, title, kids) => el('div', { class: 'card cam-pane', dataset: { acc: key }, role: 'region', 'aria-label': title }, kids);
  root.append(
    el('div', { class: 'fields' }, [el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('settings.cameraBrand') }), brandSel]), modelField]),
    sensorLine,
    modeRow,
    el('div', { class: 'card camera-card' }, [dials.el, showReadout ? null : seenLine, graphicNote || null, showReadout ? readout : null]),
    acc('settings', t('camera.settingsTitle'), [lightBar, sliderBox, el('p', { class: 'muted small', style: 'margin:2px 0 0', text: t('camera.sliderHint') })]),
    ...(afterCamera ? [afterCamera] : []), // „Wo finde ich was?“ unter den Kameraeinstellungen
    acc('nd', t('learn.sim.nd'), [ndBar]),
  );
  draw();
  return {
    state,
    dials,
    limits: () => limits,
    setLight(id) { state.light = id; draw(); },
    redraw: draw,
  };
}
