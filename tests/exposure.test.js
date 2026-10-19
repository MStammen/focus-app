// Tests für js/core/exposure.js. Laufen mit Node, ohne Framework:
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ev, shutterFor, apertureFor, isoFor, stopsBetween, nearestStandard,
  standardSeries, ndStops, shutterWithNd, formatShutter, formatAperture, formatIso, formatStops,
  APERTURES_THIRD, SHUTTERS_THIRD, ISOS_THIRD, APERTURES_HALF, SHUTTERS_HALF, ISOS_HALF,
} from '../js/core/exposure.js';

const close = (actual, expected, tol = 1e-9, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, msg || `${actual} ≠ ${expected} (±${tol})`);

// ---------- ev ----------

test('ev: f/1, 1 s, ISO 100 ist EV 0', () => {
  close(ev(1, 1, 100), 0);
});

test('ev: Sonne-16-Regel liegt nahe EV 15 (f/16, 1/125, ISO 100)', () => {
  close(ev(16, 1 / 125, 100), Math.log2(256 * 125), 1e-9);
  assert.ok(Math.abs(ev(16, 1 / 125, 100) - 15) < 0.05);
});

test('ev: eine Blendenstufe ändert EV um 1', () => {
  close(ev(8, 1 / 125) - ev(5.6, 1 / 125), 2 * Math.log2(8 / 5.6), 1e-9);
  close(ev(4, 1) - ev(2, 1), 2);
});

test('ev: Verdopplung der Zeit senkt EV um 1', () => {
  close(ev(8, 1 / 60) - ev(8, 1 / 120), -1);
});

test('ev: Verdopplung der ISO senkt den ISO-100-bezogenen EV um 1', () => {
  close(ev(8, 1 / 125, 200), ev(8, 1 / 125, 100) - 1);
  close(ev(8, 1 / 125, 25), ev(8, 1 / 125, 100) + 2);
});

test('ev: ungültige Eingaben werfen', () => {
  assert.throws(() => ev(0, 1, 100), RangeError);
  assert.throws(() => ev(8, -1, 100), RangeError);
  assert.throws(() => ev(8, 1, NaN), RangeError);
  assert.throws(() => ev('8', 1, 100), RangeError);
});

// ---------- Umkehrfunktionen ----------

test('shutterFor/apertureFor/isoFor sind Umkehrungen von ev', () => {
  const cases = [
    [8, 1 / 125, 100], [2.8, 1 / 60, 400], [16, 30, 50], [250, 4, 100], [1.8, 1 / 4000, 3200],
  ];
  for (const [n, t, iso] of cases) {
    const e = ev(n, t, iso);
    close(shutterFor(e, n, iso), t, 1e-12 * Math.max(1, t));
    close(apertureFor(e, t, iso), n, 1e-9);
    close(isoFor(e, n, t), iso, 1e-6);
  }
});

test('shutterFor: Blende schließen verlängert die Zeit entsprechend', () => {
  const e = ev(8, 1 / 125, 100);
  close(shutterFor(e, 16, 100), 4 / 125, 1e-12);   // 2 Stufen → 4× Zeit
  close(shutterFor(e, 8, 400), 1 / 500, 1e-12);    // ISO ×4 → Zeit /4
});

test('isoFor: Lochkamera f/250 bei 1/125-Messung an f/8 ISO 100', () => {
  // Gleiche Belichtung bei f/250 und 1/125 bräuchte ISO 100 · (250/8)²
  const e = ev(8, 1 / 125, 100);
  close(isoFor(e, 250, 1 / 125), 100 * (250 / 8) ** 2, 1e-6);
});

// ---------- stopsBetween ----------

test('stopsBetween: Zeit', () => {
  close(stopsBetween(1 / 125, 1 / 250), -1);
  close(stopsBetween(1 / 125, 1 / 60, 'shutter'), Math.log2(125 / 60));
  close(stopsBetween(1, 8, 'shutter'), 3);
});

test('stopsBetween: ISO', () => {
  close(stopsBetween(100, 400, 'iso'), 2);
  close(stopsBetween(800, 100, 'iso'), -3);
});

test('stopsBetween: Blende (kleinere Zahl = mehr Licht = positiv)', () => {
  close(stopsBetween(8, 4, 'aperture'), 2);
  close(stopsBetween(2.8, 4, 'aperture'), 2 * Math.log2(2.8 / 4));
  close(stopsBetween(1.8, 8, 'aperture'), 2 * Math.log2(1.8 / 8)); // Handy → Vollformat: ≈ −4,3
});

test('stopsBetween: unbekannte Reihe wirft', () => {
  assert.throws(() => stopsBetween(1, 2, 'foo'), RangeError);
});

