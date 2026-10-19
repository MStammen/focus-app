// Tests für Kameragrenzen, Übungsprüfung und Kameradaten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLimits, cameraLimits } from '../js/lib/camera-profile.js';
import { ev, shutterFor } from '../js/core/exposure.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const t = (k) => k; // Übersetzung im Test unwichtig
const ctx = (own = {}) => ({ getSetting: (k, f) => (k === 'camLimits' ? own : f) });

test('checkLimits: Zeit über der Grenze → Bulb-Hinweis, ohne Bulb → anderer Hinweis', () => {
  const lim = { maxShutter: 30, isoMin: 100, isoMax: 25600, apMin: 3.5, apMax: 22, bulb: 'B' };
  assert.deepEqual(checkLimits(lim, { shutter: 64 }).map((x) => x.key), ['shutterBulb']);
  assert.deepEqual(checkLimits({ ...lim, bulb: null }, { shutter: 64 }).map((x) => x.key), ['shutterNoBulb']);
  assert.deepEqual(checkLimits(lim, { shutter: 30 }), []);
});

test('checkLimits: Blende und ISO außerhalb', () => {
  const lim = { maxShutter: 30, isoMin: 100, isoMax: 6400, apMin: 3.5, apMax: 22, bulb: 'B' };
  assert.deepEqual(checkLimits(lim, { aperture: 1.8, iso: 12800 }).map((x) => x.key), ['apertureOpen', 'isoHigh']);
  assert.deepEqual(checkLimits(lim, { aperture: 32, iso: 50 }).map((x) => x.key), ['apertureClosed', 'isoLow']);
  assert.deepEqual(checkLimits(lim, { aperture: 3.5, iso: 100 }), []);
});

test('cameraLimits: Markenwerte, eigene Werte überschreiben, Handy hat feste Blende', () => {
  const modes = read('data/camera-modes.json');
  const canon = modes.brands.find((b) => b.id === 'canon');
  assert.equal(cameraLimits(ctx(), modes, canon).maxShutter, 30);
  assert.equal(cameraLimits(ctx(), modes, canon).apMin, modes.lensDefault.apMin);
  const own = cameraLimits(ctx({ maxShutter: 900, apMin: 1.8 }), modes, canon);
  assert.equal(own.maxShutter, 900); assert.equal(own.apMin, 1.8); assert.equal(own.custom, true);
  const phone = cameraLimits(ctx({ apMin: 4 }), modes, modes.brands.find((b) => b.id === 'iphone'));
  assert.equal(phone.apMin, 1.8); assert.equal(phone.apMax, 1.8);
});

test('camera-modes.json: Radbelegung und Grenzen vollständig', () => {
  const d = read('data/camera-modes.json');
  for (const b of d.brands) {
    assert.ok(b.limits && b.limits.maxShutter > 0 && b.limits.isoMax > b.limits.isoMin, `${b.id}: limits`);
    if (b.layout !== 'pasm') continue;
    assert.ok(b.dials?.names?.front && b.dials?.names?.rear, `${b.id}: Radnamen`);
    for (const m of ['aperturePriority', 'shutterPriority', 'manual']) assert.ok(b.dials[m], `${b.id}: ${m}`);
    assert.ok(['hoch', 'mittel', 'niedrig'].includes(b.dials.confidence), `${b.id}: confidence`);
    assert.equal(Object.keys(b.dials.manual).sort().join(), 'aperture,shutter', `${b.id}: M braucht beide Räder`);
  }
  assert.equal(d.brands.find((b) => b.id === 'canon').dials.manual.shutter, 'front');
  assert.equal(d.brands.find((b) => b.id === 'nikon').dials.manual.shutter, 'rear');
});

test('camera-modes.json: Gehäuse je Marke für „Wo finde ich was?“', () => {
  const d = read('data/camera-modes.json');
  const de = read('i18n/de.json');
  for (const b of d.brands) {
    if (b.layout !== 'pasm' && b.layout !== 'dials') continue;
    const body = b.body;
    assert.ok(body && body.ref, `${b.id}: body.ref (Vorbild)`);
    assert.ok(['hoch', 'mittel', 'niedrig'].includes(body.confidence), `${b.id}: body.confidence`);
    assert.ok([null, 'grip', 'release', 'collar'].includes(body.front ?? null), `${b.id}: front`);
    assert.ok(['thumb', 'thumbTop', 'ring'].includes(body.rear), `${b.id}: rear`);
    if (b.layout === 'pasm') assert.ok(['left', 'right'].includes(body.modeDial), `${b.id}: modeDial`);
    for (const k of [...(body.topButtons || []), ...(body.rearButtons || []), ...(body.leftButtons || [])]) {
      assert.ok(de.camera.buttons[k], `${b.id}: Erklärtext für Taste ${k}`);
    }
    if (body.front) assert.ok(de.camera.partText[`frontDial_${body.front}`], `${b.id}: Text vorderes Rad`);
    assert.ok(de.camera.partText[`rearDial_${body.rear}`], `${b.id}: Text hinteres Rad`);
  }
});

