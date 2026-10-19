// Einstellungen (Spec Abschnitt 8): Stufenraster, Handy-Profil, Wasserzeichen, Countdown, Ton/Vibration,
// Rotlicht, Daten (Export/Import/Löschen), Installation, Über.
import { COURSE_OPEN } from '../lib/features.js';
import { el, button, segmented, STEP_OPTIONS, numberField, downloadText, fmtNum } from '../lib/ui.js';
import { getAllSettings, setSetting } from '../lib/storage.js';
import { allEntries, putEntry, deleteEntry } from '../lib/db.js';
import { getCustomFilms, saveCustomFilm, deleteCustomFilm, getOverrides, setOverrides, loadBuiltinFilms } from '../lib/films-store.js';
import { timestampName } from '../lib/image.js';
import { withModel } from '../lib/camera-profile.js';
import { cleanEntryNumbers } from '../core/entry.js';

const LOCAL_KEYS = ['focuslab.settings', 'focuslab.films.custom', 'focuslab.films.overrides', 'focuslab.tasks'];

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function switchRow({ label, hint, checked, onChange }) {
  const sw = el('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(checked), 'aria-label': label });
  sw.addEventListener('click', () => { const next = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(next)); onChange(next); });
  const labelEl = el('span', { class: 'row-label' }, [el('span', { text: label }), hint ? el('span', { class: 'row-hint', text: hint }) : null]);
  return { row: el('div', { class: 'row' }, [labelEl, sw]), sw };
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
}
async function dataUrlToBlob(url) { return (await fetch(url)).blob(); }