// ---------- Standardreihen ----------

test('Reihen sind streng steigend', () => {
  for (const s of [APERTURES_THIRD, SHUTTERS_THIRD, ISOS_THIRD, APERTURES_HALF, SHUTTERS_HALF, ISOS_HALF]) {
    for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1], `Index ${i}: ${s[i - 1]} → ${s[i]}`);
  }
});

test('Drittelreihen: Nachbarn liegen etwa 1/3 Stufe auseinander', () => {
  const check = (series, perStop, label) => {
    for (let i = 1; i < series.length - 1; i++) {
      const d = perStop * Math.log2(series[i] / series[i - 1]);
      assert.ok(d > 0.2 && d < 0.5, `${label} Index ${i}: ${series[i - 1]} → ${series[i]} = ${d.toFixed(3)} Stufen`);
    }
  };
  check(APERTURES_THIRD, 2, 'Blende');
  check(SHUTTERS_THIRD, 1, 'Zeit');
  check(ISOS_THIRD, 1, 'ISO');
});

test('Bereiche: Blende 1…256, Zeit 1/8000…8 h, ISO 25…102400', () => {
  assert.equal(APERTURES_THIRD[0], 1);
  assert.equal(APERTURES_THIRD.at(-1), 256);
  close(SHUTTERS_THIRD[0], 1 / 8000);
  assert.equal(SHUTTERS_THIRD.at(-1), 8 * 3600);
  assert.equal(ISOS_THIRD[0], 25);
  assert.equal(ISOS_THIRD.at(-1), 102400);
});

test('Ganze Stufen werden aus der Drittelreihe abgeleitet', () => {
  assert.deepEqual(standardSeries('aperture', 1), [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32, 45, 64, 90, 128, 181, 256]);
  assert.deepEqual(standardSeries('iso', 1), [25, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600, 51200, 102400]);
  const sh = standardSeries('shutter', 1);
  close(sh[0], 1 / 8000);
  close(sh[6], 1 / 125);
  assert.ok(sh.includes(1) && sh.includes(2) && sh.includes(4) && sh.includes(8) && sh.includes(15) && sh.includes(30) && sh.includes(60) && sh.includes(120));
});

test('standardSeries: Halbstufen und ungültiges Raster', () => {
  assert.equal(standardSeries('aperture', 1 / 2), APERTURES_HALF);
  assert.equal(standardSeries('shutter', 1 / 3), SHUTTERS_THIRD);
  assert.throws(() => standardSeries('aperture', 0.25), RangeError);
  assert.throws(() => standardSeries('zoom'), RangeError);
});

// ---------- nearestStandard ----------

test('nearestStandard: Blende', () => {
  assert.equal(nearestStandard(7.5, 'aperture', 1 / 3), 7.1);
  assert.equal(nearestStandard(7.5, 'aperture', 1), 8);
  assert.equal(nearestStandard(7.5, 'aperture', 1 / 2), 8);
  assert.equal(nearestStandard(1.75, 'aperture', 1 / 3), 1.8);
  assert.equal(nearestStandard(1.75, 'aperture', 1 / 2), 1.7);
  assert.equal(nearestStandard(256, 'aperture'), 256);
});

test('nearestStandard: über f/256 nicht runden, exakt zurückgeben', () => {
  assert.equal(nearestStandard(300, 'aperture'), 300);
  assert.equal(nearestStandard(312.5, 'aperture', 1), 312.5);
});

test('nearestStandard: Zeit', () => {
  close(nearestStandard(1 / 90, 'shutter', 1 / 3), 1 / 100);
  close(nearestStandard(1 / 90, 'shutter', 1 / 2), 1 / 90);
  close(nearestStandard(1 / 90, 'shutter', 1), 1 / 125);
  assert.equal(nearestStandard(135, 'shutter', 1 / 3), 120);
  assert.equal(nearestStandard(0.45, 'shutter', 1 / 3), 0.5);
  close(nearestStandard(1 / 8000, 'shutter'), 1 / 8000);
});

test('nearestStandard: außerhalb von 1/8000 … 8 h exakt', () => {
  assert.equal(nearestStandard(1 / 16000, 'shutter'), 1 / 16000);
  assert.equal(nearestStandard(40000, 'shutter'), 40000);
});

test('nearestStandard: ISO', () => {
  assert.equal(nearestStandard(12000, 'iso', 1), 12800);
  assert.equal(nearestStandard(12000, 'iso', 1 / 3), 12800);
  assert.equal(nearestStandard(140, 'iso', 1 / 3), 125);
  assert.equal(nearestStandard(140, 'iso', 1 / 2), 140);
  assert.equal(nearestStandard(10, 'iso'), 10); // unter ISO 25
});

