// Schärfentiefe nach den üblichen Näherungsformeln (dünne Linse, Entfernung ab Sensorebene):
//   hyperfokale Distanz  H = f² / (N · c) + f
//   Nahpunkt             s · (H − f) / (H + s − 2f)
//   Fernpunkt            s · (H − f) / (H − s), ab s ≥ H unendlich
// c = zulässiger Zerstreuungskreis. Üblich sind 0,03 mm für Vollformat (Kleinbild 36 × 24 mm),
// bei kleineren Sensoren geteilt durch den Formatfaktor, weil das Bild stärker vergrößert wird.

export const COC_FULL_FRAME = 0.03; // mm

/** Sensorformate zur Auswahl, Formatfaktor wie in data/camera-modes.json (sensor.crop). */
export const DOF_FORMATS = [
  { id: 'ff', crop: 1 },
  { id: 'apsc', crop: 1.5 },
  { id: 'apscCanon', crop: 1.6 },
  { id: 'mft', crop: 2 },
];

export function circleOfConfusion(crop = 1) {
  return COC_FULL_FRAME / (crop > 0 ? crop : 1);
}

/** Hyperfokale Distanz in Millimetern. */
export function hyperfocal(focalMm, aperture, cocMm) {
  return (focalMm * focalMm) / (aperture * cocMm) + focalMm;
}

/**
 * dof({ focal (mm), aperture, distance (m), crop }) → { near, far, total, hyperfocal, coc } in Metern
 * (far und total sind Infinity, wenn der Fernpunkt im Unendlichen liegt). null bei ungültigen Werten.
 */
export function dof({ focal, aperture, distance, crop = 1 }) {
  if (!(focal > 0 && aperture > 0 && distance > 0)) return null;
  const f = focal, c = circleOfConfusion(crop), s = distance * 1000;
  if (s <= f) return null; // näher als die Brennweite lässt sich nicht scharfstellen
  const H = hyperfocal(f, aperture, c);
  const near = (s * (H - f)) / (H + s - 2 * f);
  const far = s >= H ? Infinity : (s * (H - f)) / (H - s);
  return { near: near / 1000, far: far / 1000, total: (far - near) / 1000, hyperfocal: H / 1000, coc: c };
}
