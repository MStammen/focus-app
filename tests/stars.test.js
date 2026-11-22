// Tests für den Sterne-Rechner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rule500, pixelPitch, ruleNpf, starIso, trailPlan, moonPhase, nextMoons } from '../js/core/stars.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} statt ${b}`);

test('500er-Regel: 14 mm Vollformat ≈ 35,7 s, an APS-C (1,5) ≈ 23,8 s', () => {
  near(rule500(14, 1), 35.7, 0.1);
  near(rule500(14, 1.5), 23.8, 0.1);
});

test('Pixelabstand: 24 MP Vollformat ≈ 6 µm, 61 MP ≈ 3,8 µm', () => {
  near(pixelPitch(24, 1), 6.0, 0.05);
  near(pixelPitch(61, 1), 3.76, 0.05);
});

test('NPF: strenger als 500er-Regel (14 mm, f/2,8, 24 MP ≈ 20 s)', () => {
  const t = ruleNpf(14, 2.8, pixelPitch(24, 1));
  near(t, 19.9, 0.2);
  assert.ok(t < rule500(14, 1));
});

test('Startwerte: f/2,8 und 20 s ergeben ISO 3200; halbe Zeit → doppelte ISO', () => {
  near(starIso(2.8, 20), 3200, 0.5);
  near(starIso(2.8, 10), 6400, 1);
});

test('Sternspuren: 30 s + 1 s Pause, 60 min → 117 Bilder, Bogen ≈ 15°', () => {
  const p = trailPlan({ frameSeconds: 30, gapSeconds: 1, totalMinutes: 60 });
  assert.equal(p.frames, 117);
  near(p.arcDegrees, 15.04, 0.01);
  assert.equal(trailPlan({ frameSeconds: 0, totalMinutes: 60 }), null);
});

test('Mond: bekannte Termine 2024 auf etwa einen Tag genau', () => {
  // Neumond 11.01.2024 11:57 UTC, Vollmond 25.01.2024 17:54 UTC
  const atNew = moonPhase(new Date(Date.UTC(2024, 0, 11, 12)));
  assert.ok(atNew.illumination < 0.03, `Neumond: ${atNew.illumination}`);
  const atFull = moonPhase(new Date(Date.UTC(2024, 0, 25, 18)));
  assert.ok(atFull.illumination > 0.97, `Vollmond: ${atFull.illumination}`);
  const { newMoons, fullMoons } = nextMoons(new Date(Date.UTC(2024, 0, 1)), 1);
  near((newMoons[0] - Date.UTC(2024, 0, 11, 11, 57)) / 86400000, 0, 1);
  near((fullMoons[0] - Date.UTC(2024, 0, 25, 17, 54)) / 86400000, 0, 1);
});
