// Stapel-Worker ohne Browser: Datei in einer Sandbox mit nachgebautem self laden und Nachrichten schicken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadWorker() {
  const out = [];
  const self = { postMessage: (m) => out.push(m) };
  vm.runInNewContext(readFileSync(new URL('../js/core/stack-worker.js', import.meta.url), 'utf8'), { self, Math, Float32Array, Uint8ClampedArray, Uint32Array, Array, String });
  const send = (m) => self.onmessage({ data: m });
  return { send, out };
}
const frame = (w, h, v) => { const a = new Uint8ClampedArray(w * h * 4).fill(v); return a.buffer; };
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const srgb = (l) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055));

function stack(mode, values, gain = 1) {
  const { send, out } = loadWorker();
  send({ type: 'init', width: 4, height: 2, mode, previewScale: 1, gain });
  for (const v of values) send({ type: 'frame', buffer: frame(4, 2, v), width: 4, height: 2 });
  send({ type: 'finish' });
  const res = out.find((m) => m.type === 'result');
  return new Uint8ClampedArray(res.buffer)[0];
}

test('Mitteln: zwei gleiche Bilder ergeben denselben Wert', () => {
  assert.equal(stack('mean', [128, 128]), 128);
});

test('Mitteln rechnet im linearen Licht (Schwarz + Weiß ergibt nicht 128)', () => {
  assert.equal(stack('mean', [0, 255]), srgb(0.5)); // 188, nicht 128
});

test('Integrieren: zwei Bilder ergeben die doppelte Lichtmenge', () => {
  assert.equal(stack('integrate', [100, 100]), srgb(2 * lin(100)));
});

test('Aufhellen: hellster Wert je Pixel bleibt', () => {
  assert.equal(stack('max', [40, 200, 90]), 200);
});
