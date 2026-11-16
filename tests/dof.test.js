// Tests für den Schärfentiefe-Rechner (Vergleichswerte: Formeln von Hand nachgerechnet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dof, hyperfocal, circleOfConfusion } from '../js/core/dof.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} statt ${b}`);

test('hyperfokale Distanz: 50 mm, f/8, Vollformat ≈ 10,47 m', () => {
  near(hyperfocal(50, 8, 0.03) / 1000, 10.467);
});

test('50 mm, f/8, 3 m, Vollformat: scharf von ca. 2,34 m bis 4,19 m', () => {
  const r = dof({ focal: 50, aperture: 8, distance: 3, crop: 1 });
  near(r.near, 2.338);
  near(r.far, 4.185);
  near(r.total, 1.847);
});

test('auf die hyperfokale Distanz scharfgestellt: Fernpunkt unendlich, Nahpunkt etwa H/2', () => {
  const H = hyperfocal(24, 11, 0.03) / 1000;
  const r = dof({ focal: 24, aperture: 11, distance: H, crop: 1 });
  assert.equal(r.far, Infinity);
  assert.equal(r.total, Infinity);
  near(r.near, H / 2, 0.05);
});

test('kleinerer Sensor: kleinerer Zerstreuungskreis, weniger Schärfentiefe bei gleichen Werten', () => {
  near(circleOfConfusion(1.5), 0.02, 1e-9);
  const ff = dof({ focal: 50, aperture: 4, distance: 5, crop: 1 });
  const aps = dof({ focal: 50, aperture: 4, distance: 5, crop: 1.5 });
  assert.ok(aps.total < ff.total);
});

test('offene Blende: weniger Schärfentiefe als geschlossene', () => {
  const open = dof({ focal: 85, aperture: 1.8, distance: 2 });
  const closed = dof({ focal: 85, aperture: 11, distance: 2 });
  assert.ok(open.total < closed.total);
  assert.ok(open.total < 0.1); // Porträt mit 85 mm f/1,8 auf 2 m: nur wenige Zentimeter
});

test('ungültige Werte → null', () => {
  assert.equal(dof({ focal: 0, aperture: 8, distance: 3 }), null);
  assert.equal(dof({ focal: 50, aperture: 8, distance: 0.04 }), null);
});
