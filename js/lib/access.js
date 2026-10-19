// Zugangssperre für Seminarteilnehmer: Die App läuft erst nach Eingabe eines Kurs-Codes.
// Gültige Codes stehen als SHA-256-Hash in data/access.json (Pflege: node tools/access-code.mjs).
// Ist Netz da, holt die App die Liste beim Start frisch; ein gesperrter Code sperrt die App wieder.
// Ohne Netz bleibt eine einmal freigeschaltete App offen. Das ist eine Sperre, kein Tresor:
// Die Dateien selbst sind öffentlich, es geht darum, dass die App nicht frei herumgereicht wird.

const KEY = 'focuslab.access';
const SALT = 'focus:';
const LIST = './data/access.json';

/** SHA-256 als Hex. Nutzt crypto.subtle (nur bei https), sonst eine kleine eigene Umsetzung. */
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(bytes);
}

/** Hash, wie er in data/access.json steht: Code getrimmt, Großschreibung egal. */
export function codeHash(code) {
  return sha256Hex(SALT + String(code).trim().toUpperCase());
}

function readStored() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function writeStored(v) {
  try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* egal */ }
}

/** Liste der gültigen Hashes; null, wenn sie nicht zu holen ist (offline). */
export async function loadActiveHashes({ timeout = 4000 } = {}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(LIST, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.codes || []).filter((c) => c.active !== false).map((c) => c.sha256);
  } catch {
    return null;
  }
}

/**
 * Zustand beim Start: { unlocked, reason }. reason: 'revoked' (Code gesperrt), 'none' (nie freigeschaltet).
 */
export async function checkAccess() {
  const stored = readStored();
  if (!stored?.hash) return { unlocked: false, reason: 'none' };
  const active = await loadActiveHashes();
  if (active === null) return { unlocked: true };          // offline: bleibt offen
  if (active.includes(stored.hash)) return { unlocked: true };
  writeStored(null);
  return { unlocked: false, reason: 'revoked' };
}

/** Code prüfen und bei Erfolg merken. Ergebnis: 'ok' | 'wrong' | 'offline'. */
export async function tryCode(code) {
  const active = await loadActiveHashes({ timeout: 8000 });
  if (active === null) return 'offline';
  const hash = await codeHash(code);
  if (!active.includes(hash)) return 'wrong';
  writeStored({ hash, at: new Date().toISOString() });
  return 'ok';
}

/** Sperrbildschirm in root zeichnen; onUnlock() nach richtigem Code. */
export function renderLock(root, { t, reason, onUnlock }) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'lock';
  wrap.innerHTML = `
    <img class="lock-logo" src="assets/logo.svg" alt="" width="64" height="64">
    <h1></h1>
    <p class="lock-text"></p>
    <form class="lock-form" novalidate>
      <label class="field"><span class="field-label"></span>
        <input class="input lock-input" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required>
      </label>
      <button class="button primary block" type="submit"></button>
      <p class="lock-msg notice small" hidden></p>
    </form>`;
  wrap.querySelector('h1').textContent = t('access.title');
  wrap.querySelector('.lock-text').textContent = t('access.text');
  wrap.querySelector('.field-label').textContent = t('access.label');
  const btn = wrap.querySelector('button');
  btn.textContent = t('access.button');
  const msg = wrap.querySelector('.lock-msg');
  const input = wrap.querySelector('input');
  const say = (key) => { msg.hidden = !key; if (key) msg.textContent = t(key); };
  if (reason === 'revoked') say('access.revoked');
  wrap.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value.trim()) { say('access.empty'); input.focus(); return; }
    btn.disabled = true; say(null);
    const result = await tryCode(input.value);
    btn.disabled = false;
    if (result === 'ok') onUnlock();
    else { say(result === 'offline' ? 'access.offline' : 'access.wrong'); input.select(); }
  });
  root.appendChild(wrap);
  setTimeout(() => input.focus(), 50);
}

// ---------- SHA-256 ohne crypto.subtle (http-Seiten) ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export function sha256Fallback(bytes) {
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes); padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, len * 8, false);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000), false);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}
