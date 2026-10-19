// Tests für js/core/pinhole.js – node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fNumber, diameterForFNumber, optimalDiameter, rateDiameter, blurDiameter, angleOfView,
  transferExposure, FORMATS, LAMBDA_MM,
} from '../js/core/pinhole.js';

const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≠ ${b} (±${tol})`);

test('fNumber: Kursaufgabe 0,4 mm Loch bei 120 mm → f/300', () => {
  close(fNumber(0.4, 120), 300);
});

test('fNumber und diameterForFNumber sind Umkehrungen', () => {
  close(diameterForFNumber(fNumber(0.3, 75), 75), 0.3);
  close(diameterForFNumber(250, 150), 0.6);
});

test('fNumber: ungültige Eingaben werfen', () => {
  assert.throws(() => fNumber(0, 100), RangeError);
  assert.throws(() => fNumber(0.3, -5), RangeError);
});

test('optimalDiameter: Rayleigh d = 1,9·√(λ·f)', () => {
  close(optimalDiameter(100), 1.9 * Math.sqrt(0.00055 * 100), 1e-12);
  close(optimalDiameter(100), 0.4456, 1e-3);
  close(optimalDiameter(150), 0.546, 1e-3); // Lernkarte: 150 mm → ≈ 0,55 mm → f/275
  assert.equal(LAMBDA_MM, 0.00055);
});

test('rateDiameter: zu groß / nahe Optimum / zu klein', () => {
  assert.equal(rateDiameter(0.45, 100).verdict, 'nearOptimum');
  assert.equal(rateDiameter(0.8, 100).verdict, 'tooLarge');
  assert.equal(rateDiameter(0.2, 100).verdict, 'tooSmall');
  const r = rateDiameter(0.45, 100);
  close(r.ratio, 0.45 / optimalDiameter(100), 1e-12);
  close(rateDiameter(optimalDiameter(100) * 2, 100).stopsFromOptimum, 2, 1e-12);
});

test('blurDiameter: Minimum nahe dem Rayleigh-Optimum', () => {
  const f = 100;
  const opt = optimalDiameter(f);
  const at = (d) => blurDiameter(d, f).total;
  assert.ok(at(opt) < at(opt * 2), 'größeres Loch unschärfer');
  assert.ok(at(opt) < at(opt / 2), 'kleineres Loch unschärfer (Beugung)');
  const b = blurDiameter(0.5, 100);
  close(b.geometric, 0.5);
  close(b.diffraction, 2.44 * 0.00055 * 100 / 0.5, 1e-12);
});

test('angleOfView: Kleinbild bei 50 mm ≈ 39,6° × 27° × 46,8°', () => {
  const a = angleOfView(50, 36, 24);
  close(a.horizontal, 39.6, 0.05);
  close(a.vertical, 27.0, 0.05);
  close(a.diagonal, 46.8, 0.05);
});

test('angleOfView: Dose nur mit Breite liefert nur den horizontalen Winkel', () => {
  const a = angleOfView(60, 120, null);
  close(a.horizontal, 90, 1e-9);
  assert.equal(a.vertical, null);
  assert.equal(a.diagonal, null);
});

test('FORMATS enthält Kleinbild, 4×5, 8×10 und Dose', () => {
  assert.deepEqual(FORMATS.map((f) => f.id), ['135', '4x5', '8x10', 'can']);
  assert.equal(FORMATS[0].width, 36);
  assert.equal(FORMATS[3].width, null);
});

test('transferExposure: f/8 1/125 ISO 100 → f/250 ISO 100 ≈ 7,8 s', () => {
  const r = transferExposure({ aperture: 8, shutter: 1 / 125, iso: 100 }, 250, 100);
  close(r.seconds, (250 / 8) ** 2 / 125, 1e-9);
  close(r.seconds, 7.8125, 1e-9);
  close(r.apertureStops, 2 * Math.log2(8 / 250), 1e-9); // ≈ −9,93
  close(r.isoStops, 0);
  close(r.totalStops, Math.log2(r.seconds * 125), 1e-9);
});

test('transferExposure: Film mit ISO 400 verkürzt um 2 Stufen', () => {
  const a = transferExposure({ aperture: 8, shutter: 1 / 125, iso: 100 }, 250, 100);
  const b = transferExposure({ aperture: 8, shutter: 1 / 125, iso: 100 }, 250, 400);
  close(b.seconds, a.seconds / 4, 1e-9);
  close(b.isoStops, 2);
});
