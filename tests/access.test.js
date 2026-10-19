// Tests für die Zugangssperre: Hash-Funktion (auch ohne crypto.subtle) und Code-Liste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sha256Fallback, codeHash } from '../js/lib/access.js';

const node = (s) => createHash('sha256').update(s).digest('hex');

test('sha256Fallback rechnet wie Node', () => {
  for (const s of ['', 'abc', 'focus:2211', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'ÄÖÜ ß €', 'a'.repeat(1000)]) {
    assert.equal(sha256Fallback(new TextEncoder().encode(s)), node(s), `Text der Länge ${s.length}`);
  }
});

test('codeHash: getrimmt, Großschreibung egal', async () => {
  assert.equal(await codeHash(' 2211 '), node('focus:2211'));
  assert.equal(await codeHash('focus-nov'), await codeHash('FOCUS-NOV'));
});

test('data/access.json: gültige Einträge, Code „alle“ aktiv', async () => {
  const d = JSON.parse(readFileSync(new URL('../data/access.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(d.codes) && d.codes.length >= 1);
  for (const c of d.codes) assert.match(c.sha256, /^[0-9a-f]{64}$/, c.label);
  assert.ok(d.codes.some((c) => c.label === 'alle' && c.active !== false));
  // Kein Code im Klartext in der Datei
  assert.ok(!JSON.stringify(d).includes('2211'));
});
