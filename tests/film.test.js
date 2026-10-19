// Tests für js/core/film.js – node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SUPPORT_TIMES, pointsFromPower, pointsFromTable, availablePoints, correctedTime,
  applyOverrides, validateFilm, exportFilms, importFilms,
} from '../js/core/film.js';

const close = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≠ ${b} (±${tol})`);

test('SUPPORT_TIMES wie in der Spec', () => {
  assert.deepEqual(SUPPORT_TIMES, [1, 2, 4, 8, 15, 30, 60, 120, 240, 480]);
});

test('pointsFromPower: Ilford-Formel Tc = Tm^p', () => {
  const p = pointsFromPower(1.31);
  close(p[1], 1);
  close(p[8], 8 ** 1.31, 1e-3);
  close(p[30], 30 ** 1.31, 1e-2);
  assert.equal(Object.keys(p).length, 10);
});

test('pointsFromTable: Kodak-Tabelle 1/10/100 s wird log-log interpoliert, darüber Lücke', () => {
  const p = pointsFromTable([[1, 2], [10, 50], [100, 1200]]);
  close(p[1], 2);
  close(p[2], Math.exp(Math.log(2) + (Math.log(2) / Math.log(10)) * (Math.log(50) - Math.log(2))), 1e-3);
  close(p[60], Math.exp(Math.log(50) + ((Math.log(60) - Math.log(10)) / Math.log(10)) * (Math.log(1200) - Math.log(50))), 1e-2);
  assert.equal(p[120], null);
  assert.equal(p[480], null);
});

test('availablePoints: lässt null und Unsinn aus, sortiert', () => {
  assert.deepEqual(availablePoints({ 30: 90, 1: 1, 8: null, 4: 'x', 2: 2.5 }), [[1, 1], [2, 2.5], [30, 90]]);
  assert.deepEqual(availablePoints(null), []);
});

test('correctedTime: unter 0,5 s keine Korrektur', () => {
  const p = pointsFromPower(1.31);
  const r = correctedTime(p, 0.25);
  assert.equal(r.status, 'none');
  close(r.seconds, 0.25);
  assert.equal(r.stops, 0);
});

test('correctedTime: exakt auf Stützpunkt', () => {
  const r = correctedTime(pointsFromPower(1.31), 30);
  assert.equal(r.status, 'exact');
  close(r.seconds, 30 ** 1.31, 1e-2); // Kursaufgabe: HP5+ 30 s gemessen → ca. 86 s
  assert.ok(r.seconds > 85 && r.seconds < 87);
});

test('correctedTime: zwischen Stützpunkten log-log', () => {
  const p = { 1: 1, 2: 2.5, 4: 6.5 };
  const r = correctedTime(p, 3);
  assert.equal(r.status, 'interpolated');
  const expected = Math.exp(Math.log(2.5) + ((Math.log(3) - Math.log(2)) / (Math.log(4) - Math.log(2))) * (Math.log(6.5) - Math.log(2.5)));
  close(r.seconds, expected, 1e-9);
  close(r.stops, Math.log2(expected / 3), 1e-9);
});

test('correctedTime: über dem letzten Stützpunkt extrapoliert, bei Lücke markiert', () => {
  const full = pointsFromPower(1.31);
  const r1 = correctedTime(full, 600);
  assert.equal(r1.status, 'extrapolated');
  close(r1.seconds, 600 ** 1.31, 1); // Potenz bleibt bei log-log-Extrapolation exakt erhalten
  const gap = pointsFromTable([[1, 2], [10, 50], [100, 1200]]);
  const r2 = correctedTime(gap, 240);
  assert.equal(r2.status, 'gap');
  assert.ok(r2.seconds > 1200);
});

test('correctedTime: ohne Daten status noData', () => {
  assert.deepEqual(correctedTime({ 120: null, 240: null }, 10), { seconds: null, stops: null, status: 'noData' });
  assert.throws(() => correctedTime({ 1: 1 }, 0), RangeError);
});

test('correctedTime: Acros II – keine Korrektur bis 120 s, dann +½ Stufe', () => {
  const p = { 1: 1, 2: 2, 4: 4, 8: 8, 15: 15, 30: 30, 60: 60, 120: 169.7, 240: 339.4, 480: 678.8 };
  assert.equal(correctedTime(p, 90).status, 'interpolated');
  close(correctedTime(p, 60).stops, 0);
  close(correctedTime(p, 240).stops, 0.5, 1e-3);
});

test('applyOverrides ersetzt und löscht Stützpunkte', () => {
  const film = { name: 'x', points: { 1: 1, 2: 2.5, 4: 6 } };
  const f2 = applyOverrides(film, { 2: 3, 4: null });
  assert.deepEqual(f2.points, { 1: 1, 2: 3 });
  assert.equal(f2.hasOverrides, true);
  assert.equal(applyOverrides(film, null), film);
});

test('validateFilm: findet fehlende und widersprüchliche Angaben', () => {
  assert.deepEqual(validateFilm({ name: 'Test', iso: 100, points: { 1: 1, 10: 20 } }), []);
  assert.ok(validateFilm({ name: '', iso: 100, points: { 1: 1 } }).some((e) => /Name/.test(e)));
  assert.ok(validateFilm({ name: 'x', iso: 0, points: { 1: 1 } }).some((e) => /ISO/.test(e)));
  assert.ok(validateFilm({ name: 'x', iso: 100, points: {} }).some((e) => /Stützpunkt/.test(e)));
  assert.ok(validateFilm({ name: 'x', iso: 100, points: { 1: 1, 10: 5 } }).some((e) => /kürzer/.test(e)));
  assert.ok(validateFilm({ name: 'x', iso: 100, points: { 1: 3, 10: 2.5 } }).some((e) => /sinkt|kürzer/.test(e)));
});

test('exportFilms / importFilms Rundreise', () => {
  const films = [{ id: 'custom-1', name: 'Mein Film', maker: '', iso: 200, type: 'bw', points: { 1: 1.5, 10: 25 }, note: 'Test', custom: true }];
  const json = exportFilms(films, { exportedAt: '2026-10-13T00:00:00Z' });
  const parsed = JSON.parse(json);
  assert.equal(parsed.kind, 'focus-films');
  const back = importFilms(json);
  assert.equal(back.length, 1);
  assert.equal(back[0].name, 'Mein Film');
  assert.deepEqual(back[0].points, { 1: 1.5, 10: 25 });
  assert.equal(back[0].custom, true);
});

test('importFilms: ungültige Einträge werden ausgelassen, Unsinn wirft', () => {
  const back = importFilms([{ name: 'ok', iso: 100, points: { 1: 1 } }, { name: '', iso: 100, points: { 1: 1 } }]);
  assert.equal(back.length, 1);
  assert.ok(back[0].id.startsWith('custom-'));
  assert.throws(() => importFilms({ foo: 1 }), TypeError);
});

test('data/films.json: Schema, Pflichtfelder, Stützpunkte plausibel', () => {
  const data = JSON.parse(readFileSync(new URL('../data/films.json', import.meta.url), 'utf8'));
  assert.equal(data.schema, 1);
  assert.ok(Array.isArray(data.films) && data.films.length >= 15);
  const ids = new Set();
  for (const f of data.films) {
    assert.ok(f.id && !ids.has(f.id), `doppelte id ${f.id}`); ids.add(f.id);
    assert.ok(f.name && f.maker && f.iso > 0, `Pflichtfeld fehlt bei ${f.id}`);
    assert.ok(f.source && f.source.title && f.source.date, `Quelle fehlt bei ${f.id}`);
    assert.ok(['bw', 'color'].includes(f.type));
    assert.ok(f.points && typeof f.points === 'object');
    for (const t of SUPPORT_TIMES) assert.ok(t in f.points, `${f.id}: Stützpunkt ${t} fehlt (auch null erlaubt)`);
    const rows = availablePoints(f.points);
    for (const [t, c] of rows) assert.ok(c >= t * 0.999, `${f.id}: ${t} s → ${c} s kürzer als gemessen`);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i][1] >= rows[i - 1][1], `${f.id}: Stützpunkte fallen`);
  }
  const required = ['ilford-hp5-plus', 'ilford-fp4-plus', 'ilford-delta-100', 'ilford-delta-400', 'ilford-pan-f-plus',
    'kodak-tri-x-400', 'kodak-t-max-100', 'kodak-t-max-400', 'kodak-portra-160', 'kodak-portra-400', 'kodak-ektar-100',
    'fomapan-100', 'fomapan-200', 'fomapan-400', 'fuji-acros-ii'];
  for (const id of required) assert.ok(ids.has(id), `Film fehlt: ${id}`);
});
