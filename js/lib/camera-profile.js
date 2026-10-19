// Profil der eigenen Kamera: Marke aus data/camera-modes.json plus eigene Grenzen aus den Einstellungen.
let modesPromise = null;
export function loadCameraModes() {
  if (!modesPromise) modesPromise = fetch('./data/camera-modes.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  return modesPromise;
}

/** Grenzen der Kamera: Markenwerte, überschrieben durch Einstellung „camLimits“. */
export function cameraLimits(ctx, modes, brand) {
  const own = ctx.getSetting('camLimits', {}) || {};
  const base = brand?.limits || { maxShutter: 30, isoMin: 100, isoMax: 25600, bulb: 'B' };
  const lens = modes?.lensDefault || { apMin: 2.8, apMax: 22 };
  const phone = brand?.layout === 'phone';
  return {
    maxShutter: Number(own.maxShutter) > 0 ? Number(own.maxShutter) : base.maxShutter,
    isoMin: Number(own.isoMin) > 0 ? Number(own.isoMin) : base.isoMin,
    isoMax: Number(own.isoMax) > 0 ? Number(own.isoMax) : base.isoMax,
    apMin: phone ? 1.8 : Number(own.apMin) > 0 ? Number(own.apMin) : lens.apMin,
    apMax: phone ? 1.8 : Number(own.apMax) > 0 ? Number(own.apMax) : lens.apMax,
    bulb: base.bulb,
    custom: Object.keys(own).length > 0,
  };
}

/**
 * Marke mit gewähltem Modell zusammenführen: Gehäuse, Radbelegung und Grenzen des Modells
 * ersetzen die allgemeinen Markenangaben. Ohne Modell bleibt die Marke, wie sie ist.
 */
export function withModel(brand, modelId) {
  if (!brand) return null;
  const model = (brand.models || []).find((m) => m.id === modelId);
  if (!model) return { ...brand, model: null };
  return {
    ...brand,
    model,
    body: { ...(model.body || brand.body || {}) },
    dials: model.dials ? { ...model.dials } : brand.dials,
    limits: { ...(brand.limits || {}), ...(model.limits || {}) },
    sensor: model.sensor || brand.sensor || null,
  };
}

/** Marke (und Modell) aus den Einstellungen „cameraBrand“ und „cameraModel“. */
export function currentBrand(ctx, modes) {
  const id = ctx.getSetting('cameraBrand', '');
  const brand = modes.brands.find((b) => b.id === id) || null;
  return brand ? withModel(brand, ctx.getSetting('cameraModel', '')) : null;
}

/**
 * Prüft Werte gegen die Grenzen. Gibt Hinweise als { key, vars } zurück (Texte in i18n camera.limits.*).
 */
export function checkLimits(limits, { aperture, shutter, iso }) {
  const out = [];
  if (shutter != null && shutter > limits.maxShutter) out.push({ key: limits.bulb ? 'shutterBulb' : 'shutterNoBulb', vars: { max: limits.maxShutter, bulb: limits.bulb || '' } });
  if (aperture != null && aperture < limits.apMin - 0.05) out.push({ key: 'apertureOpen', vars: { min: limits.apMin } });
  if (aperture != null && aperture > limits.apMax + 0.05) out.push({ key: 'apertureClosed', vars: { max: limits.apMax } });
  if (iso != null && iso > limits.isoMax) out.push({ key: 'isoHigh', vars: { max: limits.isoMax } });
  if (iso != null && iso < limits.isoMin) out.push({ key: 'isoLow', vars: { min: limits.isoMin } });
  return out;
}
