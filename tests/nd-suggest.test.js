import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestNdFilters, ND_FILTERS } from '../js/core/exposure.js';

const own = ND_FILTERS.filter((f) => ['ND8', 'ND64', 'ND1000'].includes(f.name));

test('1/60 s → 15 s (knapp 10 Stufen): ND1000 zuerst', () => {
  const needed = Math.log2(15 / (1 / 60));
  const [best] = suggestNdFilters(needed, own);
  assert.deepEqual(best.filters.map((f) => f.name), ['ND1000']);
  assert.ok(Math.abs(best.error) < 0.25);
});

test('13 Stufen: ND1000 + ND8', () => {
  const [best] = suggestNdFilters(13, own);
  assert.deepEqual(best.filters.map((f) => f.name).sort(), ['ND1000', 'ND8']);
});

test('kaum Stufen nötig: kein Filter', () => {
  const [best] = suggestNdFilters(0.2, own);
  assert.equal(best.filters.length, 0);
});

test('jeder Filter höchstens einmal, höchstens drei', () => {
  for (const s of suggestNdFilters(40, own)) {
    assert.ok(s.filters.length <= 3);
    assert.equal(new Set(s.filters.map((f) => f.name)).size, s.filters.length);
  }
});
