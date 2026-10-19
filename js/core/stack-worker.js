// focus – Stapel-Worker. Akkumuliert Einzelbilder in Float32 (RGB, kein Alpha).
// Klassischer Worker ohne Imports, damit er auch auf älteren Geräten läuft.
//
// Nachrichten vom Hauptthread:
//   { type: 'init', width, height, mode, previewScale, gain }   → { type: 'ready', offscreen } | { type: 'error', reason }
//   { type: 'frame', bitmap }            (ImageBitmap, transferiert; braucht OffscreenCanvas im Worker)
//   { type: 'frame', buffer, width, height } (RGBA-Bytes, transferiert; Fallback)
//   { type: 'preview' }                  → { type: 'preview', buffer, width, height, stats }
//   { type: 'finish' }                   → { type: 'result', buffer, width, height, first, stats }
//   { type: 'gain', value }              (nur Integrieren)
//   { type: 'reset' }
//
// Modi: 'mean' (Summe / Anzahl), 'max' (Maximum je Pixel), 'integrate' (Summe × Verstärkung, Clipping)
//
// Gerechnet wird im linearen Licht: Das Videobild ist sRGB (gamma-kodiert). Vor dem Addieren wird jeder
// Wert nach linear umgerechnet, am Ende zurück nach sRGB. Nur so ergeben zwei gleich helle Bilder beim
// Integrieren wirklich die doppelte Lichtmenge. Diese Datei ist der Rückfall, wenn die Grafikkarte
// (js/lib/gpu-stack.js) nicht genutzt werden kann.

// sRGB-Byte → lineares Licht 0..1
const TO_LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; TO_LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
// lineares Licht 0..1 → sRGB-Byte (Tabelle mit 4096 Stufen, genauer als 8 Bit in den Schatten)
const LUT_N = 4096;
const TO_SRGB = new Uint8ClampedArray(LUT_N + 1);
for (let i = 0; i <= LUT_N; i++) { const l = i / LUT_N; TO_SRGB[i] = Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); }
const enc = (l) => TO_SRGB[l >= 1 ? LUT_N : l <= 0 ? 0 : (l * LUT_N) | 0];

let W = 0, H = 0, mode = 'mean', previewScale = 1, gain = 1;
let acc = null;        // Float32Array W*H*3 (Summe bzw. Maximum)
let count = 0;
let first = null;      // Uint8ClampedArray RGBA in Vorschaugröße (erstes Einzelbild)
let firstLuma = null;  // mittlere Helligkeit 0..1 des ersten Bildes
let canvas = null, ctx = null;

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

self.onmessage = (e) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'init': return init(m);
      case 'frame': return frame(m);
      case 'preview': return preview();
      case 'finish': return finish();
      case 'gain': gain = m.value; return;
      case 'reset': return reset();
      default: return;
    }
  } catch (err) {
    post({ type: 'error', reason: String(err && err.message || err) });
  }
};

function init(m) {
  W = m.width; H = m.height; mode = m.mode; previewScale = m.previewScale || 1; gain = m.gain || 1;
  count = 0; first = null; firstLuma = null; acc = null;
  try {
    acc = new Float32Array(W * H * 3);
  } catch (err) {
    post({ type: 'error', reason: 'memory' });
    return;
  }
  let offscreen = false;
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      canvas = new OffscreenCanvas(W, H);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      offscreen = !!ctx;
    } catch { offscreen = false; }
  }
  post({ type: 'ready', offscreen });
}

function reset() {
  count = 0; first = null; firstLuma = null;
  if (acc) acc.fill(0);
}

function frame(m) {
  let data;
  if (m.bitmap) {
    if (!ctx) { m.bitmap.close(); post({ type: 'error', reason: 'no-offscreen' }); return; }
    ctx.drawImage(m.bitmap, 0, 0, W, H);
    m.bitmap.close();
    data = ctx.getImageData(0, 0, W, H).data;
  } else {
    data = new Uint8ClampedArray(m.buffer);
    if (m.width !== W || m.height !== H) { post({ type: 'error', reason: 'size' }); return; }
  }
  const n = W * H;
  if (count === 0) {
    first = downscale(data, previewScale);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    firstLuma = sum / n / 255;
  }
  if (mode === 'max') {
    for (let i = 0, j = 0; j < n * 3; i += 4, j += 3) {
      const r = TO_LIN[data[i]], g = TO_LIN[data[i + 1]], b = TO_LIN[data[i + 2]];
      if (r > acc[j]) acc[j] = r;
      if (g > acc[j + 1]) acc[j + 1] = g;
      if (b > acc[j + 2]) acc[j + 2] = b;
    }
  } else {
    for (let i = 0, j = 0; j < n * 3; i += 4, j += 3) {
      acc[j] += TO_LIN[data[i]];
      acc[j + 1] += TO_LIN[data[i + 1]];
      acc[j + 2] += TO_LIN[data[i + 2]];
    }
  }
  count += 1;
  post({ type: 'frameDone', count });
}

function downscale(rgba, scale) {
  if (scale <= 1) return new Uint8ClampedArray(rgba);
  const w = Math.floor(W / scale), h = Math.floor(H / scale);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y * scale;
    for (let x = 0; x < w; x++) {
      const si = (sy * W + x * scale) * 4;
      const di = (y * w + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}

/** Ausgabe-Faktor je Modus: lineares Licht = acc * factor, bei Weiß (1,0) geclippt. */
function outputFactor() {
  if (mode === 'mean') return count > 0 ? 1 / count : 0;
  if (mode === 'max') return 1;
  return gain;
}

function compose(scale) {
  const f = outputFactor();
  const w = scale > 1 ? Math.floor(W / scale) : W;
  const h = scale > 1 ? Math.floor(H / scale) : H;
  const out = new Uint8ClampedArray(w * h * 4);
  const hist = new Uint32Array(64);
  let clipped = 0;
  for (let y = 0; y < h; y++) {
    const sy = scale > 1 ? y * scale : y;
    for (let x = 0; x < w; x++) {
      const sx = scale > 1 ? x * scale : x;
      const si = (sy * W + sx) * 3;
      const di = (y * w + x) * 4;
      const r = enc(acc[si] * f), g = enc(acc[si + 1] * f), b = enc(acc[si + 2] * f);
      out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      hist[(l * 63 / 255) | 0] += 1;
      if (l >= 254) clipped += 1;
    }
  }
  return { out, w, h, stats: { count, histogram: Array.from(hist), clippedFraction: clipped / (w * h), firstLuma } };
}

function preview() {
  if (!acc || count === 0) { post({ type: 'preview', buffer: null, stats: { count, firstLuma } }); return; }
  const { out, w, h, stats } = compose(previewScale);
  post({ type: 'preview', buffer: out.buffer, width: w, height: h, stats }, [out.buffer]);
}

function finish() {
  if (!acc || count === 0) { post({ type: 'result', buffer: null }); return; }
  const { out, w, h, stats } = compose(1);
  const fw = previewScale > 1 ? Math.floor(W / previewScale) : W;
  const fh = previewScale > 1 ? Math.floor(H / previewScale) : H;
  const firstCopy = first;
  first = null;
  post({ type: 'result', buffer: out.buffer, width: w, height: h, first: firstCopy ? firstCopy.buffer : null, firstWidth: fw, firstHeight: fh, stats }, firstCopy ? [out.buffer, firstCopy.buffer] : [out.buffer]);
}
