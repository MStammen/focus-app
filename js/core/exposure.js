// focus – Rechenkern. Alles rechnet in Lichtwerten (EV, bezogen auf ISO 100).
// Reine Funktionen, keine DOM-Abhängigkeit. Tests: tests/exposure.test.js
//
// Konventionen:
// - aperture: Blendenzahl N (f/8 → 8)
// - shutterSeconds: Belichtungszeit in Sekunden (1/125 → 0.008)
// - iso: ISO-Empfindlichkeit
// - "Stufen" (stops): positiv = mehr Licht auf dem Sensor.

const LOG2_10 = Math.log2(10);

// ---------------------------------------------------------------------------
// Standardreihen (Drittelstufen). Ganze Stufen = jeder dritte Wert ab Index 0.
// Halbe Stufen sind eigene Nennwerte, wie sie auf Kameras stehen.
// ---------------------------------------------------------------------------

export const APERTURES_THIRD = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1,
  8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32, 36, 40, 45, 51, 57, 64, 72, 81,
  90, 102, 114, 128, 144, 161, 181, 203, 228, 256,
];

export const APERTURES_HALF = [
  1, 1.2, 1.4, 1.7, 2, 2.4, 2.8, 3.4, 4, 4.8, 5.6, 6.7, 8, 9.5, 11, 13, 16, 19, 22,
  27, 32, 38, 45, 54, 64, 76, 90, 108, 128, 152, 181, 215, 256,
];

// Zeiten als Sekunden. Unter 1 s als Kehrwert geschrieben, damit die Nennwerte lesbar bleiben.
export const SHUTTERS_THIRD = [
  1 / 8000, 1 / 6400, 1 / 5000, 1 / 4000, 1 / 3200, 1 / 2500, 1 / 2000, 1 / 1600, 1 / 1250,
  1 / 1000, 1 / 800, 1 / 640, 1 / 500, 1 / 400, 1 / 320, 1 / 250, 1 / 200, 1 / 160,
  1 / 125, 1 / 100, 1 / 80, 1 / 60, 1 / 50, 1 / 40, 1 / 30, 1 / 25, 1 / 20,
  1 / 15, 1 / 13, 1 / 10, 1 / 8, 1 / 6, 1 / 5, 1 / 4, 0.3, 0.4, 0.5, 0.6, 0.8,
  1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30,
  40, 50, 60, 80, 100, 120, 160, 200, 240, 320, 400, 480, 640, 800, 960,
  1280, 1600, 1920, 2560, 3200, 3840, 5120, 6400, 7680, 10240, 12800, 15360,
  20480, 25600, 28800, // 8 h als Obergrenze (statt 30720)
];

export const SHUTTERS_HALF = [
  1 / 8000, 1 / 6000, 1 / 4000, 1 / 3000, 1 / 2000, 1 / 1500, 1 / 1000, 1 / 750, 1 / 500,
  1 / 350, 1 / 250, 1 / 180, 1 / 125, 1 / 90, 1 / 60, 1 / 45, 1 / 30, 1 / 20, 1 / 15,
  1 / 10, 1 / 8, 1 / 6, 1 / 4, 1 / 3, 0.5, 0.7, 1, 1.5, 2, 3, 4, 6, 8, 10, 15, 20, 30,
  45, 60, 90, 120, 180, 240, 360, 480, 720, 960, 1440, 1920, 2880, 3840, 5760, 7680,
  11520, 15360, 23040, 28800,
];

export const ISOS_THIRD = [
  25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250,
  1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600,
  32000, 40000, 51200, 64000, 80000, 102400,
];

export const ISOS_HALF = [
  25, 35, 50, 70, 100, 140, 200, 280, 400, 560, 800, 1100, 1600, 2200, 3200, 4500, 6400,
  9000, 12800, 18000, 25600, 36000, 51200, 72000, 102400,
];

const SERIES = {
  aperture: { third: APERTURES_THIRD, half: APERTURES_HALF },
  shutter: { third: SHUTTERS_THIRD, half: SHUTTERS_HALF },
  iso: { third: ISOS_THIRD, half: ISOS_HALF },
};

function assertKind(kind) {
  if (!(kind in SERIES)) throw new RangeError(`Unbekannte Reihe: ${kind}`);
}