test('camera-modes.json: Modelle mit Quelle, Gehäuse und Radbelegung', async () => {
  const { withModel } = await import('../js/lib/camera-profile.js');
  const d = read('data/camera-modes.json');
  const de = read('i18n/de.json');
  let n = 0;
  for (const b of d.brands) {
    const ids = new Set();
    for (const m of b.models || []) {
      n++;
      assert.ok(m.id && !ids.has(m.id), `${b.id}/${m.id}: eindeutige id`); ids.add(m.id);
      assert.ok(m.name && m.source, `${m.id}: Name und Quelle`);
      const body = m.body;
      assert.ok(['left', 'right', 'button'].includes(body.modeDial), `${m.id}: modeDial`);
      assert.ok(['center', 'left', 'none'].includes(body.evf), `${m.id}: evf`);
      assert.ok([null, 'grip', 'release', 'collar'].includes(body.front ?? null), `${m.id}: front`);
      assert.ok([null, 'thumb', 'thumbTop', 'ring'].includes(body.rear ?? null), `${m.id}: rear`);
      assert.ok(['hoch', 'mittel', 'niedrig'].includes(body.confidence) && ['hoch', 'mittel', 'niedrig'].includes(m.dials.confidence), `${m.id}: confidence`);
      for (const k of [...(body.topButtons || []), ...(body.rearButtons || []), ...(body.leftTopButtons || [])]) assert.ok(de.camera.buttons[k], `${m.id}: Erklärtext für Taste ${k}`);
      // M braucht Zeit und Blende, jedes genannte Rad muss es am Gehäuse geben
      assert.equal(Object.keys(m.dials.manual).sort().join(), 'aperture,shutter', `${m.id}: M`);
      const exists = { front: !!body.front, rear: !!body.rear, wheel: !!body.ring, shutterDial: !!body.shutterDial };
      for (const mode of ['aperturePriority', 'shutterPriority', 'manual', 'bulb']) {
        for (const v of Object.values(m.dials[mode] || {})) {
          const [dial, btn] = String(v).split('+');
          assert.ok(exists[dial], `${m.id}: Rad ${dial} in ${mode} fehlt am Gehäuse`);
          assert.ok(m.dials.names[dial], `${m.id}: Name für ${dial}`);
          if (btn) assert.ok(de.camera.buttons[btn] || body.rearButtons.includes(btn) || body.topButtons.includes(btn), `${m.id}: Taste ${btn}`);
        }
      }
      const merged = withModel(b, m.id);
      assert.equal(merged.model.id, m.id);
      assert.ok(merged.limits.maxShutter > 0);
    }
  }
  assert.ok(n >= 25, `mindestens 25 Modelle, sind ${n}`);
  // Korrektur aus den Anleitungen: Canon 2000D Modusrad rechts, OM-1 vorderes Rad am Griff
  const canon = d.brands.find((b) => b.id === 'canon');
  assert.equal(canon.models.find((m) => m.id === '2000d').body.modeDial, 'right');
  assert.equal(d.brands.find((b) => b.id === 'olympus').models.find((m) => m.id === 'om1').body.front, 'grip');
});

test('camera-modes.json: Funktionen (AF, Selbstauslöser, Erschütterung) mit Quelle und gültigem Teil', () => {
  const d = read('data/camera-modes.json');
  for (const b of d.brands) for (const m of b.models || []) {
    const f = m.functions;
    assert.ok(f?.af?.where && f?.timer?.where, `${m.id}: AF und Selbstauslöser`);
    for (const [k, v] of Object.entries(f)) {
      assert.ok(v.where && v.source, `${m.id}/${k}: Text und Quelle`);
      assert.ok(['hoch', 'mittel', 'niedrig'].includes(v.confidence), `${m.id}/${k}: confidence`);
      if (k === 'shake') assert.ok(['mirror', 'efc'].includes(v.type), `${m.id}: shake.type`);
      if (!v.part) continue;
      const body = m.body;
      const [kind, key] = v.part.split(':');
      if (kind === 'button') assert.ok([...(body.topButtons || []), ...(body.rearButtons || []), ...(body.leftTopButtons || [])].includes(key), `${m.id}/${k}: Taste ${key} am Gehäuse`);
      else if (kind === 'pad') assert.ok(body.pad && body.rear !== 'ring' && !body.ring, `${m.id}/${k}: Steuerkreuz sichtbar`);
      else if (kind === 'controlWheel') assert.ok(body.ring, `${m.id}/${k}: Drehring`);
      else if (kind === 'releaseDial') assert.ok(body.releaseDial, `${m.id}/${k}: Aufnahmebetriebsart-Rad`);
      else if (kind === 'rearDial') assert.ok(body.rear && m.dials.names.rear, `${m.id}/${k}: hinteres Rad`);
      else assert.ok(['modeDial', 'lens'].includes(kind), `${m.id}/${k}: Teil ${v.part}`); // lens: angedeutetes Objektiv, an jeder Kamera mit Deckel
    }
  }
});

test('jedes Modell hat ein Sensorformat mit Formatfaktor', () => {
  const modes = read('data/camera-modes.json');
  for (const b of modes.brands) for (const m of b.models || []) {
    assert.ok(m.sensor && m.sensor.format && m.sensor.size, `${b.id}/${m.id}: Sensorformat fehlt`);
    assert.ok([1, 1.5, 1.6, 2].includes(m.sensor.crop), `${b.id}/${m.id}: unerwarteter Formatfaktor ${m.sensor.crop}`);
  }
});
