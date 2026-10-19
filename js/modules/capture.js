// Aufnahme: Langzeitbelichtung am Handy durch Stapeln von Einzelbildern (Mitteln · Aufhellen · Integrieren).
import { el, segmented, button, fmtShutter, fmtNum, fmtAperture, titleWithInfo } from '../lib/ui.js';
import { acquireCamera, releaseCamera, cameraIsLive, stopStream, readCapabilities, applyAdvanced, readDeviceValues, demoStream } from '../lib/camera.js';
import { canvasFromImageData, toBlob, resizeCanvas, drawWatermark, shareOrDownload, timestampName } from '../lib/image.js';
import { putEntry, newId } from '../lib/db.js';
import { ev, shutterFor } from '../core/exposure.js';
import { getSession, setSession } from '../lib/session.js';
import { createGpuStacker } from '../lib/gpu-stack.js';
import { COURSE_OPEN } from '../lib/features.js';

const MODES = ['mean', 'max', 'integrate'];
const DURATIONS = [2, 5, 10, 20, 30, 60, 0]; // 0 = bis Stopp
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;
const WORKER_URL = new URL('../core/stack-worker.js', import.meta.url);
// Tempo: Full HD mit bis zu 60 Bildern/s (Lichtspuren, Vorschau). Detail: 4K mit 30 Bildern/s (Mitteln am Stativ).
const QUALITY = { speed: { width: 1920, height: 1080, frameRate: 60 }, detail: { width: 3840, height: 2160, frameRate: 30 } };
const QUALITY_DEFAULT = { mean: 'detail', max: 'speed', integrate: 'speed' };
const HEAT_SECONDS = 120; // ab hier Hinweis auf Wärme (Handys drosseln bei langen 4K-Aufnahmen)

