// Signaltöne über Web Audio (selbst erzeugt, keine Dateien) und Vibration.
let ctx = null;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Muss aus einer Nutzeraktion heraus aufgerufen werden (iOS), damit Ton später erlaubt ist. */
export function unlockAudio() {
  const c = context();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.01);
}

function tone(freq, durationMs, startOffset = 0, volume = 0.25) {
  const c = context();
  if (!c) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export const signals = {
  start: () => tone(880, 120),
  minute: () => tone(660, 100),
  tenSeconds: () => tone(990, 150),
  end: () => { tone(880, 180); tone(1320, 260, 0.25); },
  tick: () => tone(1200, 40, 0, 0.12),
};

export function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* nicht verfügbar */ }
}

export const vibrations = {
  start: [80],
  minute: [60],
  tenSeconds: [100],
  end: [150, 100, 250],
};
