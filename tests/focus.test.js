// Tests für js/core/focus.js – node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_FORMATS, imageDistance, objectDistance, circleOfConfusion, lensSpot, pinholeSpot,
  magnification, effectiveAperture, depthOfField, screenBetween,
} from '../js/core/focus.js';

const close = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≠ ${b} (±${tol})`);

test('Linsengleichung: doppelte Brennweite vorn → doppelte hinten, 1:1', () => {
  close(imageDistance(300, 600), 600);
  close(magnification({ pinhole: false, f: 300, g: 600 }), 1);
});

test('Motiv in der Brennweite oder davor: kein reelles Bild', () => {
  assert.equal(imageDistance(300, 300), Infinity);
  assert.equal(imageDistance(300, 240), Infinity);
  assert.equal(lensSpot(300, 5.6, 240, 900), Infinity);
});

test('Bildweite und Gegenstandsweite sind Umkehrungen', () => {
  close(objectDistance(50, imageDistance(50, 2000)), 2000, 1e-6);
});

test('Ganz weit weg: Bild fast in der Brennweite', () => {
  close(imageDistance(300, 30000), 303.03, 0.01);
});

test('Zerstreuungskreis Kleinbild ≈ 0,029 mm', () => {
  close(circleOfConfusion(FOCUS_FORMATS.kb), 0.0288, 0.0001);
});

test('Scharf gestellt: Fleck 0', () => {
  close(lensSpot(50, 2, 2000, imageDistance(50, 2000)), 0, 1e-12);
});

test('Lochkamera: 2 mm Loch, Motiv 2 m, Wand 2 m → Fleck 4 mm, Maßstab 1, wirksam f/1000', () => {
  close(pinholeSpot(2, 2000, 2000), 4);
  close(magnification({ pinhole: true, g: 2000, s: 2000 }), 1);
  close(effectiveAperture({ pinhole: true, d: 2, s: 2000 }), 1000);
});

test('Wirksame Blende der Linse wächst mit dem Auszug', () => {
  close(effectiveAperture({ pinhole: false, f: 300, N: 5.6, s: 600 }), 11.2);
});

test('Schärfentiefe 50 mm, f/2, 2 m, Kleinbild: um 18 cm, Figur liegt drin', () => {
  const s = imageDistance(50, 2000);
  const r = depthOfField(50, 2, s, circleOfConfusion(FOCUS_FORMATS.kb));
  assert.ok(r.near < 2000 && r.far > 2000);
  const total = r.far - r.near;
  assert.ok(total > 150 && total < 220, `Schärfentiefe ${total}`);
  // nach hinten mehr als nach vorn
  assert.ok(r.far - 2000 > 2000 - r.near);
});

test('Schärfentiefe: Abblenden vergrößert sie, weit genug abgeblendet bis ∞', () => {
  const s = imageDistance(50, 2000), c = circleOfConfusion(FOCUS_FORMATS.kb);
  const a = depthOfField(50, 2, s, c), b = depthOfField(50, 16, s, c);
  assert.ok(b.far - b.near > a.far - a.near);
  assert.equal(depthOfField(50, 64, imageDistance(50, 5000), c).far, Infinity);
});

test('Schärfentiefe: Mattscheibe in der Brennweite oder davor → null', () => {
  assert.equal(depthOfField(50, 2, 50, 0.03), null);
});

test('Dazwischen scharfstellen: Fleck der beiden Motive gleich groß', () => {
  const s = screenBetween(50, 2000, 6000);
  close(lensSpot(50, 16, 2000, s), lensSpot(50, 16, 6000, s), 1e-9);
});
