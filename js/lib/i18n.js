// Texte aus i18n/<lang>.json. Schlüssel mit Punkten: t('nav.capture').
// Platzhalter in geschweiften Klammern: t('shell.version', { version: '0.1.0' }).

let dict = {};
let lang = 'de';

export async function loadLanguage(code = 'de') {
  const res = await fetch(`./i18n/${code}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`i18n: ${code}.json nicht ladbar (${res.status})`);
  dict = await res.json();
  lang = code;
  document.documentElement.lang = code;
  return dict;
}

export function t(key, vars) {
  const value = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), dict);
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

export function currentLanguage() {
  return lang;
}

// Ersetzt Texte in statischem HTML: data-i18n="key" setzt textContent,
// data-i18n-aria-label="key" setzt aria-label.
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}