test('nearestStandard: rundet im logarithmischen Abstand (Mitte zwischen 8 und 11 → 9 bei ⅓)', () => {
  const mid = Math.sqrt(8 * 11);
  assert.equal(nearestStandard(mid, 'aperture', 1 / 3), 9);
});

// ---------- ND ----------

test('ndStops: stops, factor, density', () => {
  assert.equal(ndStops({ stops: 10 }), 10);
  assert.equal(ndStops({ factor: 8 }), 3);
  close(ndStops({ factor: 1000 }), 9.9658, 1e-4);
  close(ndStops({ density: 3.0 }), 9.9658, 1e-4);
  close(ndStops({ density: 0.3 }), 0.9966, 1e-4);
  assert.equal(ndStops({ factor: 1 }), 0);
});

test('ndStops: ND1000 ist nicht exakt 10 Stufen', () => {
  const s = ndStops({ factor: 1000 });
  assert.ok(s < 10 && s > 9.9);
});

test('ndStops: ungültige Eingaben werfen', () => {
  assert.throws(() => ndStops(null), TypeError);
  assert.throws(() => ndStops({}), TypeError);
  assert.throws(() => ndStops({ factor: 0.5 }), RangeError);
  assert.throws(() => ndStops({ stops: -1 }), RangeError);
  assert.throws(() => ndStops({ density: 'x' }), RangeError);
});

test('shutterWithNd: Aufgabe aus dem Kurs: ND1000 bei 1/125 s → ca. 8 s', () => {
  const t = shutterWithNd(1 / 125, { factor: 1000 });
  close(t, 8, 1e-12);
  // Mit nominell 10 Stufen: 8,19 s
  close(shutterWithNd(1 / 125, { stops: 10 }), 1024 / 125, 1e-12);
});

test('shutterWithNd: Filter stapeln sich additiv', () => {
  close(shutterWithNd(1, [{ factor: 8 }, { stops: 2 }, { density: 0.3 }]), 2 ** (3 + 2 + 0.3 * Math.log2(10)), 1e-9);
  assert.equal(shutterWithNd(2, []), 2);
});

// ---------- Formatierung ----------

test('formatShutter: Brüche unter 0,3 s', () => {
  assert.equal(formatShutter(1 / 125), '1/125');
  assert.equal(formatShutter(1 / 8000), '1/8000');
  assert.equal(formatShutter(0.004), '1/250');
  assert.equal(formatShutter(1 / 4), '1/4');
  assert.equal(formatShutter(0.0137), '1/73');
  assert.equal(formatShutter(1 / 3.5), '1/3.5');
});

test('formatShutter: Sekunden mit Zollzeichen', () => {
  assert.equal(formatShutter(0.5), '0.5"');
  assert.equal(formatShutter(0.3), '0.3"');
  assert.equal(formatShutter(1), '1"');
  assert.equal(formatShutter(2.5), '2.5"');
  assert.equal(formatShutter(8.19), '8.2"');
  assert.equal(formatShutter(30), '30"');
  assert.equal(formatShutter(45.4), '45"');
});

test('formatShutter: Minuten und Stunden', () => {
  assert.equal(formatShutter(60), '1 min');
  assert.equal(formatShutter(135), '2 min 15 s');
  assert.equal(formatShutter(3600), '1 h');
  assert.equal(formatShutter(5400), '1 h 30 min');
  assert.equal(formatShutter(3725), '1 h 2 min 5 s');
  assert.equal(formatShutter(28800), '8 h');
});

test('formatAperture / formatIso', () => {
  assert.equal(formatAperture(5.6), 'f/5.6');
  assert.equal(formatAperture(8), 'f/8');
  assert.equal(formatAperture(11), 'f/11');
  assert.equal(formatAperture(1.8), 'f/1.8');
  assert.equal(formatAperture(312.4), 'f/312');
  assert.equal(formatIso(100), 'ISO 100');
  assert.equal(formatIso(12800), 'ISO 12800');
});

test('formatStops', () => {
  assert.equal(formatStops(1), '+1');
  assert.equal(formatStops(-2), '−2');
  assert.equal(formatStops(1 / 3), '+⅓');
  assert.equal(formatStops(-2 - 2 / 3), '−2⅔');
  assert.equal(formatStops(0), '±0');
  assert.equal(formatStops(0.45), '+0.5');
  assert.equal(formatStops(-4.3), '−4.3');
  assert.throws(() => formatStops(NaN), RangeError);
});
