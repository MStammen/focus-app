// focus – Film / Schwarzschild-Korrektur. Reine Funktionen, Tests in tests/film.test.js
//
// Datenmodell (data/films.json und eigene Filme):
//   points: { "1": 1, "2": 2.5, ..., "480": 1200 }  gemessene Sekunden → korrigierte Sekunden
//   Fehlende oder null-Werte = Lücke (keine Herstellerdaten). Zwischen Stützpunkten wird
//   log-log-linear interpoliert, über dem letzten vorhandenen Stützpunkt extrapoliert (markiert).

export const SUPPORT_TIMES = [1, 2, 4, 8, 15, 30, 60, 120, 240, 480];

function assertPositive(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} muss eine positive Zahl sein, war ${value}`);
  }
}

/** Stützpunkte aus einer Potenzformel Tc = Tm^p (Ilford). */
export function pointsFromPower(p, times = SUPPORT_TIMES) {
  assertPositive('Exponent', p);
  const points = {};
  for (const t of times) points[t] = Number(Math.pow(t, p).toPrecision(6));
  return points;
}

/**
 * Stützpunkte aus einer Herstellertabelle [[gemessen, korrigiert], ...] (z. B. Kodak 1/10/100 s).
 * Innerhalb des Tabellenbereichs log-log interpoliert, außerhalb null (Lücke).
 */
export function pointsFromTable(table, times = SUPPORT_TIMES) {
  const rows = [...table].map(([t, c]) => [Number(t), Number(c)]).sort((a, b) => a[0] - b[0]);
  if (rows.length === 0) throw new RangeError('Tabelle ist leer');
  const points = {};
  for (const t of times) {
    if (t < rows[0][0] || t > rows[rows.length - 1][0]) { points[t] = null; continue; }
    points[t] = Number(interpolateLogLog(rows, t).toPrecision(6));
  }
  return points;
}

function interpolateLogLog(rows, t) {
  for (let i = 0; i < rows.length - 1; i++) {
    const [t0, c0] = rows[i];
    const [t1, c1] = rows[i + 1];
    if (t >= t0 && t <= t1) {
      if (t1 === t0) return c0;
      const u = (Math.log(t) - Math.log(t0)) / (Math.log(t1) - Math.log(t0));
      return Math.exp(Math.log(c0) + u * (Math.log(c1) - Math.log(c0)));
    }
  }
  const exact = rows.find(([t0]) => t0 === t);
  return exact ? exact[1] : NaN;
}

/** Vorhandene Stützpunkte als sortierte Liste [[t, tc], ...]; null/ungültige werden ausgelassen. */
export function availablePoints(points) {
  if (!points || typeof points !== 'object') return [];
  return Object.entries(points)
    .map(([t, c]) => [Number(t), c == null ? null : Number(c)])
    .filter(([t, c]) => Number.isFinite(t) && t > 0 && Number.isFinite(c) && c > 0)
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Korrigierte Zeit für eine gemessene Zeit.
 * Rückgabe: { seconds, stops, status } mit status:
 *   'none'         – keine Korrektur nötig (unter 1 s bzw. unter dem ersten Stützpunkt)
 *   'interpolated' – zwischen zwei Stützpunkten
 *   'exact'        – genau auf einem Stützpunkt
 *   'extrapolated' – über dem letzten vorhandenen Stützpunkt (Steigung des letzten Abschnitts)
 *   'noData'       – keine Stützpunkte vorhanden; seconds = null
 *   'gap'          – gemessene Zeit liegt über dem Herstellerbereich und die Daten darüber fehlen (Lücke);
 *                    seconds = extrapolierter Wert, als Schätzung gekennzeichnet
 */
export function correctedTime(points, measuredSeconds) {
  assertPositive('Zeit', measuredSeconds);
  const rows = availablePoints(points);
  if (rows.length === 0) return { seconds: null, stops: null, status: 'noData' };

  const [t0, c0] = rows[0];
  if (measuredSeconds <= 0.5) return { seconds: measuredSeconds, stops: 0, status: 'none' };
  if (measuredSeconds < t0) {
    // Zwischen 0,5 s (keine Korrektur) und erstem Stützpunkt log-log überblenden.
    const tc = interpolateLogLog([[0.5, 0.5], [t0, c0]], measuredSeconds);
    return finish(tc, measuredSeconds, tc === measuredSeconds ? 'none' : 'interpolated');
  }
  const [tLast, cLast] = rows[rows.length - 1];
  if (measuredSeconds <= tLast) {
    const exact = rows.find(([t]) => t === measuredSeconds);
    if (exact) return finish(exact[1], measuredSeconds, 'exact');
    return finish(interpolateLogLog(rows, measuredSeconds), measuredSeconds, 'interpolated');
  }
  // Extrapolation mit der Steigung des letzten Abschnitts (log-log). Bei nur einem Punkt: Faktor halten.
  let slope = 1;
  if (rows.length >= 2) {
    const [tPrev, cPrev] = rows[rows.length - 2];
    slope = (Math.log(cLast) - Math.log(cPrev)) / (Math.log(tLast) - Math.log(tPrev));
  }
  const tc = Math.exp(Math.log(cLast) + slope * (Math.log(measuredSeconds) - Math.log(tLast)));
  const hasGapAbove = Object.entries(points).some(([t, c]) => Number(t) > tLast && c == null);
  return finish(tc, measuredSeconds, hasGapAbove ? 'gap' : 'extrapolated');
}

function finish(seconds, measured, status) {
  return { seconds, stops: Math.log2(seconds / measured), status };
}

/** Film mit Nutzer-Überschreibungen zusammenführen: overrides { "30": 90 } ersetzt einzelne Stützpunkte. */
export function applyOverrides(film, overrides) {
  if (!overrides || typeof overrides !== 'object') return film;
  const points = { ...(film.points || {}) };
  for (const [t, c] of Object.entries(overrides)) {
    if (c == null || c === '') delete points[t];
    else points[t] = Number(c);
  }
  return { ...film, points, hasOverrides: Object.keys(overrides).length > 0 };
}

/** Prüft ein eigenes Filmobjekt. Gibt eine Liste von Fehlertexten zurück (leer = ok). */
export function validateFilm(film) {
  const errors = [];
  if (!film || typeof film !== 'object') return ['Kein Objekt'];
  if (!film.name || typeof film.name !== 'string' || !film.name.trim()) errors.push('Name fehlt');
  if (!(Number(film.iso) > 0)) errors.push('ISO fehlt oder ungültig');
  const rows = availablePoints(film.points);
  if (rows.length === 0) errors.push('Mindestens ein Stützpunkt nötig');
  for (const [t, c] of rows) {
    if (c < t) errors.push(`Stützpunkt ${t} s: korrigierte Zeit (${c}) ist kürzer als die gemessene`);
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] < rows[i - 1][1]) errors.push(`Stützpunkt ${rows[i][0]} s: korrigierte Zeit sinkt gegenüber ${rows[i - 1][0]} s`);
  }
  return errors;
}

/** Eigene Filme als JSON-Export (Schema wie data/films.json). */
export function exportFilms(films, { exportedAt = new Date().toISOString() } = {}) {
  return JSON.stringify({ schema: 1, kind: 'focus-films', exportedAt, films }, null, 2);
}

/** Import: akzeptiert das Export-Format oder ein nacktes Array. Gibt gültige Filme zurück. */
export function importFilms(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const list = Array.isArray(data) ? data : Array.isArray(data?.films) ? data.films : null;
  if (!list) throw new TypeError('Kein Filmexport');
  return list.filter((f) => validateFilm(f).length === 0).map((f) => ({
    id: typeof f.id === 'string' && f.id ? f.id : `custom-${Math.random().toString(36).slice(2, 10)}`,
    name: String(f.name).trim(),
    maker: typeof f.maker === 'string' ? f.maker : '',
    iso: Number(f.iso),
    type: f.type === 'color' ? 'color' : 'bw',
    points: Object.fromEntries(availablePoints(f.points)),
    note: typeof f.note === 'string' ? f.note : '',
    custom: true,
  }));
}