function assertPositive(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} muss eine positive Zahl sein, war ${value}`);
  }
}

/** Standardreihe für einen Parameter. step: 1 | 1/2 | 1/3 (Standard 1/3). */
export function standardSeries(kind, step = 1 / 3) {
  assertKind(kind);
  const s = SERIES[kind];
  if (step === 1) return s.third.filter((_, i) => i % 3 === 0);
  if (step === 1 / 2) return s.half;
  if (step === 1 / 3) return s.third;
  throw new RangeError(`Stufenraster muss 1, 1/2 oder 1/3 sein, war ${step}`);
}

// ---------------------------------------------------------------------------
// EV-Rechnung
// ---------------------------------------------------------------------------

/** Lichtwert bezogen auf ISO 100: log2(N² / t) − log2(ISO / 100). */
export function ev(aperture, shutterSeconds, iso = 100) {
  assertPositive('Blende', aperture);
  assertPositive('Zeit', shutterSeconds);
  assertPositive('ISO', iso);
  return Math.log2((aperture * aperture) / shutterSeconds) - Math.log2(iso / 100);
}

/** Belichtungszeit (s) für gegebenen EV, Blende und ISO. */
export function shutterFor(evValue, aperture, iso = 100) {
  assertPositive('Blende', aperture);
  assertPositive('ISO', iso);
  return (aperture * aperture) / Math.pow(2, evValue + Math.log2(iso / 100));
}

/** Blendenzahl für gegebenen EV, Zeit und ISO. */
export function apertureFor(evValue, shutterSeconds, iso = 100) {
  assertPositive('Zeit', shutterSeconds);
  assertPositive('ISO', iso);
  return Math.sqrt(shutterSeconds * Math.pow(2, evValue + Math.log2(iso / 100)));
}

/** ISO für gegebenen EV, Blende und Zeit. */
export function isoFor(evValue, aperture, shutterSeconds) {
  assertPositive('Blende', aperture);
  assertPositive('Zeit', shutterSeconds);
  return (100 * aperture * aperture) / (shutterSeconds * Math.pow(2, evValue));
}

/**
 * Differenz zweier Werte in Stufen. Positiv = b lässt mehr Licht auf den Sensor als a.
 *   shutter:  log2(b / a)      (längere Zeit → mehr Licht)
 *   iso:      log2(b / a)      (höhere ISO → mehr Empfindlichkeit)
 *   aperture: 2 · log2(a / b)  (kleinere Blendenzahl → mehr Licht)
 */
export function stopsBetween(a, b, kind = 'shutter') {
  assertKind(kind);
  assertPositive('a', a);
  assertPositive('b', b);
  if (kind === 'aperture') return 2 * Math.log2(a / b);
  return Math.log2(b / a);
}

/**
 * Rundet auf den nächsten Wert der Standardreihe (im logarithmischen Abstand).
 * Außerhalb der Reihe (z. B. Blende über f/256, Zeit über 8 h) wird der exakte Wert
 * zurückgegeben – die Lochkamera braucht Blendenzahlen weit über f/256.
 */
export function nearestStandard(value, kind, step = 1 / 3) {
  assertPositive('Wert', value);
  const series = standardSeries(kind, step);
  const full = SERIES[kind].third;
  const min = full[0];
  const max = full[full.length - 1];
  // Kleine Toleranz, damit 1/8000 oder 256 nach Rundungsfehlern noch "innen" sind.
  if (value < min * 0.999 || value > max * 1.001) return value;
  let best = series[0];
  let bestDist = Infinity;
  for (const candidate of series) {
    const d = Math.abs(Math.log2(value / candidate));
    if (d < bestDist) { bestDist = d; best = candidate; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// ND-Filter
// ---------------------------------------------------------------------------

/** Gängige Filter mit Nennfaktor. Stufen immer über ndStops berechnen, nicht hier hinterlegen. */
export const ND_FILTERS = [
  { name: 'ND2', factor: 2 },
  { name: 'ND4', factor: 4 },
  { name: 'ND8', factor: 8 },
  { name: 'ND16', factor: 16 },
  { name: 'ND32', factor: 32 },
  { name: 'ND64', factor: 64 },
  { name: 'ND400', factor: 400 },
  { name: 'ND1000', factor: 1000 },
  { name: 'ND3200', factor: 3200 },
  { name: 'ND100000', factor: 100000 },
];

/**
 * Stufen eines ND-Filters. Akzeptiert { stops } | { factor } | { density }.
 *   stops = log2(factor) = density / log10(2)   (log10(2) ≈ 0.301)
 * Exakt rechnen; die Anzeige rundet auf die übliche Bezeichnung (ND1000 = 9,97 ≈ "10 Stufen").
 */
export function ndStops(filter) {
  if (!filter || typeof filter !== 'object') throw new TypeError('ndStops erwartet ein Objekt');
  if ('stops' in filter) {
    if (typeof filter.stops !== 'number' || !Number.isFinite(filter.stops) || filter.stops < 0) {
      throw new RangeError(`stops muss ≥ 0 sein, war ${filter.stops}`);
    }
    return filter.stops;
  }
  if ('factor' in filter) {
    if (typeof filter.factor !== 'number' || !(filter.factor >= 1)) {
      throw new RangeError(`factor muss ≥ 1 sein, war ${filter.factor}`);
    }
    return Math.log2(filter.factor);
  }
  if ('density' in filter) {
    if (typeof filter.density !== 'number' || !Number.isFinite(filter.density) || filter.density < 0) {
      throw new RangeError(`density muss ≥ 0 sein, war ${filter.density}`);
    }
    return filter.density * LOG2_10;
  }
  throw new TypeError('ndStops erwartet { stops } | { factor } | { density }');
}

/** Neue Belichtungszeit nach einem oder mehreren Filtern (Stufen summieren sich). */
export function shutterWithNd(shutterSeconds, filters) {
  assertPositive('Zeit', shutterSeconds);
  const list = Array.isArray(filters) ? filters : [filters];
  const total = list.reduce((sum, f) => sum + ndStops(f), 0);
  return shutterSeconds * Math.pow(2, total);
}

// ---------------------------------------------------------------------------
// Formatierung
// ---------------------------------------------------------------------------

function trimNumber(n, decimals) {
  return Number(n.toFixed(decimals)).toString();
}

/**
 * Belichtungszeit lesbar:  "1/125", "0.5\"", "30\"", "2 min 15 s", "1 h 30 min".
 * Unter 0,3 s als Bruch, bis unter 60 s mit Sekundenzeichen, darüber in min/h.
 */
export function formatShutter(seconds) {
  assertPositive('Zeit', seconds);
  if (seconds < 0.3) {
    const denom = 1 / seconds;
    const rounded = Math.round(denom);
    // Nahe am ganzzahligen Kehrwert: "1/125". Sonst eine Nachkommastelle: "1/3.5".
    if (Math.abs(denom - rounded) / denom < 0.02 || denom >= 100) return `1/${rounded}`;
    return `1/${trimNumber(denom, 1)}`;
  }
  if (seconds < 60) {
    const decimals = seconds < 10 ? 1 : 0;
    return `${trimNumber(seconds, decimals)}"`;
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s) parts.push(`${s} s`);
  return parts.join(' ');
}

