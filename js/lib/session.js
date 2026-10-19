// Übergabe zwischen Rechnern innerhalb einer Sitzung (sessionStorage, fällt auf Speicher zurück).
const KEY = 'focuslab.session';
let mem = null;

function load() {
  if (mem) return mem;
  try { mem = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch { mem = {}; }
  return mem;
}
function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* egal */ }
}
export function getSession(key, fallback) {
  const s = load();
  return key in s ? s[key] : fallback;
}
export function setSession(key, value) {
  load()[key] = value;
  save();
}