export async function init(root, ctx) {
  const { t, query } = ctx;
  const demo = query.get('demo') === '1';
  const state = {
    mode: ctx.getSetting('captureMode', 'mean'),
    duration: ctx.getSetting('captureDuration', 10),
    phase: 'idle', // idle | countdown | capturing | result
  };
  let stream = null, track = null, caps = null, worker = null, wakeLock = null;
  let run = null; // laufende Aufnahme
  let result = null; // fertiges Ergebnis
  let destroyed = false;

  // ---------- Grundgerüst ----------
  const head = titleWithInfo(ctx, { title: t('nav.capture'), key: 'capture' });
  root.append(head.row, head.box);

  // Die drei Arten (Mitteln, Aufhellen, Integrieren) stehen unter „Einstellungen“, mit eigenem Info-Knopf
  const modeBar = segmented({
    ariaLabel: t('capture.mode'), active: state.mode,
    items: MODES.map((id) => ({ id, label: t(`capture.modes.${id}.name`) })),
    onSelect: (id) => { if (state.phase !== 'idle') return; state.mode = id; ctx.setSetting('captureMode', id); updateModeText(); updateGainRow(); updateQuality(); modeBar.querySelectorAll('.segment').forEach((s, i) => s.setAttribute('aria-current', MODES[i] === id ? 'true' : 'false')); },
  });
  // Erklärung aller drei Arten; die gewählte ist grün
  const modesInfo = el('div', { class: 'small cap-modes-info', id: 'capture-modes-info' }, [
    el('ul', {}, MODES.map((id) => el('li', { dataset: { mode: id } }, [
      el('span', { class: 'cap-mode-name', text: `${t(`capture.modes.${id}.name`)}: ` }), t(`capture.modes.${id}.hint`),
    ]))),
    COURSE_OPEN ? el('p', {}, [el('a', { href: '#/learn', text: t('capture.learnMore') })]) : null,
  ]);
  function updateModeText() {
    modesInfo.querySelectorAll('li').forEach((li) => li.classList.toggle('current', li.dataset.mode === state.mode));
  }
  updateModeText();

  const notices = el('div');
  root.appendChild(notices);

  const viewport = el('div', { class: 'cap-viewport' });
  const video = el('video', { class: 'cap-video', autoplay: true, playsinline: true, muted: true });
  video.setAttribute('playsinline', '');
  video.muted = true;
  const stackCanvas = el('canvas', { class: 'cap-stack', hidden: true });
  const resLabel = el('div', { class: 'cap-badge cap-badge-left' });
  const counter = el('div', { class: 'cap-badge cap-badge-right', 'aria-live': 'polite' });
  const countdownEl = el('div', { class: 'cap-countdown', hidden: true });
  const integrateBox = el('div', { class: 'cap-integrate', hidden: true });
  const histCanvas = el('canvas', { class: 'cap-hist', width: 128, height: 40 });
  const equivLine = el('div', { class: 'cap-equiv' });
  integrateBox.append(histCanvas, equivLine);
  const viewportMsg = el('div', { class: 'cap-message', hidden: true });
  viewport.append(video, stackCanvas, resLabel, counter, countdownEl, integrateBox, viewportMsg);
  root.appendChild(viewport);

  // Verstärkung für Integrieren: in Stufen, 0 = Normalbelichtung am Ende der gewählten Dauer. Steht im Bereich „Einstellungen“.
  const gainRow = el('div', { class: 'gain-row' });
  const gainOut = el('span', { class: 'graphic-value' });
  const gainInput = el('input', { type: 'range', class: 'range', min: -2, max: 2, step: 1 / 3, value: ctx.getSetting('integrateGainStops', 0) });
  const fmtGain = (v) => (Math.abs(v) < 0.01 ? t('capture.gainNormal') : `${v > 0 ? '+' : '−'}${fmtNum(Math.abs(v), 1)} ${t('common.stops')}`);
  gainOut.textContent = fmtGain(Number(gainInput.value));
  gainInput.addEventListener('input', () => { gainOut.textContent = fmtGain(Number(gainInput.value)); ctx.setSetting('integrateGainStops', Number(gainInput.value)); });
  gainRow.append(el('label', { class: 'graphic-slider' }, [el('span', { class: 'field-label' }, [t('capture.gain'), ' ', gainOut]), gainInput]), el('p', { class: 'muted small', style: 'margin:6px 0 0', text: t('capture.gainHint') }));
  // Einstellungen: Verstärkung (nur Integrieren) und was das Handy an der Kamera einstellen lässt
  const modesBtn = el('button', { type: 'button', class: 'info-btn', 'aria-label': t('capture.modesInfo'), 'aria-controls': 'capture-modes-info' }, [el('span', { 'aria-hidden': 'true', text: 'i' })]);
  const setModesInfo = (open) => { modesInfo.hidden = !open; modesBtn.setAttribute('aria-expanded', String(open)); };
  setModesInfo(!!ctx.getSetting('captureModesInfoOpen', false));
  modesBtn.addEventListener('click', () => { const open = modesInfo.hidden; setModesInfo(open); ctx.setSetting('captureModesInfoOpen', open); });
  const modeBox = el('div', { class: 'cap-modes' }, [el('div', { class: 'cap-modes-head' }, [el('span', { class: 'field-label', text: t('capture.mode') }), modesBtn]), modeBar, modesInfo]);

  // Einstellungen (aufklappbar, offen/zu merkt sich die App): Art der Aufnahme, Verstärkung beim Integrieren,
  // dann was das Handy an der Kamera einstellen lässt
  const capsPanel = el('details', { class: 'panel' }, [el('summary', { text: t('capture.cameraSettings') })]);
  capsPanel.open = !!ctx.getSetting('captureSettingsOpen', false);
  capsPanel.addEventListener('toggle', () => ctx.setSetting('captureSettingsOpen', capsPanel.open));
  const capsBody = el('div');
  // Tempo oder Auflösung, Standard je Art; die Wahl merkt sich die App je Art
  const qualityOf = (m) => ctx.getSetting(`captureQuality.${m}`, QUALITY_DEFAULT[m]);
  const qualityBar = segmented({
    ariaLabel: t('capture.quality.label'), active: qualityOf(state.mode),
    items: ['speed', 'detail'].map((id) => ({ id, label: t(`capture.quality.${id}`) })),
    onSelect: (id) => { if (state.phase !== 'idle') return; ctx.setSetting(`captureQuality.${state.mode}`, id); updateQuality(); },
  });
  const qualityHint = el('p', { class: 'muted small', style: 'margin:6px 0 0' });
  const qualityBox = el('div', { class: 'cap-quality' }, [el('span', { class: 'field-label', text: t('capture.quality.label') }), qualityBar, qualityHint]);
  function updateQuality() {
    const q = qualityOf(state.mode);
    qualityBar.querySelectorAll('.segment').forEach((sg, i) => sg.setAttribute('aria-current', ['speed', 'detail'][i] === q ? 'true' : 'false'));
    qualityHint.textContent = t(`capture.quality.${q}Hint`);
    applyQuality();
  }
  /** Gewünschte Auflösung und Bildrate an die laufende Kamera geben (nicht im Demo-Modus, nicht während der Aufnahme). */
  async function applyQuality() {
    if (!track || demo || state.phase !== 'idle') return;
    const q = QUALITY[qualityOf(state.mode)];
    try { await track.applyConstraints({ width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.frameRate } }); } catch { /* Gerät bleibt bei seiner Einstellung */ }
  }
  capsPanel.appendChild(el('div', { class: 'panel-body' }, [modeBox, qualityBox, gainRow, capsBody]));
  let hasDeviceCaps = false;
  const updateGainRow = () => { gainRow.hidden = state.mode !== 'integrate'; };
  updateGainRow();

  // Bedienung unten
  const controls = el('div', { class: 'cap-controls' });
  const durations = el('div', { class: 'chips cap-durations' });
  for (const d of DURATIONS) {
    durations.appendChild(el('button', { type: 'button', class: 'chip quick', text: d === 0 ? t('capture.untilStop') : `${d} s`, 'aria-pressed': String(d === state.duration), onClick: () => { if (state.phase !== 'idle') return; state.duration = d; ctx.setSetting('captureDuration', d); durations.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === (d === 0 ? t('capture.untilStop') : `${d} s`)))); } }));
  }
  const ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  const shutterSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  shutterSvg.setAttribute('viewBox', '0 0 120 120');
  const ringBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  for (const [c, cls] of [[ringBg, 'ring-bg'], [ringFg, 'ring-fg']]) { c.setAttribute('cx', '60'); c.setAttribute('cy', '60'); c.setAttribute('r', String(RING_R)); c.setAttribute('class', cls); }
  ringFg.setAttribute('stroke-dasharray', String(RING_C));
  ringFg.setAttribute('stroke-dashoffset', String(RING_C));
  shutterSvg.append(ringBg, ringFg);
  const shutterBtn = el('button', { type: 'button', class: 'shutter', 'aria-label': t('capture.start'), onClick: onShutter });
  const shutterWrap = el('div', { class: 'shutter-wrap' }, [shutterSvg, shutterBtn]);
  const cancelBtn = button(t('common.cancel'), { danger: true, onClick: cancelCapture });
  cancelBtn.hidden = true;
  // Auslöser liegt unten mittig im Bild (wie in der Kamera-App), darunter die Zeiten in einer Zeile
  viewport.appendChild(shutterWrap);
  controls.append(durations, cancelBtn);
  root.appendChild(controls);
  // Einstellungen unter den Bedienknöpfen
  root.appendChild(capsPanel);


  const resultView = el('div', { class: 'cap-result', hidden: true });
  root.appendChild(resultView);

  // ---------- Kamera ----------
  async function startCamera() {
    if (destroyed) return;
    viewportMsg.hidden = true;
    try {
      stream = demo ? demoStream() : await acquireCamera();
    } catch (err) {
      showCameraError(err?.code || 'other');
      return;
    }
    track = stream.getVideoTracks()[0];
    shutterWrap.hidden = false;
    caps = readCapabilities(track);
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay blockiert: play() beim Antippen */ }
    const s = readDeviceValues(track);
    resLabel.textContent = `${s.width || video.videoWidth} × ${s.height || video.videoHeight}`;
    // Bildfenster an das Seitenverhältnis des Videos anpassen: kein schwarzer Leerraum über und unter dem Bild
    const fit = () => { if (video.videoWidth && video.videoHeight) { viewport.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`; resLabel.textContent = `${video.videoWidth} × ${video.videoHeight}`; } };
    fit();
    video.addEventListener('loadedmetadata', () => { resLabel.textContent = `${video.videoWidth} × ${video.videoHeight}`; fit(); }, { once: true });
    video.onresize = fit; // Drehen des Handys ändert das Seitenverhältnis
    track.addEventListener('ended', () => { if (state.phase === 'capturing') cancelCapture(t('capture.streamEnded')); });
    buildCapsPanel();
    updateQuality();
  }

  // Kamera aus, bis man sie einschaltet. Beim Einschalten fragt das Handy alle Genehmigungen in einem Rutsch ab:
  // erst den Bewegungssensor (für den Hinweis „verwackelt“, iOS verlangt dafür eine Nutzeraktion), dann die Kamera.
  let cameraWanted = false;
  function showCameraOff() {
    shutterWrap.hidden = true;
    viewportMsg.hidden = false;
    viewportMsg.innerHTML = '';
    viewportMsg.append(
      el('p', { text: t('capture.off.text') }),
      button(t('capture.off.button'), { primary: true, onClick: enableCamera }),
      el('p', { class: 'small muted', text: t('capture.off.permissions') }),
    );
  }
  function enableCamera() {
    cameraWanted = true;
    ctx.setSetting('cameraNoteShown', true);
    requestMotion(); // sofort aus dem Tippen heraus, sonst zeigt iOS keine Rückfrage
    startCamera();
  }

  function showCameraError(code) {
    viewportMsg.hidden = false;
    viewportMsg.innerHTML = '';
    viewportMsg.append(el('p', { text: t(`capture.errors.${code}`) }), button(t('capture.retry'), { primary: true, onClick: startCamera }));
  }

  function buildCapsPanel() {
    capsBody.innerHTML = '';
    const keys = Object.keys(caps).filter((k) => k !== 'settings');
    hasDeviceCaps = keys.length > 0;
    updateGainRow();
    if (!hasDeviceCaps) return;
    const s = caps.settings;
    if (caps.exposureCompensation) capsBody.appendChild(rangeRow('exposureCompensation', caps.exposureCompensation, s.exposureCompensation ?? 0, (v) => `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), 1)} EV`));
    if (caps.exposureTime) {
      const row = toggleRow('manualExposure', s.exposureMode === 'manual', async (on) => {
        const ok = await applyAdvanced(track, { exposureMode: on ? 'manual' : 'continuous' });
        if (!ok) ctx.showToast(t('capture.notApplied'));
        etRow.hidden = !on;
      });
      capsBody.appendChild(row);
      const etRow = rangeRow('exposureTime', caps.exposureTime, s.exposureTime ?? caps.exposureTime.min, (v) => fmtShutter(Math.max(1e-6, v / 10000)));
      etRow.hidden = s.exposureMode !== 'manual';
      capsBody.appendChild(etRow);
    }
    if (caps.iso) capsBody.appendChild(rangeRow('iso', caps.iso, s.iso ?? caps.iso.min, (v) => `ISO ${Math.round(v)}`));
    if (caps.focusLock) capsBody.appendChild(toggleRow('focusLock', s.focusMode === 'manual', async (on) => { if (!(await applyAdvanced(track, { focusMode: on ? 'manual' : 'continuous' }))) ctx.showToast(t('capture.notApplied')); }));
    if (caps.whiteBalanceLock) capsBody.appendChild(toggleRow('whiteBalanceLock', s.whiteBalanceMode === 'manual', async (on) => { if (!(await applyAdvanced(track, { whiteBalanceMode: on ? 'manual' : 'continuous' }))) ctx.showToast(t('capture.notApplied')); }));
  }

  function rangeRow(key, cap, value, format) {
    const out = el('span', { class: 'muted small', text: format(value) });
    const input = el('input', { type: 'range', class: 'range', min: cap.min, max: cap.max, step: cap.step || 'any', value });
    input.addEventListener('input', () => { out.textContent = format(Number(input.value)); });
    input.addEventListener('change', async () => { if (!(await applyAdvanced(track, { [key]: Number(input.value) }))) ctx.showToast(t('capture.notApplied')); });
    return el('div', { class: 'row' }, [el('span', { class: 'row-label' }, [el('span', { text: t(`capture.caps.${key}`) }), el('span', { class: 'row-hint' }, [out]), input])]);
  }
  function toggleRow(key, checked, onChange) {
    const sw = el('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(checked), 'aria-label': t(`capture.caps.${key}`) });
    sw.addEventListener('click', () => { const next = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(next)); onChange(next); });
    return el('div', { class: 'row' }, [el('span', { class: 'row-label', text: t(`capture.caps.${key}`) }), sw]);
  }

  // ---------- Aufnahme ----------
  // ---------- Bewegungssensor (optional): starke Bewegung → Hinweis „verwackelt“ ----------
  const motion = { allowed: null, samples: 0, moved: 0, peak: 0, handler: null };
  async function requestMotion() {
    if (motion.allowed !== null) return motion.allowed;
    if (typeof DeviceMotionEvent === 'undefined') { motion.allowed = false; return false; }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try { motion.allowed = (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch { motion.allowed = false; }
    } else {
      motion.allowed = true;
    }
    return motion.allowed;
  }
  function startMotion() {
    motion.samples = 0; motion.moved = 0; motion.peak = 0;
    if (!motion.allowed) return;
    motion.handler = (e) => {
      const a = e.acceleration; // ohne Schwerkraft
      if (!a || a.x == null) return;
      const mag = Math.hypot(a.x, a.y, a.z);
      motion.samples += 1;
      if (mag > 0.5) motion.moved += 1;
      if (mag > motion.peak) motion.peak = mag;
    };
    window.addEventListener('devicemotion', motion.handler);
  }
  function stopMotion() {
    if (motion.handler) window.removeEventListener('devicemotion', motion.handler);
    motion.handler = null;
    if (motion.samples < 5) return null;
    const fraction = motion.moved / motion.samples;
    return { peak: motion.peak, fraction, shaky: motion.peak > 1.5 || fraction > 0.1 };
  }

  function onShutter() {
    if (state.phase === 'capturing') { finishCapture(); return; }
    if (state.phase !== 'idle' || !stream) { if (!stream) enableCamera(); return; }
    requestMotion(); // muss aus der Nutzeraktion heraus passieren (iOS); Ergebnis wird nicht abgewartet
    if (!getSession('tripodHintShown', false)) {
      setSession('tripodHintShown', true);
      showNotice(t('capture.tripodHint'));
    }
    if (ctx.getSetting('countdown', true)) startCountdown(3);
    else runCapture();
  }

  let transientNotice = null;
  function showNotice(text) {
    transientNotice?.remove();
    transientNotice = el('p', { class: 'notice small', text });
    notices.appendChild(transientNotice);
    const mine = transientNotice;
    setTimeout(() => { if (transientNotice === mine) { mine.remove(); transientNotice = null; } }, 8000);
  }

  function startCountdown(n) {
    state.phase = 'countdown';
    shutterBtn.disabled = true;
    countdownEl.hidden = false;
    let left = n;
    countdownEl.textContent = String(left);
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0 || destroyed) { clearInterval(timer); countdownEl.hidden = true; shutterBtn.disabled = false; if (!destroyed) runCapture(); return; }
      countdownEl.textContent = String(left);
    }, 1000);
  }

  async function runCapture() {
    if (!stream || !track) return;
    state.phase = 'capturing';
    shutterBtn.classList.add('recording');
    shutterBtn.setAttribute('aria-label', t('capture.stop'));
    cancelBtn.hidden = false;
    modeBar.classList.add('disabled');

    const settings = readDeviceValues(track);
    let W = video.videoWidth || settings.width; // Videobild zählt (im Hochformat sind Breite und Höhe vertauscht)
    let H = video.videoHeight || settings.height;
    let lowRes = false;
    const previewScale = () => (W > 1920 ? 2 : 1);

    // Erst die Grafikkarte versuchen; klappt das nicht, rechnet der Worker auf dem Prozessor
    const gpu = ctx.getSetting('gpuStack', true) ? createGpuStacker({ width: W, height: H, mode: state.mode, previewScale: previewScale(), gain: 1 }) : null;
    let offscreen = false;
    const ready = gpu ? true : await new Promise((resolve) => {
      worker = new Worker(WORKER_URL);
      const onMsg = (e) => {
        if (e.data.type === 'ready') { worker.removeEventListener('message', onMsg); offscreen = e.data.offscreen; resolve(true); }
        else if (e.data.type === 'error') { worker.removeEventListener('message', onMsg); resolve(e.data.reason); }
      };
      worker.addEventListener('message', onMsg);
      worker.postMessage({ type: 'init', width: W, height: H, mode: state.mode, previewScale: previewScale(), gain: ctx.getSetting('integrateGain', 1) });
    });
    if (ready !== true) {
      if (ready === 'memory' && W > 1920) {
        // Speicher reicht nicht: auf 1080p zurückfallen
        W = Math.round(W / 2); H = Math.round(H / 2); lowRes = true;
        showNotice(t('capture.lowRes', { w: W, h: H }));
        const ok = await new Promise((resolve) => {
          const onMsg = (e) => { worker.removeEventListener('message', onMsg); offscreen = !!e.data.offscreen; resolve(e.data.type === 'ready'); };
          worker.addEventListener('message', onMsg);
          worker.postMessage({ type: 'init', width: W, height: H, mode: state.mode, previewScale: previewScale(), gain: ctx.getSetting('integrateGain', 1) });
        });
        if (!ok) { abort(t('capture.errors.worker')); return; }
      } else { abort(t('capture.errors.worker')); return; }
    }

    // Gerät vorbereiten: Weißabgleich und Fokus einfrieren, Belichtung pro Bild so lang wie möglich,
    // bei Integrieren Einzelbilder rund 3 Stufen dunkler (Reserve gegen Ausbrennen)
    const restore = [];
    if (caps.whiteBalanceLock && settings.whiteBalanceMode !== 'manual') {
      if (await applyAdvanced(track, { whiteBalanceMode: 'manual' })) restore.push({ whiteBalanceMode: settings.whiteBalanceMode || 'continuous' });
    }
    if (caps.focusLock && settings.focusMode !== 'manual') {
      const dist = track.getSettings?.().focusDistance;
      if (await applyAdvanced(track, { focusMode: 'manual', ...(dist > 0 ? { focusDistance: dist } : {}) })) restore.push({ focusMode: settings.focusMode || 'continuous' });
    }
    let compensationApplied = null;
    const longFrames = await lengthenFrames(settings, state.mode === 'integrate' ? -3 : 0);
    if (longFrames) {
      restore.push({ exposureMode: settings.exposureMode || 'continuous' });
      if (state.mode === 'integrate') compensationApplied = longFrames.compensation;
      if (longFrames.tooBright) showNotice(t('capture.tooBright'));
      await new Promise((r) => setTimeout(r, 300)); // neue Belichtung greifen lassen
    } else if (state.mode === 'integrate') {
      if (caps.exposureCompensation) {
        const target = Math.max(caps.exposureCompensation.min, -3);
        if (await applyAdvanced(track, { exposureCompensation: target })) { restore.push({ exposureCompensation: settings.exposureCompensation ?? 0 }); compensationApplied = target; }
        await new Promise((r) => setTimeout(r, 400)); // Belichtungsautomatik einschwingen lassen
      } else {
        showNotice(t('capture.noCompensation'));
      }
    }
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }

    const useBitmap = offscreen && typeof createImageBitmap === 'function' && !lowRes;
    const grabCanvas = gpu || useBitmap ? null : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const grabCtx = grabCanvas ? grabCanvas.getContext('2d', { willReadFrequently: true }) : null;

    run = {
      gpu, engine: gpu ? gpu.engine : 'cpu', firstPresented: null, lastPresented: null, heatShown: false,
      startedAt: performance.now(), frames: 0, busy: false, previewPending: false, stopped: false,
      restore, compensationApplied, W, H, lowRes, device: readDeviceValues(track), stats: null, rvfcHandle: null, rafHandle: null,
    };
    startMotion();
    if (gpu) { gpu.canvas.className = 'cap-stack'; viewport.insertBefore(gpu.canvas, stackCanvas); }
    else {
      stackCanvas.hidden = false;
      stackCanvas.width = Math.floor(W / previewScale()); stackCanvas.height = Math.floor(H / previewScale());
    }
    integrateBox.hidden = state.mode !== 'integrate';
    counter.textContent = t('capture.counter', { n: 0, s: '0,0' });

    worker?.addEventListener('message', onWorkerMessage);
    const grab = async (now, meta) => {
      if (!run || run.stopped) return;
      // Angebotene Bilder zählen (requestVideoFrameCallback liefert die laufende Nummer), um Verpasstes zu sehen
      if (meta && meta.presentedFrames != null) { if (run.firstPresented == null) run.firstPresented = meta.presentedFrames; run.lastPresented = meta.presentedFrames; }
      if (gpu && video.readyState >= 2) {
        if (!gpu.addFrame(video)) { abort(t('capture.errors.gpu')); return; }
        run.frames = gpu.count;
      } else if (!gpu && !run.busy && video.readyState >= 2) {
        run.busy = true;
        try {
          if (useBitmap) {
            const bmp = await createImageBitmap(video);
            if (run && !run.stopped) worker.postMessage({ type: 'frame', bitmap: bmp }, [bmp]); else bmp.close();
          } else {
            grabCtx.drawImage(video, 0, 0, W, H);
            const img = grabCtx.getImageData(0, 0, W, H);
            if (run && !run.stopped) worker.postMessage({ type: 'frame', buffer: img.data.buffer, width: W, height: H }, [img.data.buffer]);
          }
        } catch { run.busy = false; }
      }
      schedule();
    };
    const schedule = () => {
      if (!run || run.stopped) return;
      if (typeof video.requestVideoFrameCallback === 'function') run.rvfcHandle = video.requestVideoFrameCallback(grab);
      else run.rafHandle = requestAnimationFrame(grab);
    };
    schedule();
    run.previewTimer = setInterval(() => {
      if (!run || run.stopped) return;
      const elapsed = (performance.now() - run.startedAt) / 1000;
      const offered = offeredFrames();
      counter.textContent = offered > run.frames ? t('capture.counterOf', { n: run.frames, total: offered, s: fmtNum(elapsed, 1) }) : t('capture.counter', { n: run.frames, s: fmtNum(elapsed, 1) });
      if (elapsed > HEAT_SECONDS && !run.heatShown) { run.heatShown = true; showNotice(t('capture.heat')); }
      if (state.duration > 0) {
        ringFg.setAttribute('stroke-dashoffset', String(RING_C * (1 - Math.min(1, elapsed / state.duration))));
        if (elapsed >= state.duration) { finishCapture(); return; }
      } else {
        ringFg.setAttribute('stroke-dashoffset', String(RING_C * (1 - ((elapsed % 10) / 10))));
      }
      if (gpu) {
        if (state.mode === 'integrate' && run.frames > 0) gpu.setGain(integrateGain(elapsed, run.frames));
        const st = gpu.preview();
        if (st.histogram) { run.stats = st; if (state.mode === 'integrate') updateIntegrateInfo(st, run.frames); }
        return;
      }
      if (state.mode === 'integrate' && run.frames > 0) worker.postMessage({ type: 'gain', value: integrateGain(elapsed, run.frames) });
      if (!run.previewPending) { run.previewPending = true; worker.postMessage({ type: 'preview' }); }
    }, 200);
  }

  /** Wie viele Bilder die Kamera in der Zeit geliefert hat (nur mit requestVideoFrameCallback bekannt). */
  function offeredFrames() {
    if (!run || run.firstPresented == null) return 0;
    return run.lastPresented - run.firstPresented + 1;
  }

  /**
   * Belichtung pro Einzelbild verlängern, wo das Gerät manuelle Belichtung erlaubt (vor allem Android-Chrome):
   * gleiche Bildhelligkeit wie die Automatik (plus comp Stufen), aber Zeit bis zur vollen Bilddauer, ISO so niedrig
   * wie möglich. Ergebnis { compensation, tooBright } oder null, wenn nichts geändert wurde.
   */
  async function lengthenFrames(settings, comp) {
    const capsAll = typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {};
    const tCap = capsAll.exposureTime, isoCap = capsAll.iso;
    if (!Array.isArray(capsAll.exposureMode) || !capsAll.exposureMode.includes('manual') || !tCap || !isoCap) return null;
    const t0 = settings.exposureTime, iso0 = settings.iso; // Zeit in 1/10000 s
    if (!(t0 > 0) || !(iso0 > 0)) return null;
    const fps = settings.frameRate || 30;
    const tMax = Math.min(10000 / fps, tCap.max);
    const product = t0 * iso0 * Math.pow(2, comp);
    const t1 = Math.max(tCap.min, Math.min(tMax, product / isoCap.min));
    const iso1 = Math.max(isoCap.min, Math.min(isoCap.max, product / t1));
    if (comp === 0 && t1 <= t0 * 1.05) return null; // Automatik belichtet schon lang genug
    if (!(await applyAdvanced(track, { exposureMode: 'manual', exposureTime: t1, iso: iso1 }))) return null;
    return { compensation: Math.log2((t1 * iso1) / (t0 * iso0)), tooBright: t1 < tMax * 0.8 };
  }

  function onWorkerMessage(e) {
    const m = e.data;
    if (!run && m.type !== 'result') return;
    if (m.type === 'frameDone') { run.frames = m.count; run.busy = false; }
    else if (m.type === 'preview') {
      run.previewPending = false;
      if (m.buffer) {
        stackCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.buffer), m.width, m.height), 0, 0);
        run.stats = m.stats;
        if (state.mode === 'integrate') updateIntegrateInfo(m.stats, run.frames);
      }
    } else if (m.type === 'error') {
      abort(t('capture.errors.worker') + (m.reason ? ` (${m.reason})` : ''));
    }
  }

  /** Verstärkung für Integrieren. Normalbelichtung wird am Ende der gewählten Dauer erreicht (bis Stopp: nach 10 s). */
  function integrateGain(elapsed, frames) {
    const target = state.duration > 0 ? state.duration : 10;
    const comp = run?.compensationApplied ?? 0; // echte Unterbelichtung des Geräts wieder ausgleichen
    return Math.pow(2, -comp) * Math.pow(2, ctx.getSetting('integrateGainStops', 0)) * (elapsed / target) / frames;
  }

  function updateIntegrateInfo(stats, frames) {
    const h = stats.histogram; const max = Math.max(1, ...h);
    const c = histCanvas.getContext('2d');
    c.clearRect(0, 0, 128, 40);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, 128, 40);
    const css = getComputedStyle(document.documentElement);
    c.fillStyle = (stats.clippedFraction > 0.02 ? css.getPropertyValue('--danger') : css.getPropertyValue('--accent')).trim() || '#ffffff';
    for (let i = 0; i < 64; i++) { const v = (h[i] / max) * 38; c.fillRect(i * 2, 40 - v, 2, v); }
    equivLine.textContent = equivalentText(frames, run.device, stats.firstLuma) + (stats.clippedFraction > 0.02 ? ` · ${t('capture.clipping', { p: fmtNum(stats.clippedFraction * 100, 0) })}` : '');
  }

  /** Äquivalente Belichtung „entspricht ca. 8 s bei f/8, ISO 100“. */
  function equivalentText(frames, device, firstLuma) {
    if (frames < 1) return '';
    const A = ctx.getSetting('phoneAperture', 1.8);
    let tFrame, iso, estimated = false;
    if (device.exposureTime > 0 && device.iso > 0) { tFrame = device.exposureTime / 10000; iso = device.iso; }
    else {
      // Schätzung: typische Automatik bei wenig Licht 1/30 s, ISO 400; mit mittlerer Helligkeit des ersten Bildes skaliert.
      estimated = true; iso = 400;
      const luma = Math.max(0.02, firstLuma || 0.2);
      tFrame = (1 / 30) * (luma / 0.3);
    }
    const evFrame = ev(A, tFrame, iso);
    const evTotal = evFrame - Math.log2(frames);
    const tEq = shutterFor(evTotal, 8, 100);
    return `${t('capture.equivalent', { t: fmtShutter(tEq), a: fmtAperture(8) })}${estimated ? ` (${t('capture.estimated')})` : ''}`;
  }

  function stopLoop() {
    if (!run) return;
    run.stopped = true;
    clearInterval(run.previewTimer);
    try { if (run.rvfcHandle && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(run.rvfcHandle); } catch { /* egal */ }
    if (run.rafHandle) cancelAnimationFrame(run.rafHandle);
  }

  async function restoreTrack() {
    if (!run || !track) return;
    for (const c of run.restore) await applyAdvanced(track, c);
    try { wakeLock?.release(); } catch { /* egal */ }
    wakeLock = null;
  }

  function resetUi() {
    state.phase = 'idle';
    shutterBtn.classList.remove('recording');
    shutterBtn.setAttribute('aria-label', t('capture.start'));
    shutterBtn.disabled = false;
    cancelBtn.hidden = true;
    stackCanvas.hidden = true;
    integrateBox.hidden = true;
    counter.textContent = '';
    ringFg.setAttribute('stroke-dashoffset', String(RING_C));
    modeBar.classList.remove('disabled');
  }

  async function cancelCapture(reason) {
    if (!run) return;
    stopLoop();
    stopMotion();
    await restoreTrack();
    run.gpu?.destroy();
    worker?.terminate(); worker = null;
    run = null;
    resetUi();
    ctx.showToast(typeof reason === 'string' ? reason : t('capture.cancelled'));
  }

  function abort(message) {
    stopLoop();
    stopMotion();
    restoreTrack();
    run?.gpu?.destroy();
    worker?.terminate(); worker = null;
    run = null;
    resetUi();
    ctx.showToast(message, { timeout: 6000 });
  }

  async function finishCapture() {
    if (!run || run.stopped) return;
    stopLoop();
    const elapsed = (performance.now() - run.startedAt) / 1000;
    const shake = stopMotion();
    shutterBtn.disabled = true;
    counter.textContent = t('capture.processing');
    let res;
    if (run.gpu) {
      await new Promise((r) => setTimeout(r, 30)); // „wird gerechnet“ erst zeigen, dann auslesen
      if (state.mode === 'integrate' && run.frames > 0) run.gpu.setGain(integrateGain(elapsed, run.frames));
      res = run.gpu.finish();
      run.gpu.destroy();
    } else {
      // auf laufendes Einzelbild warten
      for (let i = 0; i < 50 && run.busy; i++) await new Promise((r) => setTimeout(r, 40));
      if (state.mode === 'integrate' && run.frames > 0) worker.postMessage({ type: 'gain', value: integrateGain(elapsed, run.frames) });
      res = await new Promise((resolve) => {
        const onMsg = (e) => { if (e.data.type === 'result') { worker.removeEventListener('message', onMsg); resolve(e.data); } };
        worker.addEventListener('message', onMsg);
        worker.postMessage({ type: 'finish' });
      });
      worker.terminate(); worker = null;
    }
    await restoreTrack();
    const offered = offeredFrames();
    const info = run; run = null;
    resetUi();
    if (!res.buffer) { ctx.showToast(t('capture.noFrames')); return; }
    result = {
      canvas: canvasFromImageData(res.buffer, res.width, res.height),
      first: res.first ? canvasFromImageData(res.first, res.firstWidth, res.firstHeight) : null,
      mode: state.mode, duration: elapsed, frames: res.stats.count, fps: res.stats.count / Math.max(0.001, elapsed), offered, engine: info.engine,
      width: res.width, height: res.height, lowRes: info.lowRes, device: info.device, compensation: info.compensationApplied,
      equivalent: state.mode === 'integrate' ? equivalentText(res.stats.count, info.device, res.stats.firstLuma) : null,
      shake,
      createdAt: Date.now(),
    };
    showResult();
  }

  // ---------- Ergebnis ----------
  function showResult() {
    state.phase = 'result';
    if (demo) { stopStream(stream); stream = null; track = null; } else video.pause(); // Stream bleibt offen, damit „Verwerfen“ nicht erneut um Erlaubnis fragt
    for (const n of [viewport, capsPanel, controls]) n.hidden = true;
    resultView.hidden = false;
    resultView.innerHTML = '';
    const r = result;
    const frame = el('div', { class: 'compare' });
    r.canvas.className = 'compare-after';
    frame.appendChild(r.canvas);
    let slider = null;
    if (r.first) {
      r.first.className = 'compare-before';
      frame.appendChild(r.first);
      // Überblenden statt Trennlinie: ganz links das erste Einzelbild, ganz rechts der fertige Stapel
      const tag = el('span', { class: 'compare-label left' });
      frame.appendChild(tag);
      slider = el('input', { type: 'range', class: 'range', min: 0, max: 100, value: 100, 'aria-label': t('capture.compare') });
      const apply = () => {
        const v = Number(slider.value);
        r.first.style.opacity = String(1 - v / 100);
        tag.textContent = v <= 5 ? t('capture.compareBefore') : v >= 95 ? t('capture.compareAfter') : `${t('capture.compareBefore')} ${100 - Math.round(v)} % · ${t('capture.compareAfter')} ${Math.round(v)} %`;
      };
      slider.addEventListener('input', apply);
      apply();
      let dragging = false;
      const fromEvent = (e) => { const rect = frame.getBoundingClientRect(); const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left; slider.value = String(Math.max(0, Math.min(100, (x / rect.width) * 100))); apply(); };
      frame.addEventListener('pointerdown', (e) => { dragging = true; fromEvent(e); });
      frame.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
      window.addEventListener('pointerup', () => { dragging = false; });
    }
    resultView.appendChild(frame);
    if (slider) resultView.append(slider, el('div', { class: 'compare-ends small muted' }, [el('span', { text: t('capture.compareBefore') }), el('span', { text: t('capture.compareAfter') })]));

    const d = r.device || {};
    const rows = [
      [t('capture.meta.mode'), t(`capture.modes.${r.mode}.name`)],
      [t('capture.meta.duration'), `${fmtNum(r.duration, 1)} s`],
      [t('capture.meta.frames'), `${r.offered > r.frames ? t('capture.meta.framesOf', { n: r.frames, total: r.offered }) : r.frames} · ${fmtNum(r.fps, 1)} fps`],
      [t('capture.meta.engine'), t(`capture.meta.engines.${r.engine || 'cpu'}`)],
      [t('capture.meta.resolution'), `${r.width} × ${r.height}${r.lowRes ? ' · ' + t('capture.meta.lowRes') : ''}`],
    ];
    if (d.exposureTime > 0) rows.push([t('capture.meta.exposureTime'), fmtShutter(d.exposureTime / 10000)]);
    if (d.iso > 0) rows.push([t('capture.meta.iso'), `ISO ${Math.round(d.iso)}`]);
    if (r.compensation != null) rows.push([t('capture.meta.compensation'), `${r.compensation} EV`]);
    if (r.equivalent) rows.push([t('capture.meta.equivalent'), r.equivalent]);
    if (r.shake) rows.push([t('capture.meta.motion'), r.shake.shaky ? t('capture.meta.shaky', { peak: fmtNum(r.shake.peak, 1) }) : t('capture.meta.steady')]);
    if (r.shake?.shaky) resultView.appendChild(el('p', { class: 'notice small', text: t('capture.shakyNote') }));
    resultView.appendChild(el('div', { class: 'card' }, [el('table', { class: 'stops-table' }, rows.map(([k, v]) => el('tr', {}, [el('td', { text: k }), el('td', { text: v })])))]));

    resultView.appendChild(el('div', { class: 'btn-row' }, [
      button(t('capture.save'), { primary: true, onClick: saveResult }),
      button(t('capture.toLog'), { onClick: toLog }),
      button(t('capture.discard'), { danger: true, onClick: discardResult }),
    ]));
  }

  async function exportCanvas() {
    const r = result;
    const out = document.createElement('canvas');
    out.width = r.canvas.width; out.height = r.canvas.height;
    out.getContext('2d').drawImage(r.canvas, 0, 0);
    if (ctx.getSetting('watermark', true)) {
      await drawWatermark(out, `focus · ${t(`capture.modes.${r.mode}.name`)} · ${fmtNum(r.duration, 0)} s · ${r.frames} ${t('capture.meta.framesShort')}`);
    }
    return out;
  }

  async function saveResult() {
    try {
      const blob = await toBlob(await exportCanvas());
      const outcome = await shareOrDownload(blob, timestampName('focuslab'));
      if (outcome === 'downloaded') ctx.showToast(t('capture.downloaded'));
      else if (outcome === 'shared') ctx.showToast(t('capture.saved'));
    } catch (err) {
      ctx.showToast(`${t('capture.saveFailed')}: ${err?.message || err}`);
    }
  }

  async function toLog() {
    try {
      const r = result;
      const small = resizeCanvas(await exportCanvas(), 2048);
      const blob = await toBlob(small, 'image/jpeg', 0.9);
      const thumb = await toBlob(resizeCanvas(r.canvas, 320), 'image/jpeg', 0.8);
      const entry = {
        id: newId(), createdAt: r.createdAt, source: 'capture', cameraType: 'phone',
        aperture: ctx.getSetting('phoneAperture', 1.8), shutter: r.duration, iso: r.device?.iso || null, film: null, nd: null,
        note: '', image: blob, thumb,
        capture: { mode: r.mode, duration: r.duration, frames: r.frames, fps: r.fps, width: r.width, height: r.height, lowRes: r.lowRes, device: r.device, compensation: r.compensation, equivalent: r.equivalent, shake: r.shake },
      };
      await putEntry(entry);
      ctx.showToast(t('capture.loggedToast'));
      ctx.navigate(`log?entry=${entry.id}`);
    } catch (err) {
      ctx.showToast(`${t('capture.saveFailed')}: ${err?.message || err}`);
    }
  }

  function discardResult() {
    result = null;
    resultView.hidden = true;
    resultView.innerHTML = '';
    for (const n of [viewport, capsPanel, controls]) n.hidden = false;
    hasDeviceCaps = false;
    updateGainRow();
    state.phase = 'idle';
    startCamera();
  }

  // ---------- Sichtbarkeit ----------
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (state.phase === 'capturing' || state.phase === 'countdown') cancelCapture(t('capture.backgrounded'));
      // App im Hintergrund: Kamera sofort freigeben (iOS beendet sie ohnehin)
      if (state.phase !== 'result') { if (demo) stopStream(stream); else releaseCamera(0); stream = null; track = null; }
    } else if (state.phase === 'idle' && !stream && cameraWanted) {
      startCamera(); // war vorher an: nach Rückkehr aus dem Hintergrund wieder einschalten
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---------- Start ----------
  // Kamera bleibt aus; nur wenn sie aus dieser Sitzung noch läuft (kurzer Reiterwechsel) oder im Demo-Modus gleich an
  if (demo || cameraIsLive()) { cameraWanted = true; startCamera(); } else showCameraOff();
  if (demo) showNotice(t('capture.demoNote'));

  return () => {
    destroyed = true;
    document.removeEventListener('visibilitychange', onVisibility);
    stopLoop();
    worker?.terminate(); worker = null;
    try { wakeLock?.release(); } catch { /* egal */ }
    // Reiter verlassen: Kamera sofort aus (beim Zurückkommen wieder „Kamera einschalten“)
    if (demo) stopStream(stream); else releaseCamera(0);
    video.srcObject = null;
  };
}