export async function init(root, ctx) {
  const { t, getTheme, setTheme, appVersion, showToast, getSetting } = ctx;
  root.appendChild(el('h1', { text: t('settings.title') }));

  // ---------- Rechnen ----------
  root.appendChild(el('h2', { text: t('settings.calc') }));
  const calcCard = el('div', { class: 'card' });
  calcCard.appendChild(el('div', { class: 'row' }, [
    el('span', { class: 'row-label' }, [el('span', { text: t('calc.stepGrid') }), el('span', { class: 'row-hint', text: t('settings.stepHint') })]),
    segmented({ small: true, ariaLabel: t('calc.stepGrid'), active: getSetting('stepGrid', '1/3'), items: STEP_OPTIONS.map((o) => ({ id: o.key, label: o.label })), onSelect: (key) => { setSetting('stepGrid', key); calcCard.querySelectorAll('.segmented .segment').forEach((s) => s.setAttribute('aria-current', String(s.textContent === STEP_OPTIONS.find((o) => o.key === key).label))); } }),
  ]));
  root.appendChild(calcCard);

  // ---------- Handy-Profil ----------
  root.appendChild(el('h2', { text: t('settings.phone') }));
  const phoneCard = el('div', { class: 'card' }, [el('p', { class: 'muted small', text: t('settings.phoneHint') })]);
  let devices = [];
  try { devices = (await (await fetch('./data/devices.json')).json()).devices; } catch { /* ohne Profile weiter */ }
  const apertureF = numberField({ label: t('settings.phoneAperture'), value: getSetting('phoneAperture', 1.8), min: 0.8, max: 16, stepAttr: '0.1', onChange: (v) => { if (v > 0) setSetting('phoneAperture', v); } });
  const focalF = numberField({ label: t('settings.phoneFocal'), value: getSetting('phoneFocal', 6), unit: 'mm', min: 1, max: 50, stepAttr: '0.1', onChange: (v) => { if (v > 0) setSetting('phoneFocal', v); } });
  if (devices.length) {
    const select = el('select', { class: 'select' }, [el('option', { value: '', text: t('settings.phoneCustom') }), ...devices.map((d) => el('option', { value: d.id, text: d.name, selected: d.id === getSetting('phoneProfile', '') }))]);
    select.addEventListener('change', () => {
      const d = devices.find((x) => x.id === select.value);
      setSetting('phoneProfile', select.value);
      if (d) { setSetting('phoneAperture', d.aperture); setSetting('phoneFocal', d.focal); apertureF.setValue(d.aperture); focalF.setValue(d.focal); }
    });
    phoneCard.appendChild(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('settings.phoneProfile') }), select]));
  }
  phoneCard.appendChild(el('div', { class: 'fields', style: 'margin-top:12px' }, [apertureF.field, focalF.field]));
  root.appendChild(phoneCard);

  // ---------- Deine Kamera (Modusrad) ----------
  root.appendChild(el('h2', { text: t('settings.camera') }));
  const camCard = el('div', { class: 'card' }, [el('p', { class: 'muted small', text: t('settings.cameraHint') })]);
  try {
    const modes = await (await fetch('./data/camera-modes.json')).json();
    const camSel = el('select', { class: 'select' }, [el('option', { value: '', text: t('settings.cameraNone') }), ...modes.brands.map((b) => el('option', { value: b.id, text: b.name, selected: b.id === getSetting('cameraBrand', '') }))]);
    camCard.appendChild(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('settings.cameraBrand') }), camSel]));
    // Modell der Marke (Gehäuse, Radbelegung, Grenzen)
    const modelSel = el('select', { class: 'select' });
    const modelField = el('label', { class: 'field', style: 'margin-top:12px' }, [el('span', { class: 'field-label', text: t('camera.model') }), modelSel]);
    const fillModels = () => {
      const b = modes.brands.find((x) => x.id === getSetting('cameraBrand', ''));
      modelSel.innerHTML = '';
      if (b) modelSel.append(el('option', { value: '', text: t('camera.modelGeneric', { brand: b.name }) }), ...(b.models || []).map((m) => el('option', { value: m.id, text: m.name, selected: m.id === getSetting('cameraModel', '') })));
      modelField.hidden = !b?.models?.length;
    };
    fillModels();
    modelSel.addEventListener('change', () => { setSetting('cameraModel', modelSel.value); renderLimits(); });
    camCard.appendChild(modelField);
    camCard.appendChild(el('p', { class: 'small', style: 'margin:10px 0 0' }, [el('a', { href: '#/camera', text: t('settings.cameraTab') }), ...(COURSE_OPEN ? [' · ', el('a', { href: '#/learn/card/modedial', text: t('settings.cameraCard') })] : [])]));

    // Grenzen der eigenen Kamera: leer = typischer Wert der Marke
    camCard.appendChild(el('h2', { style: 'margin:20px 0 4px;font-size:1rem', text: t('settings.limitsTitle') }));
    camCard.appendChild(el('p', { class: 'muted small', text: t('settings.limitsHint') }));
    const limitsBox = el('div');
    camCard.appendChild(limitsBox);
    const renderLimits = () => {
      limitsBox.innerHTML = '';
      const brand = withModel(modes.brands.find((b) => b.id === getSetting('cameraBrand', '')), getSetting('cameraModel', ''));
      const base = { ...(brand?.limits || { maxShutter: 30, isoMin: 100, isoMax: 25600 }), ...(modes.lensDefault || { apMin: 2.8, apMax: 22 }) };
      const own = { ...(getSetting('camLimits', {}) || {}) };
      const save = (key, v) => { if (v > 0) own[key] = v; else delete own[key]; setSetting('camLimits', own); };
      const f = (key, label, unit, step) => {
        const fld = numberField({ label, value: own[key] ?? '', unit, min: 0, stepAttr: step, onChange: (v) => save(key, v) });
        fld.input.placeholder = String(base[key]);
        return fld.field;
      };
      limitsBox.append(
        el('div', { class: 'fields' }, [f('maxShutter', t('settings.maxShutter'), 's', '1'), f('isoMin', t('settings.isoMin'), '', '1'), f('isoMax', t('settings.isoMax'), '', '1')]),
        el('div', { class: 'fields', style: 'margin-top:12px' }, [f('apMin', t('settings.apMin'), '', '0.1'), f('apMax', t('settings.apMax'), '', '1')]),
        el('div', { class: 'btn-row' }, [button(t('settings.limitsReset'), { onClick: () => { setSetting('camLimits', {}); renderLimits(); showToast(t('settings.limitsSaved')); } })]),
      );
    };
    renderLimits();
    camSel.addEventListener('change', () => { setSetting('cameraBrand', camSel.value); setSetting('cameraModel', ''); fillModels(); renderLimits(); });
  } catch { /* ohne Daten */ }
  root.appendChild(camCard);

  // ---------- Aufnahme ----------
  root.appendChild(el('h2', { text: t('nav.capture') }));
  const capCard = el('div', { class: 'card' });
  capCard.appendChild(switchRow({ label: t('settings.watermark'), hint: t('settings.watermarkHint'), checked: getSetting('watermark', true), onChange: (v) => setSetting('watermark', v) }).row);
  capCard.appendChild(switchRow({ label: t('settings.countdown'), hint: t('settings.countdownHint'), checked: getSetting('countdown', true), onChange: (v) => setSetting('countdown', v) }).row);
  root.appendChild(capCard);

  // ---------- Timer ----------
  root.appendChild(el('h2', { text: t('nav.timer') }));
  const timerCard = el('div', { class: 'card' });
  timerCard.appendChild(switchRow({ label: t('timer.sound'), checked: getSetting('sound', true), onChange: (v) => setSetting('sound', v) }).row);
  timerCard.appendChild(switchRow({ label: t('timer.vibration'), hint: 'vibrate' in navigator ? '' : t('settings.noVibration'), checked: getSetting('vibration', true), onChange: (v) => setSetting('vibration', v) }).row);
  root.appendChild(timerCard);

  // ---------- Anzeige ----------
  root.appendChild(el('h2', { text: t('settings.display') }));
  const { row: redRow, sw: redSwitch } = switchRow({ label: t('settings.redlight'), hint: t('settings.redlightHint'), checked: getTheme() === 'redlight', onChange: (on) => setTheme(on ? 'redlight' : 'dark') });
  root.appendChild(el('div', { class: 'card' }, [redRow]));
  const observer = new MutationObserver(() => redSwitch.setAttribute('aria-checked', String(getTheme() === 'redlight')));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- Daten ----------
  root.appendChild(el('h2', { text: t('settings.data') }));
  const dataCard = el('div', { class: 'card' }, [el('p', { class: 'muted small', text: t('settings.dataHint') })]);
  const importInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.kind !== 'focus-backup' && data?.kind !== 'focuslab-backup') throw new Error(t('settings.importInvalid'));
      if (data.settings && typeof data.settings === 'object') for (const [k, v] of Object.entries(data.settings)) if (k !== 'theme') setSetting(k, v);
      if (Array.isArray(data.customFilms)) for (const f of data.customFilms) saveCustomFilm(f);
      if (data.overrides && typeof data.overrides === 'object') for (const [id, o] of Object.entries(data.overrides)) setOverrides(id, o);
      if (data.tasks) try { localStorage.setItem('focuslab.tasks', JSON.stringify(data.tasks)); } catch { /* egal */ }
      let n = 0;
      if (Array.isArray(data.entries)) {
        for (const raw of data.entries) {
          if (!raw?.id || !raw.createdAt) continue;
          await putEntry({ ...cleanEntryNumbers(raw), image: typeof raw.image === 'string' ? await dataUrlToBlob(raw.image) : null, thumb: typeof raw.thumb === 'string' ? await dataUrlToBlob(raw.thumb) : null });
          n += 1;
        }
      }
      showToast(t('settings.imported', { n }));
    } catch (err) {
      showToast(`${t('settings.importFailed')}: ${err?.message || err}`);
    }
    importInput.value = '';
  });
  dataCard.appendChild(el('div', { class: 'btn-row' }, [
    button(t('settings.exportAll'), { primary: true, onClick: async () => {
      const entries = await allEntries().catch(() => []);
      const out = [];
      for (const e of entries) out.push({ ...e, image: e.image ? await blobToDataUrl(e.image) : null, thumb: e.thumb ? await blobToDataUrl(e.thumb) : null });
      let overrides = {};
      try { overrides = JSON.parse(localStorage.getItem('focuslab.films.overrides') || '{}'); } catch { /* egal */ }
      let tasks = {};
      try { tasks = JSON.parse(localStorage.getItem('focuslab.tasks') || '{}'); } catch { /* egal */ }
      downloadText(timestampName('focus-backup', 'json'), JSON.stringify({ schema: 1, kind: 'focus-backup', exportedAt: new Date().toISOString(), version: appVersion, settings: getAllSettings(), customFilms: getCustomFilms(), overrides, tasks, entries: out }, null, 1));
      showToast(t('settings.exported'));
    } }),
    button(t('settings.importAll'), { onClick: () => importInput.click() }),
  ]));
  dataCard.appendChild(importInput);
  dataCard.appendChild(el('div', { class: 'btn-row' }, [button(t('settings.deleteAll'), { danger: true, onClick: async () => {
    if (!confirm(t('settings.deleteConfirm'))) return;
    if (!confirm(t('settings.deleteConfirm2'))) return;
    const theme = getTheme();
    try { for (const e of await allEntries()) await deleteEntry(e.id); } catch { /* egal */ }
    for (const k of LOCAL_KEYS) { try { localStorage.removeItem(k); } catch { /* egal */ } }
    try { sessionStorage.clear(); } catch { /* egal */ }
    setSetting('theme', theme);
    showToast(t('settings.deleted'));
    setTimeout(() => location.reload(), 800);
  } })]));
  root.appendChild(dataCard);

  // ---------- Installation ----------
  root.appendChild(el('h2', { text: t('settings.install') }));
  const installCard = el('div', { class: 'card' });
  root.appendChild(installCard);
  function renderInstall() {
    installCard.innerHTML = '';
    if (isStandalone()) installCard.appendChild(el('p', { text: t('settings.installDone') }));
    else {
      installCard.appendChild(el('p', { text: t('settings.installHint') }));
      const prompt = ctx.installPrompt();
      if (prompt) {
        installCard.appendChild(button(t('settings.installButton'), { primary: true, block: true, onClick: async () => { prompt.prompt(); try { await prompt.userChoice; } catch { /* abgebrochen */ } ctx.clearInstallPrompt(); renderInstall(); } }));
      } else installCard.appendChild(el('p', { class: 'muted small', text: isIos() ? t('settings.installIos') : t('settings.installAndroid') }));
    }
    const offline = el('p', { class: 'muted small' });
    installCard.appendChild(offline);
    if (!('serviceWorker' in navigator)) offline.textContent = t('settings.offlineUnavailable');
    else if (navigator.serviceWorker.controller) offline.textContent = t('settings.offlineReady');
    else { offline.textContent = t('settings.offlineNotReady'); navigator.serviceWorker.ready.then(() => { offline.textContent = t('settings.offlineReady'); }); }
  }
  renderInstall();

  // ---------- Über ----------
  root.appendChild(el('h2', { text: t('settings.about') }));
  const films = await loadBuiltinFilms().catch(() => []);
  const sources = [...new Map(films.map((f) => [f.source?.title, f.source])).values()].filter(Boolean);
  root.appendChild(el('div', { class: 'card' }, [
    el('p', { text: t('settings.version', { version: appVersion }) }),
    t('settings.instructor') ? el('p', { text: t('settings.instructor') }) : null, // Kursleitung erst zeigen, wenn eingetragen
    el('p', { class: 'small', text: t('settings.license') }),
    el('details', { class: 'panel', style: 'margin-top:12px' }, [el('summary', { text: t('settings.licenses') }), el('div', { class: 'panel-body' }, [
      el('p', { class: 'small', text: t('settings.licensesText') }),
      el('p', { class: 'small muted', text: t('settings.sourcesTitle') }),
      el('ul', { class: 'small muted' }, sources.map((s) => el('li', {}, [s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.title }) : s.title, ` (${s.date})`]))),
    ])]),
  ]));

  return () => observer.disconnect();
}