/** Blendenzahl lesbar: "f/5.6", "f/8", "f/11", "f/312" (über f/256 ganzzahlig exakt). */
export function formatAperture(aperture) {
  assertPositive('Blende', aperture);
  if (aperture >= 10) return `f/${Math.round(aperture)}`;
  return `f/${trimNumber(aperture, 1)}`;
}

/** ISO lesbar: "ISO 100", "ISO 12800" (Tausender ohne Trennzeichen wie auf Kameras). */
export function formatIso(iso) {
  assertPositive('ISO', iso);
  return `ISO ${Math.round(iso)}`;
}

/** Stufen lesbar mit Vorzeichen: "+1", "−2⅓", "+0.4" (auf Drittel, wenn nahe dran). */
export function formatStops(stops, decimals = 1) {
  if (typeof stops !== 'number' || !Number.isFinite(stops)) throw new RangeError('stops muss eine Zahl sein');
  const sign = stops < 0 ? '−' : stops > 0 ? '+' : '±';
  const abs = Math.abs(stops);
  const thirds = Math.round(abs * 3);
  if (Math.abs(abs * 3 - thirds) < 0.05) {
    const whole = Math.floor(thirds / 3);
    const rest = thirds % 3;
    const frac = rest === 1 ? '⅓' : rest === 2 ? '⅔' : '';
    const text = whole === 0 && frac ? frac : `${whole}${frac}`;
    return `${sign}${text}`;
  }
  return `${sign}${trimNumber(abs, decimals)}`;
}

/**
 * ND-Filter für eine Zielzeit vorschlagen: welche Kombination aus vorhandenen Filtern (jeder höchstens einmal,
 * bis maxFilters Stück) trifft die fehlenden Stufen am besten. Weniger Filter werden leicht bevorzugt
 * (jede weitere Glasfläche kostet Schärfe und bringt Farbstich). Ergebnis nach Güte sortiert:
 * [{ filters: [{ name, factor }], stops, error }] mit error = stops − needed (positiv: länger als Ziel).
 */
export function suggestNdFilters(neededStops, owned = ND_FILTERS, { maxFilters = 3, count = 3 } = {}) {
  if (!Number.isFinite(neededStops)) throw new RangeError('neededStops muss eine Zahl sein');
  if (neededStops <= 0.3) return [{ filters: [], stops: 0, error: -neededStops }];
  const list = owned.map((f) => ({ ...f, stops: ndStops(f) }));
  const combos = [];
  const walk = (start, picked, sum) => {
    if (picked.length) combos.push({ filters: picked, stops: sum, error: sum - neededStops });
    if (picked.length >= maxFilters) return;
    for (let i = start; i < list.length; i++) walk(i + 1, [...picked, list[i]], sum + list[i].stops);
  };
  walk(0, [], 0);
  const score = (c) => Math.abs(c.error) + 0.25 * (c.filters.length - 1);
  combos.sort((a, b) => score(a) - score(b));
  const seen = new Set(), out = [];
  for (const c of combos) {
    const key = c.stops.toFixed(1);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ filters: c.filters.map(({ name, factor }) => ({ name, factor })), stops: c.stops, error: c.error });
    if (out.length >= count) break;
  }
  return out;
}
