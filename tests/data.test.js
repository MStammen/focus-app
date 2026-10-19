// Strukturprüfung der pflegbaren Datendateien (Geräteprofile, Modusrad, Aufgaben, Karten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('data/camera-modes.json: jede Marke beschriftet alle Konzepte und hat eine Langzeit-Anleitung', () => {
  const d = read('data/camera-modes.json');
  const ids = d.concepts.map((c) => c.id);
  assert.deepEqual(ids, ['program', 'aperturePriority', 'shutterPriority', 'manual', 'bulb']);
  assert.ok(d.brands.length >= 8);
  const seen = new Set();
  for (const b of d.brands) {
    assert.ok(b.id && b.name && !seen.has(b.id), `Marke ${b.id}`); seen.add(b.id);
    for (const c of ids) assert.ok(typeof b.modes[c] === 'string' && b.modes[c].length > 0, `${b.id}: ${c} fehlt`);
    assert.ok(b.longExposure && b.longExposure.length > 20, `${b.id}: longExposure`);
    assert.ok(['pasm', 'dials', 'phone', 'pinhole'].includes(b.layout), `${b.id}: layout`);
  }
  for (const b of ['canon', 'nikon', 'sony', 'fujifilm', 'iphone']) assert.ok(seen.has(b), `Marke fehlt: ${b}`);
  assert.equal(d.brands.find((b) => b.id === 'canon').modes.aperturePriority, 'Av');
  assert.equal(d.brands.find((b) => b.id === 'nikon').modes.shutterPriority, 'S');
});

test('data/devices.json: Profile vollständig', () => {
  const d = read('data/devices.json');
  for (const dev of d.devices) {
    assert.ok(dev.id && dev.name && dev.sensorWidth > 0 && dev.focal > 0 && dev.aperture > 0, dev.id);
    assert.equal(typeof dev.apertureFixed, 'boolean');
  }
  assert.ok(d.devices.some((x) => x.id === 'phone') && d.devices.some((x) => x.id === 'pinhole'));
});

test('content/cards/index.json: Dateien existieren, Karten unter 200 Wörtern', () => {
  const idx = read('content/cards/index.json');
  assert.ok(idx.cards.length >= 9);
  for (const c of idx.cards) {
    const path = new URL(`../content/cards/${c.file}`, import.meta.url);
    assert.ok(existsSync(path), `${c.file} fehlt`);
    const words = readFileSync(path, 'utf8').split(/\s+/).filter(Boolean).length;
    assert.ok(words <= 200, `${c.file}: ${words} Wörter`);
    assert.ok(c.graphic && c.id, c.file);
  }
});

test('content/tasks.json: Antworten prüfbar', () => {
  const d = read('content/tasks.json');
  assert.ok(d.tasks.length >= 5);
  for (const task of d.tasks) {
    assert.ok(task.id && task.title && task.question && task.solution, task.id);
    if (task.type === 'number') assert.ok(Number.isFinite(task.answer) && task.tolerance >= 0, task.id);
    else { assert.equal(task.type, 'choice'); assert.ok(Array.isArray(task.choices) && task.choices[task.answer], task.id); }
  }
});

test('sw.js: alle Inhalte und Daten sind im Precache', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const idx = read('content/cards/index.json');
  for (const c of idx.cards) assert.ok(sw.includes(`./content/cards/${c.file}`), `Precache: ${c.file}`);
  for (const f of ['./data/films.json', './data/devices.json', './data/camera-modes.json', './content/tasks.json']) assert.ok(sw.includes(f), `Precache: ${f}`);
});
