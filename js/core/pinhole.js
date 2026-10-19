// focus – Lochkamera-Rechnung. Reine Funktionen, Tests in tests/pinhole.test.js
// Alle Längen in Millimetern, Winkel in Grad.

import { ev, shutterFor, stopsBetween } from './exposure.js';

/** Wellenlänge für die Optimumsformel (grünes Licht, 550 nm = 0,00055 mm). */
export const LAMBDA_MM = 0.00055;

/** Filmformate für den Bildwinkel. Nennmaße des Films; das Bildfenster ist meist etwas kleiner. */
export const FORMATS = [
  { id: '135', name: 'Kleinbild (36 × 24 mm)', width: 36, height: 24 },
  { id: '4x5', name: '4 × 5″ (102 × 127 mm)', width: 127, height: 101.6 },
  { id: '8x10', name: '8 × 10″ (203 × 254 mm)', width: 254, height: 203.2 },
  { id: 'can', name: 'Dose (Breite eingeben)', width: null, height: null },
];

function assertPositive(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} muss eine positive Zahl sein, war ${value}`);
  }
}

/** Blendenzahl eines Lochs: N = Bildweite / Lochdurchmesser. */
export function fNumber(diameterMm, focalMm) {
  assertPositive('Lochdurchmesser', diameterMm);
  assertPositive('Bildweite', focalMm);
  return focalMm / diameterMm;
}

/** Lochdurchmesser für eine gewünschte Blendenzahl: d = f / N. */
export function diameterForFNumber(fNumberValue, focalMm) {
  assertPositive('Blendenzahl', fNumberValue);
  assertPositive('Bildweite', focalMm);
  return focalMm / fNumberValue;
}

/** Optimaler Lochdurchmesser nach Lord Rayleigh: d = 1,9 · √(λ · f). */
export function optimalDiameter(focalMm, lambdaMm = LAMBDA_MM) {
  assertPositive('Bildweite', focalMm);
  assertPositive('Wellenlänge', lambdaMm);
  return 1.9 * Math.sqrt(lambdaMm * focalMm);
}

/**
 * Bewertung eines Lochs gegenüber dem Optimum.
 * ratio = d / d_opt. Über 1,25: zu groß (geometrische Unschärfe), unter 0,8: zu klein (Beugung).
 */
export function rateDiameter(diameterMm, focalMm, lambdaMm = LAMBDA_MM) {
  const optimum = optimalDiameter(focalMm, lambdaMm);
  const ratio = diameterMm / optimum;
  let verdict = 'nearOptimum';
  if (ratio > 1.25) verdict = 'tooLarge';
  else if (ratio < 0.8) verdict = 'tooSmall';
  return { optimum, ratio, verdict, stopsFromOptimum: 2 * Math.log2(ratio) };
}

/**
 * Unschärfe-Fleckdurchmesser (mm) in der Bildebene, grobe Prinzipdarstellung:
 * geometrisch ≈ d, Beugung ≈ 2,44 · λ · f / d; Gesamt als Quadratsumme.
 * Für die Lernkarte „Geometrie gegen Beugung“, nicht als Messgröße.
 */
export function blurDiameter(diameterMm, focalMm, lambdaMm = LAMBDA_MM) {
  assertPositive('Lochdurchmesser', diameterMm);
  assertPositive('Bildweite', focalMm);
  const geometric = diameterMm;
  const diffraction = (2.44 * lambdaMm * focalMm) / diameterMm;
  return { geometric, diffraction, total: Math.hypot(geometric, diffraction) };
}

/** Bildwinkel in Grad: 2 · atan(Seite / (2 · f)). Fehlende Seiten ergeben null. */
export function angleOfView(focalMm, widthMm, heightMm) {
  assertPositive('Bildweite', focalMm);
  const angle = (side) => (side > 0 ? (2 * Math.atan(side / (2 * focalMm)) * 180) / Math.PI : null);
  const horizontal = angle(widthMm);
  const vertical = angle(heightMm);
  const diagonal = widthMm > 0 && heightMm > 0 ? angle(Math.hypot(widthMm, heightMm)) : null;
  return { horizontal, vertical, diagonal };
}

/**
 * Belichtung von einer Referenzmessung auf die Lochkamera übertragen.
 * reference: { aperture, shutter, iso } der Messkamera; pinholeAperture: Blendenzahl des Lochs;
 * filmIso: Empfindlichkeit des eingelegten Films.
 * Ergebnis ohne Schwarzschild-Korrektur – die kommt aus core/film.js.
 */
export function transferExposure(reference, pinholeAperture, filmIso) {
  assertPositive('Lochblende', pinholeAperture);
  assertPositive('Film-ISO', filmIso);
  const evValue = ev(reference.aperture, reference.shutter, reference.iso);
  const seconds = shutterFor(evValue, pinholeAperture, filmIso);
  const apertureStops = stopsBetween(reference.aperture, pinholeAperture, 'aperture'); // negativ: weniger Licht
  const isoStops = stopsBetween(reference.iso, filmIso, 'iso');
  return {
    seconds,
    ev: evValue,
    apertureStops,
    isoStops,
    totalStops: stopsBetween(reference.shutter, seconds, 'shutter'), // Zeitverlängerung in Stufen
  };
}
