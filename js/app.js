// focus – Shell: Router, Theme, i18n, Service Worker.
// Module liegen in js/modules/ und exportieren init(root, ctx) → optional cleanup().

import { loadLanguage, t, applyTranslations } from './lib/i18n.js';
import { getSetting, setSetting, onSettingChange } from './lib/storage.js';
import { checkAccess, renderLock, tryCode } from './lib/access.js';

export const APP_VERSION = '1.49.0';

const ROUTES = {
  capture:  { module: './modules/capture.js',  title: 'nav.capture' },
  calc:     { module: './modules/calc.js',     title: 'nav.calc' },
  camera:   { module: './modules/camera.js',   title: 'nav.camera' },
  timer:    { module: './modules/timer.js',    title: 'nav.timer' },
  learn:    { module: './modules/learn.js',    title: 'nav.learn' },
  log:      { module: './modules/log.js',      title: 'nav.log' },
  settings: { module: './modules/settings.js', title: 'nav.settings' },
};
const DEFAULT_ROUTE = 'capture';

const THEME_COLORS = { dark: '#0b0d12', redlight: '#000000' };

const viewEl = document.getElementById('view');
const toastEl = document.getElementById('toast');
const redlightBtn = document.getElementById('redlight-toggle');

let currentCleanup = null;
let currentRouteId = null;
let deferredInstallPrompt = null;

// ---------- Theme ----------

export function getTheme() {
  return document.documentElement.dataset.theme === 'redlight' ? 'redlight' : 'dark';
}

export function setTheme(theme) {
  const next = theme === 'redlight' ? 'redlight' : 'dark';
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next]);
  redlightBtn.setAttribute('aria-pressed', String(next === 'redlight'));
  if (getSetting('theme', 'dark') !== next) setSetting('theme', next);
}

redlightBtn.addEventListener('click', () => {
  setTheme(getTheme() === 'redlight' ? 'dark' : 'redlight');
});

onSettingChange((key, value) => {
  if (key === 'theme' && value !== getTheme()) setTheme(value);
});

// ---------- Toast ----------

let toastTimer = null;
export function showToast(message, { action, onAction, timeout = 4000 } = {}) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  toastEl.appendChild(text);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button';
    btn.textContent = action;
    btn.addEventListener('click', () => { hideToast(); onAction?.(); });
    toastEl.appendChild(btn);
  }
  toastEl.hidden = false;
  if (timeout > 0) toastTimer = setTimeout(hideToast, timeout);
}

export function hideToast() {
  toastEl.hidden = true;
}

// ---------- Router (Hash-basiert, läuft auf jedem statischen Webspace) ----------

export function navigate(path) {
  location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\/+/, '')}`;
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const id = segments[0] in ROUTES ? segments[0] : DEFAULT_ROUTE;
  return { id, subpath: segments.slice(1), query: new URLSearchParams(queryPart || '') };
}

const moduleCache = new Map();
async function loadModule(route) {
  if (!moduleCache.has(route.module)) moduleCache.set(route.module, import(route.module));
  return moduleCache.get(route.module);
}

async function render() {
  const { id, subpath, query } = parseHash();
  const route = ROUTES[id];

  if (!location.hash) {
    history.replaceState(null, '', `#/${id}`);
  }

  document.querySelectorAll('.tab[data-route]').forEach((tab) => {
    if (tab.dataset.route === id) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  document.getElementById('settings-link')?.setAttribute('aria-current', id === 'settings' ? 'page' : 'false');

  document.title = `${t(route.title)} · focus`;

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { console.warn('cleanup', e); }
  }
  currentCleanup = null;

  const ctx = {
    t, navigate, showToast, hideToast, setTheme, getTheme,
    getSetting, setSetting, subpath, query,
    appVersion: APP_VERSION,
    installPrompt: () => deferredInstallPrompt,
    clearInstallPrompt: () => { deferredInstallPrompt = null; },
  };

  try {
    const mod = await loadModule(route);
    viewEl.innerHTML = '';
    currentCleanup = await mod.init(viewEl, ctx);
  } catch (err) {
    console.error(err);
    viewEl.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'notice';
    p.textContent = t('shell.moduleError', { name: t(route.title) });
    viewEl.appendChild(p);
  }

  if (currentRouteId !== null && currentRouteId !== id) {
    window.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  }
  currentRouteId = id;
}

// ---------- Service Worker ----------

let swRegistered = false;
function registerServiceWorker() {
  if (swRegistered) return;
  swRegistered = true;
  if (!('serviceWorker' in navigator)) return;
  // Erst nach dem Laden der Seite registrieren, damit der Start nicht konkurriert.
  // Falls 'load' schon vorbei ist (i18n wurde vorher abgewartet), sofort registrieren.
  const whenLoaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  whenLoaded.then(async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast(t('shell.updateReady'), {
              action: t('shell.updateAction'),
              timeout: 0,
              onAction: () => worker.postMessage({ type: 'SKIP_WAITING' }),
            });
          }
        });
      });

      // Neu laden nur bei einem Update. Beim ersten Besuch übernimmt der Service Worker ohne Neuladen,
      // sonst ginge z. B. ein gerade getippter Kurs-Code verloren.
      const hadController = !!navigator.serviceWorker.controller;
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing || !hadController) return;
        refreshing = true;
        location.reload();
      });
    } catch (err) {
      console.warn('Service Worker nicht registriert:', err);
    }
  });
}

// Android/Chrome: Installationsaufforderung zurückhalten, in den Einstellungen anbieten.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showToast(t('shell.installed'));
});

// ---------- Start ----------

async function start() {
  setTheme(getSetting('theme', 'dark'));
  try {
    await loadLanguage('de');
  } catch (err) {
    console.error(err);
  }
  applyTranslations(document);
  registerServiceWorker();
  // QR-Code mit Schlüssel (#k=…): freischalten ohne Eintippen. Der Schlüssel steht hinter dem #, geht also nie an
  // den Server, und wird sofort aus der Adresse entfernt (nicht im Verlauf, nicht beim Teilen des Links).
  const key = location.hash.match(/^#k=([A-Za-z0-9]{4,40})/);
  if (key) {
    history.replaceState(null, '', `${location.pathname}${location.search}#/capture`);
    await tryCode(key[1]);
  }
  // Zugang nur für Seminarteilnehmer: erst Kurs-Code, dann die App (js/lib/access.js)
  const access = await checkAccess();
  if (!access.unlocked) {
    document.body.classList.add('locked');
    renderLock(viewEl, { t, reason: access.reason, onUnlock: () => { document.body.classList.remove('locked'); openApp(); } });
    return;
  }
  await openApp();
}

async function openApp() {
  window.addEventListener('hashchange', render);
  await render();
}

start();
