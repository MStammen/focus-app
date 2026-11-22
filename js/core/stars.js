// Sternenfotografie: längste Zeit ohne Strichspuren, Startwerte, Sternspuren-Planer, Mondphase.
// Alles Faustregeln bzw. Mittelwerte, gedacht als Startpunkt für die erste Probeaufnahme.

/** 500er-Regel: 500 / (Brennweite · Formatfaktor) Sekunden. */
export function rule500(focal, crop = 1) {
  return 500 / (focal * crop);
}

/** Pixelabstand in µm aus Sensorbreite (36 mm / Formatfaktor), Megapixeln und Seitenverhältnis 3:2. */
export function pixelPitch(megapixels, crop = 1) {
  const widthPx = Math.sqrt(megapixels * 1e6 * 1.5);
  return ((36 / crop) * 1000) / widthPx;
}

/**
 * NPF-Regel (vereinfachte Form nach Frédéric Michaud, Société Astronomique du Havre):
 * t = (35 · N + 30 · p) / f, mit Blende N, Pixelabstand p in µm und Brennweite f in mm.
 * Strenger als die 500er-Regel: Sterne bleiben auch in der 100-%-Ansicht Punkte.
 */
export function ruleNpf(focal, aperture, pitchUm) {
  return (35 * aperture + 30 * pitchUm) / focal;
}

// Übliche Startwerte für die Milchstraße: f/2,8 · 20 s · ISO 3200 → Lichtwert bei ISO 100
export const MILKY_WAY_EV = Math.log2((2.8 * 2.8) / 20) - Math.log2(3200 / 100);

/** ISO für denselben Lichtwert wie die Startwerte, bei gegebener Blende und Zeit. */
export function starIso(aperture, seconds) {
  return 100 * Math.pow(2, Math.log2((aperture * aperture) / seconds) - MILKY_WAY_EV);
}

/** Sternspuren: Anzahl Bilder und Bogenlänge (Erddrehung 15,04° pro Stunde). */
export function trailPlan({ frameSeconds, gapSeconds = 1, totalMinutes }) {
  if (!(frameSeconds > 0 && totalMinutes > 0 && gapSeconds >= 0)) return null;
  const frames = Math.ceil((totalMinutes * 60) / (frameSeconds + gapSeconds));
  return { frames, arcDegrees: (totalMinutes / 60) * 15.04 };
}

// ---- Mond: mittlerer synodischer Monat ab einem bekannten Neumond (auf etwa einen Tag genau) ----
export const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // Neumond 6. Januar 2000, 18:14 UTC
const DAY = 86400000;

/** Mondalter in Tagen (0 = Neumond, ca. 14,8 = Vollmond). */
export function moonAge(date = new Date()) {
  const days = (date.getTime() - NEW_MOON_REF) / DAY;
  return ((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
}

/** Beleuchteter Anteil 0…1 und ob der Mond zunimmt. */
export function moonPhase(date = new Date()) {
  const age = moonAge(date);
  const illumination = (1 - Math.cos((2 * Math.PI * age) / SYNODIC_DAYS)) / 2;
  return { age, illumination, waxing: age < SYNODIC_DAYS / 2 };
}

/** Nächste Neu- und Vollmonde ab date (je count Stück, aufsteigend). */
export function nextMoons(date = new Date(), count = 2) {
  const age = moonAge(date);
  const lastNew = date.getTime() - age * DAY;
  const news = [], fulls = [];
  for (let i = 0; news.length < count || fulls.length < count; i++) {
    const n = lastNew + i * SYNODIC_DAYS * DAY;
    const f = n + (SYNODIC_DAYS / 2) * DAY;
    if (n > date.getTime() && news.length < count) news.push(new Date(n));
    if (f > date.getTime() && fulls.length < count) fulls.push(new Date(f));
  }
  return { newMoons: news, fullMoons: fulls };
}
