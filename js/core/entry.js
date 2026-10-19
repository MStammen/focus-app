// Logbuch-Einträge prüfen: Blende, Zeit, ISO und Bilderzahl müssen größer als 0 sein, ND-Stufen mindestens 0.
// Gilt beim Speichern im Formular, beim Logbuch-Import und beim Gesamt-Import. Ungültige Werte werden
// zu null, damit ein einzelner kaputter Eintrag das Logbuch nicht mehr unbrauchbar machen kann.

const positive = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/** Zahlenfelder eines Eintrags bereinigen (gibt eine Kopie zurück). */
export function cleanEntryNumbers(e) {
  return { ...e, aperture: positive(e.aperture), shutter: positive(e.shutter), iso: positive(e.iso), frames: positive(e.frames), nd: positive(e.nd) };
}

/** Formularwerte prüfen: { ok } oder { ok: false, reason: 'invalid' | 'empty' }. Leere Felder sind erlaubt. */
export function checkEntryInput({ aperture, shutter, iso, nd, frames, film = '', note = '', hasImage = false }) {
  const given = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(v);
  for (const v of [aperture, shutter, iso, frames]) if (given(v) && !(Number(v) > 0)) return { ok: false, reason: 'invalid' };
  if (given(nd) && !(Number(nd) >= 0)) return { ok: false, reason: 'invalid' };
  const any = [aperture, shutter, iso, nd, frames].some((v) => given(v) && Number(v) > 0) || film.trim() || note.trim() || hasImage;
  return any ? { ok: true } : { ok: false, reason: 'empty' };
}
