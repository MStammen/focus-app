// Kamerazugriff: Stream anfordern, Fähigkeiten lesen, Constraints setzen. Dazu ein Demo-Strom ohne Kamera.

export const PREFERRED = {
  video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
  audio: false,
};

/** Rückkamera anfordern, Fallback auf irgendeine Kamera. Wirft bei Verweigerung. */
export async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('getUserMedia fehlt'), { code: 'unsupported' });
  try {
    return await navigator.mediaDevices.getUserMedia(PREFERRED);
  } catch (err) {
    if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) throw Object.assign(err, { code: 'denied' });
    if (err && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } catch (err2) {
        if (err2 && err2.name === 'NotAllowedError') throw Object.assign(err2, { code: 'denied' });
        throw Object.assign(err2, { code: 'nocamera' });
      }
    }
    throw Object.assign(err, { code: 'other' });
  }
}

// Gemeinsamer Kamera-Stream für die ganze App-Sitzung: Wer den Reiter wechselt, bekommt beim
// Zurückkommen denselben Stream. So fragt das Handy (vor allem iOS) nicht jedes Mal neu um Erlaubnis.
let shared = null, releaseTimer = null;

/** Laufenden Stream wiederverwenden oder neu öffnen. */
export async function acquireCamera() {
  clearTimeout(releaseTimer); releaseTimer = null;
  if (shared && shared.getVideoTracks().some((t) => t.readyState === 'live')) return shared;
  shared = await openCamera();
  return shared;
}

/** Läuft noch ein Stream aus dieser Sitzung (z. B. nach kurzem Reiterwechsel)? */
export function cameraIsLive() {
  return !!shared && shared.getVideoTracks().some((t) => t.readyState === 'live');
}

/** Stream freigeben: sofort (delayMs 0, z. B. App im Hintergrund) oder nach einer Wartezeit. */
export function releaseCamera(delayMs = 0) {
  clearTimeout(releaseTimer); releaseTimer = null;
  const s = shared;
  if (!s) return;
  const stop = () => { if (shared === s) { stopStream(s); shared = null; } };
  if (delayMs > 0) releaseTimer = setTimeout(stop, delayMs); else stop();
}

export function stopStream(stream) {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* egal */ }
}

/** Fähigkeiten, die wir anbieten. Nur was das Gerät kann, kommt zurück. */
export function readCapabilities(track) {
  const caps = typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {};
  const settings = typeof track?.getSettings === 'function' ? track.getSettings() : {};
  const out = { settings };
  if (caps.exposureCompensation && caps.exposureCompensation.max > caps.exposureCompensation.min) out.exposureCompensation = caps.exposureCompensation;
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual') && caps.exposureTime) out.exposureTime = caps.exposureTime;
  if (caps.iso && caps.iso.max > caps.iso.min) out.iso = caps.iso;
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) out.focusLock = true;
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) out.whiteBalanceLock = true;
  return out;
}

/** Einzelnen Constraint setzen; Fehler werden geschluckt und als false gemeldet. */
export async function applyAdvanced(track, constraint) {
  try {
    await track.applyConstraints({ advanced: [constraint] });
    return true;
  } catch {
    return false;
  }
}

/** Gerätewerte, die sich auslesen lassen (für Metadaten und Äquivalenzrechnung). */
export function readDeviceValues(track) {
  const s = typeof track?.getSettings === 'function' ? track.getSettings() : {};
  return {
    width: s.width, height: s.height, frameRate: s.frameRate,
    exposureTime: s.exposureTime, // in 1/10000 s laut Spec der Media Capture API
    iso: s.iso, exposureCompensation: s.exposureCompensation,
    focusMode: s.focusMode, whiteBalanceMode: s.whiteBalanceMode, exposureMode: s.exposureMode,
  };
}

/**
 * Demo-Strom ohne Kamera (nur zum Testen der Pipeline am Rechner):
 * dunkle Szene mit wanderndem hellen Punkt und flackernder "Laterne".
 */
export function demoStream(width = 1280, height = 720) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  let t = 0;
  const timer = setInterval(() => {
    t += 1 / 30;
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#05070c'); g.addColorStop(1, '#1a2230');
    ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#2b3442';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * width / 8 + 10, height * 0.55 + (i % 3) * 20, width / 8 - 20, height);
    // Rauschen
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`; ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2); }
    // Laterne (konstant, leicht flackernd)
    const lx = width * 0.78, ly = height * 0.32;
    const rg = ctx.createRadialGradient(lx, ly, 2, lx, ly, 60);
    rg.addColorStop(0, `rgba(255,230,160,${0.9 + Math.random() * 0.1})`); rg.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = rg; ctx.fillRect(lx - 60, ly - 60, 120, 120);
    // Wandernder heller Punkt (Fahrzeuglicht)
    const px = (t * 160) % (width + 100) - 50, py = height * 0.62 + Math.sin(t * 2) * 10;
    ctx.fillStyle = '#ffd080'; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5040'; ctx.beginPath(); ctx.arc(px - 30, py, 5, 0, Math.PI * 2); ctx.fill();
  }, 1000 / 30);
  const stream = canvas.captureStream(30);
  const [track] = stream.getVideoTracks();
  const origStop = track.stop.bind(track);
  track.stop = () => { clearInterval(timer); origStop(); };
  return stream;
}
