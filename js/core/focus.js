// Rechner „Mattscheibe“: Wo wird es scharf? Dünne Linse und Lochblende, alle Längen in mm.
// Reine Rechenfunktionen ohne DOM, getestet in tests/focus.test.js.

// Formate (Breite × Höhe in mm). „wall“ = die Zimmerwand der Camera obscura, 1,2 × 0,9 m.
export const FOCUS_FORMATS = {
  phone: { w: 9.8, h: 7.4 },
  apsc: { w: 23.6, h: 15.6 },
  kb: { w: 36, h: 24 },
  mf: { w: 70, h: 56 },
  lf4: { w: 120, h: 96 },
  lf8: { w: 245, h: 195 },
  wall: { w: 1200, h: 900 },
};

// Ganze Blendenreihe von 1 bis 64
export const APERTURES = [1, 1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22, 32, 45, 64];

// Der Raum ist fest: Poster 6 m vor, Wand 2 m hinter Loch bzw. Linse
export const POSTER_DIST = 6000;
export const WALL_DIST = 2000;

/** Bildweite b aus 1/f = 1/g + 1/b. Motiv in oder vor der Brennweite: kein reelles Bild → Infinity. */
export function imageDistance(f, g) {
  return g <= f ? Infinity : 1 / (1 / f - 1 / g);
}

/** Gegenstandsweite zu einer Bildweite (dieselbe Formel, andersherum gelesen). */
export function objectDistance(f, b) {
  return b <= f ? Infinity : 1 / (1 / f - 1 / b);
}

/** Zulässiger Zerstreuungskreis: Formatdiagonale / 1500. */
export function circleOfConfusion(fmt) {
  return Math.hypot(fmt.w, fmt.h) / 1500;
}

/** Fleck (Unschärfekreis) eines Punktes auf der Mattscheibe bei Abstand s hinter der Linse. */
export function lensSpot(f, N, g, s) {
  const b = imageDistance(f, g);
  if (!isFinite(b)) return Infinity;
  return (f / N) * Math.abs(s - b) / b;
}

/** Fleck einer Lochkamera: Loch d, Motiv g, Schirm s. Geometrisch, ohne Beugung. */
export function pinholeSpot(d, g, s) {
  return d * (g + s) / g;
}

/** Abbildungsmaßstab: Linse b/g, Loch s/g. */
export function magnification({ pinhole, f, g, s }) {
  if (pinhole) return s / g;
  const b = imageDistance(f, g);
  return isFinite(b) ? b / g : 0;
}

/** Wirksame Blende: Linse N·s/f (Auszugsverlängerung), Loch s/d. */
export function effectiveAperture({ pinhole, f, N, d, s }) {
  return pinhole ? s / d : N * s / f;
}

/**
 * Schärfentiefe für eine Mattscheibe bei s: alle Motivabstände, deren Fleck ≤ c bleibt.
 * → { near, far, bMin, bMax } (far kann Infinity sein) oder null, wenn s ≤ f.
 */
export function depthOfField(f, N, s, c) {
  if (!(s > f)) return null;
  const q = c / (f / N);
  const bMin = s / (1 + q);
  const bMax = q < 1 ? s / (1 - q) : Infinity;
  const far = bMin <= f ? Infinity : objectDistance(f, bMin);
  const near = bMax === Infinity ? f : objectDistance(f, bMax);
  return { near, far, bMin, bMax };
}

/** Mattscheibe zwischen zwei Motiven: harmonisches Mittel der beiden Bildweiten. */
export function screenBetween(f, g1, g2) {
  const b1 = imageDistance(f, g1), b2 = imageDistance(f, g2);
  return 2 * b1 * b2 / (b1 + b2);
}
