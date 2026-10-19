// Kleine Hülle um localStorage für Einstellungen.
// Alles liegt unter einem Schlüssel als JSON, damit Export/Import später einfach ist.

const KEY = 'focuslab.settings';
const listeners = new Set();

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    // Speicher voll oder privat-Modus: Einstellungen gelten dann nur für die Sitzung.
  }
}

export function getSetting(key, fallback) {
  const all = readAll();
  return key in all ? all[key] : fallback;
}

export function setSetting(key, value) {
  const all = readAll();
  all[key] = value;
  writeAll(all);
  for (const fn of listeners) fn(key, value);
}

export function getAllSettings() {
  return readAll();
}

export function onSettingChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
