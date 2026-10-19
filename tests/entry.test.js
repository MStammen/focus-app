import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanEntryNumbers, checkEntryInput } from '../js/core/entry.js';

test('cleanEntryNumbers: negative oder unsinnige Werte werden null', () => {
  const e = cleanEntryNumbers({ id: 'a', aperture: -5, shutter: 0, iso: 'abc', frames: 12, nd: -1, note: 'x' });
  assert.deepEqual([e.aperture, e.shutter, e.iso, e.frames, e.nd, e.note], [null, null, null, 12, null, 'x']);
  assert.equal(cleanEntryNumbers({ aperture: 8 }).aperture, 8);
});

test('checkEntryInput: negative Blende abgelehnt, leerer Eintrag abgelehnt', () => {
  assert.deepEqual(checkEntryInput({ aperture: -5 }), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkEntryInput({ aperture: null, shutter: null, iso: null }), { ok: false, reason: 'empty' });
  assert.deepEqual(checkEntryInput({ aperture: 8, shutter: 30 }), { ok: true });
  assert.deepEqual(checkEntryInput({ note: 'Testbild' }), { ok: true });
  assert.deepEqual(checkEntryInput({ hasImage: true }), { ok: true });
});
