// Dunkelkammerlicht: ganzer Bildschirm in reinem Rot (nur rote Subpixel), Helligkeit einstellbar.
// Wischen hoch/runter = heller/dunkler, Antippen = Bedienung ein/aus. Display bleibt an (Wake Lock).
// Vollbild, wo der Browser es erlaubt (Android, iPad); auf dem iPhone bleibt die Statuszeile (iOS-Grenze).
import { el } from './ui.js';

const MIN = 0.03, MAX = 1, STEP = 0.05;
const clamp = (v) => Math.min(MAX, Math.max(MIN, v));

let open = null; // nur ein Licht gleichzeitig

/** Öffnet das Dunkelkammerlicht. Muss aus einem Klick heraus aufgerufen werden (Vollbild, Wake Lock). */
export function openSafelight(ctx) {
  if (open) return open;
  const { t } = ctx;
  let level = clamp(Number(ctx.getSetting('safelightLevel', 0.3)) || 0.3);
  let wakeLock = null;
  let hideTimer = null;

  const light = el('div', { class: 'safelight-light' });
  const wakeLine = el('p', { class: 'safelight-hint safelight-wake' });
  const pct = el('span', { class: 'safelight-pct' });
  const btn = (text, label, onClick) => el('button', { type: 'button', class: 'safelight-btn', text, 'aria-label': label, onClick: (e) => { e.stopPropagation(); onClick(); showUi(); } });
  const ui = el('div', { class: 'safelight-ui' }, [
    el('div', { class: 'safelight-row' }, [btn('−', t('safelight.darker'), () => setLevel(level - STEP)), pct, btn('+', t('safelight.brighter'), () => setLevel(level + STEP))]),
    el('p', { class: 'safelight-hint', text: t('safelight.hint') }),
    wakeLine,
    btn(t('safelight.close'), t('safelight.close'), close),
  ]);
  const root = el('div', { class: 'safelight', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('safelight.title') }, [light, ui]);

  function setLevel(v) {
    level = clamp(Math.round(v * 100) / 100);
    light.style.opacity = String(level);
    pct.textContent = `${Math.round(level * 100)} %`;
    ctx.setSetting('safelightLevel', level);
  }
  function showUi() {
    ui.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { ui.hidden = true; }, 4000);
  }

  // Wischen: ganze Bildschirmhöhe = volle Spanne
  let startY = null, startLevel = level, moved = false;
  root.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; startY = e.clientY; startLevel = level; moved = false; });
  root.addEventListener('pointermove', (e) => {
    if (startY == null) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 8) moved = true;
    if (moved) setLevel(startLevel + dy / Math.max(200, window.innerHeight));
  });
  root.addEventListener('pointerup', () => {
    if (startY != null && !moved) { if (ui.hidden) showUi(); else { ui.hidden = true; clearTimeout(hideTimer); } }
    startY = null;
  });
  root.addEventListener('pointercancel', () => { startY = null; });

  // Display an lassen. iOS hebt die Sperre z. B. beim App-Wechsel auf → bei Rückkehr neu anfordern.
  async function wake() {
    if (!open || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
      wakeLock?.addEventListener('release', () => { wakeLock = null; if (open) setTimeout(wake, 500); });
    } catch { wakeLock = null; }
    wakeLine.textContent = wakeLock ? t('safelight.wakeOn') : t('safelight.wakeOff');
  }
  const onVisible = () => { if (document.visibilityState === 'visible') wake(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowUp') setLevel(level + STEP); else if (e.key === 'ArrowDown') setLevel(level - STEP); };
  const onHash = () => close();

  function close() {
    if (!open) return;
    open = null;
    clearTimeout(hideTimer);
    try { wakeLock?.release(); } catch { /* egal */ }
    wakeLock = null;
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('hashchange', onHash);
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
    document.documentElement.classList.remove('safelight-on');
    root.remove();
  }

  document.body.appendChild(root);
  document.documentElement.classList.add('safelight-on');
  open = { close };
  setLevel(level);
  showUi();
  wake();
  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHash);
  // Vollbild blendet die Statuszeile aus (Android, iPad, Desktop). iPhone kennt es für Seiten nicht.
  const de = document.documentElement;
  const req = de.requestFullscreen || de.webkitRequestFullscreen;
  if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    try { req.call(de, { navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* egal */ }
  }
  root.tabIndex = -1;
  root.focus();
  return open;
}

/** Hinweise unter „Mehr dazu“: wofür das Licht taugt, Münztest, Statuszeile am iPhone. */
export function safelightTips(ctx) {
  return el('ul', { class: 'small safelight-tips' }, ctx.t('safelight.tips').split('|').map((s) => el('li', { text: s.trim() })));
}
