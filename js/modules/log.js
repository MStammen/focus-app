// Logbuch: Einträge aus Aufnahme, Timer und von Hand. Liste, Detail, Bearbeiten, Löschen, Export/Import.
import { el, button, fmtShutter, fmtAperture, fmtNum, numberField, downloadText, titleWithInfo } from '../lib/ui.js';
import { cleanEntryNumbers, checkEntryInput } from '../core/entry.js';
import { putEntry, getEntry, deleteEntry, allEntries, newId, storageEstimate } from '../lib/db.js';
import { shareOrDownload, timestampName } from '../lib/image.js';
import { getAllFilms } from '../lib/films-store.js';

const CAMERA_TYPES = ['phone', 'digital', 'film', 'pinhole'];
const SOURCES = ['capture', 'timer', 'manual'];
const WARN_BYTES = 200 * 1024 * 1024;

function fmtDate(ts) {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtBytes(b) {
  if (b >= 1024 * 1024) return `${fmtNum(b / 1024 / 1024, 1)} MB`;
  if (b >= 1024) return `${fmtNum(b / 1024, 0)} kB`;
  return `${b} B`;
}
function toLocalInput(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function init(root, ctx) {
  const { t, query } = ctx;
  const urls = [];
  const objectUrl = (blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; };

  const head = titleWithInfo(ctx, { title: t('nav.log'), key: 'log' });
  root.append(head.row, head.box);
  const body = el('div');
  root.appendChild(body);

  if (query.get('entry')) await showDetail(query.get('entry'));
  else if (query.get('edit')) await showForm(await getEntry(query.get('edit')));
  else if (query.get('new')) await showForm(prefillFromQuery());
  else await showList();

  function prefillFromQuery() {
    const shutter = parseFloat(query.get('shutter'));
    return {
      id: newId(), createdAt: Date.now(), source: SOURCES.includes(query.get('source')) ? query.get('source') : 'manual',
      cameraType: 'digital', aperture: null, shutter: shutter > 0 ? shutter : null, iso: null, film: '', nd: null, note: '',
      frames: Number(query.get('frames')) > 1 ? Number(query.get('frames')) : null,
    };
  }

  // ---------- Liste ----------
  async function showList() {
    body.innerHTML = '';
    const entries = await allEntries();
    const bar = el('div', { class: 'btn-row', style: 'margin:0 0 12px' }, [
      button(t('log.new'), { primary: true, onClick: () => showForm(prefillFromQuery()) }),
      button(t('log.exportJson'), { onClick: () => exportJson(entries) }),
      button(t('log.exportCsv'), { onClick: () => exportCsv(entries) }),
      importButton(),
    ]);
    body.appendChild(bar);

    const bytes = entries.reduce((s, e) => s + (e.image?.size || 0) + (e.thumb?.size || 0), 0);
    const est = await storageEstimate();
    const storageLine = el('p', { class: `small ${bytes > WARN_BYTES ? 'notice' : 'muted'}`, text:
      t('log.storage', { n: entries.length, size: fmtBytes(bytes) }) + (est?.quota ? ` · ${t('log.quota', { used: fmtBytes(est.usage || 0), quota: fmtBytes(est.quota) })}` : '') + (bytes > WARN_BYTES ? ` ${t('log.storageWarning')}` : '') });
    body.appendChild(storageLine);

    if (entries.length === 0) { body.appendChild(el('div', { class: 'placeholder', text: t('log.empty') })); return; }
    const list = el('div', { class: 'log-list' });
    for (const e of entries) list.appendChild(listItem(e));
    body.appendChild(list);
  }

  function summaryLine(e) {
    const parts = [];
    if (e.aperture > 0) parts.push(fmtAperture(e.aperture));
    if (e.shutter > 0) parts.push(fmtShutter(e.shutter));
    if (e.iso > 0) parts.push(`ISO ${Math.round(e.iso)}`);
    if (e.film) parts.push(e.film);
    if (e.nd) parts.push(`ND ${fmtNum(e.nd, 1)} ${t('common.stops')}`);
    if (e.capture) parts.push(`${t(`capture.modes.${e.capture.mode}.name`)} · ${e.capture.frames} ${t('capture.meta.framesShort')}`);
    return parts.join(' · ');
  }

  function listItem(e) {
    const item = el('a', { class: 'log-item', href: `#/log?entry=${e.id}` });
    if (e.thumb) item.appendChild(el('img', { class: 'log-thumb', src: objectUrl(e.thumb), alt: '' }));
    else item.appendChild(el('div', { class: 'log-thumb log-thumb-empty', text: t(`log.cameraTypes.${e.cameraType}`).slice(0, 1) }));
    item.appendChild(el('div', { class: 'log-item-body' }, [
      el('div', { class: 'log-item-title', text: fmtDate(e.createdAt) }),
      el('div', { class: 'small', text: summaryLine(e) || '–' }),
      el('div', { class: 'muted small', text: `${t(`log.sources.${e.source}`)} · ${t(`log.cameraTypes.${e.cameraType}`)}${e.note ? ' · ' + e.note : ''}` }),
    ]));
    return item;
  }

  // ---------- Detail ----------
  async function showDetail(id) {
    const e = await getEntry(id);
    body.innerHTML = '';
    if (!e) { body.appendChild(el('p', { class: 'notice', text: t('log.notFound') })); body.appendChild(button(t('log.back'), { onClick: () => ctx.navigate('log') })); return; }
    if (e.image) body.appendChild(el('img', { class: 'log-image', src: objectUrl(e.image), alt: '' }));
    const rows = [
      [t('log.fields.date'), fmtDate(e.createdAt)],
      [t('log.fields.source'), t(`log.sources.${e.source}`)],
      [t('log.fields.cameraType'), t(`log.cameraTypes.${e.cameraType}`)],
      [t('common.aperture'), e.aperture ? fmtAperture(e.aperture) : '–'],
      [t('common.shutter'), e.shutter ? fmtShutter(e.shutter) : '–'],
      [t('common.iso'), e.iso ? `ISO ${Math.round(e.iso)}` : '–'],
      [t('log.fields.film'), e.film || '–'],
      [t('log.fields.nd'), e.nd ? `${fmtNum(e.nd, 1)} ${t('common.stops')}` : '–'],
    ];
    if (e.frames > 1) rows.push([t('log.fields.frames'), String(e.frames)]);
    if (e.capture) {
      const c = e.capture;
      rows.push([t('capture.meta.mode'), t(`capture.modes.${c.mode}.name`)]);
      rows.push([t('capture.meta.frames'), `${c.frames} · ${fmtNum(c.fps, 1)} fps`]);
      rows.push([t('capture.meta.resolution'), `${c.width} × ${c.height}`]);
      if (c.device?.exposureTime > 0) rows.push([t('capture.meta.exposureTime'), fmtShutter(c.device.exposureTime / 10000)]);
      if (c.device?.iso > 0) rows.push([t('capture.meta.iso'), `ISO ${Math.round(c.device.iso)}`]);
      if (c.equivalent) rows.push([t('capture.meta.equivalent'), c.equivalent]);
      if (c.shake) rows.push([t('capture.meta.motion'), c.shake.shaky ? t('capture.meta.shaky', { peak: fmtNum(c.shake.peak, 1) }) : t('capture.meta.steady')]);
    }
    body.appendChild(el('div', { class: 'card' }, [el('table', { class: 'stops-table' }, rows.map(([k, v]) => el('tr', {}, [el('td', { text: k }), el('td', { text: v })])))]));
    if (e.note) body.appendChild(el('div', { class: 'card' }, [el('p', { style: 'margin:0', text: e.note })]));
    body.appendChild(el('div', { class: 'btn-row' }, [
      button(t('log.edit'), { primary: true, onClick: () => showForm(e) }),
      e.image ? button(t('log.saveImage'), { onClick: async () => { const r = await shareOrDownload(e.image, timestampName('focus')); if (r === 'downloaded') ctx.showToast(t('capture.downloaded')); } }) : null,
      button(t('common.delete'), { danger: true, onClick: async () => { if (!confirm(t('log.deleteConfirm'))) return; await deleteEntry(e.id); ctx.showToast(t('log.deleted')); ctx.navigate('log'); } }),
      button(t('log.back'), { onClick: () => ctx.navigate('log') }),
    ]));
  }

  // ---------- Formular ----------
  async function showForm(e) {
    body.innerHTML = '';
    const isNew = !(await getEntry(e.id));
    body.appendChild(el('h2', { text: isNew ? t('log.new') : t('log.edit'), style: 'margin-top:0' }));
    const date = el('input', { class: 'input', type: 'datetime-local', value: toLocalInput(e.createdAt) });
    const source = selectField(t('log.fields.source'), SOURCES.map((s) => [s, t(`log.sources.${s}`)]), e.source);
    const cameraType = selectField(t('log.fields.cameraType'), CAMERA_TYPES.map((s) => [s, t(`log.cameraTypes.${s}`)]), e.cameraType);
    const aperture = numberField({ label: t('common.aperture'), value: e.aperture ?? '', min: 0.5, stepAttr: '0.1' });
    const shutter = numberField({ label: `${t('common.shutter')} (s)`, value: e.shutter != null ? Math.round(e.shutter * 10000) / 10000 : '', min: 0, stepAttr: 'any' });
    const shutterHint = el('span', { class: 'muted small' });
    const updateShutterHint = () => { const v = shutter.getValue(); shutterHint.textContent = v > 0 ? fmtShutter(v) : t('log.shutterHint'); };
    shutter.input.addEventListener('input', updateShutterHint); updateShutterHint();
    const iso = numberField({ label: t('common.iso'), value: e.iso ?? '', min: 1, stepAttr: '1', inputmode: 'numeric' });
    const films = await getAllFilms().catch(() => []);
    const filmInput = el('input', { class: 'input', type: 'text', value: e.film || '', list: 'log-films' });
    const dataList = el('datalist', { id: 'log-films' }, films.map((f) => el('option', { value: f.name })));
    const nd = numberField({ label: `${t('log.fields.nd')} (${t('common.stops')})`, value: e.nd ?? '', min: 0, stepAttr: '0.1' });
    const frames = numberField({ label: t('log.fields.frames'), value: e.frames ?? '', min: 1, stepAttr: '1', inputmode: 'numeric' });
    const note = el('textarea', { class: 'input textarea', rows: 3 });
    note.value = e.note || '';

    body.appendChild(el('div', { class: 'card' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('log.fields.date') }), date]),
      el('div', { class: 'fields', style: 'margin-top:12px' }, [source.field, cameraType.field]),
      el('div', { class: 'fields', style: 'margin-top:12px' }, [aperture.field, shutter.field, iso.field]),
      el('div', { style: 'margin:4px 0 0' }, [shutterHint]),
      el('div', { class: 'fields', style: 'margin-top:12px' }, [
        el('label', { class: 'field' }, [el('span', { class: 'field-label', text: t('log.fields.film') }), filmInput, dataList]),
        nd.field, frames.field,
      ]),
      el('label', { class: 'field', style: 'margin-top:12px' }, [el('span', { class: 'field-label', text: t('log.fields.note') }), note]),
    ]));
    if (e.image) body.appendChild(el('p', { class: 'muted small', text: t('log.imageKept') }));
    body.appendChild(el('div', { class: 'btn-row' }, [
      button(t('common.save'), { primary: true, onClick: async () => {
        const check = checkEntryInput({ aperture: aperture.getValue(), shutter: shutter.getValue(), iso: iso.getValue(), nd: nd.getValue(), frames: frames.getValue(), film: filmInput.value, note: note.value, hasImage: !!e.image });
        if (!check.ok) { ctx.showToast(t(check.reason === 'empty' ? 'log.emptyEntry' : 'log.invalidValues')); return; }
        const ts = Date.parse(date.value);
        const entry = {
          ...e,
          createdAt: Number.isFinite(ts) ? ts : e.createdAt,
          source: source.select.value, cameraType: cameraType.select.value,
          aperture: aperture.getValue() || null, shutter: shutter.getValue() || null, iso: iso.getValue() || null,
          film: filmInput.value.trim(), nd: nd.getValue() || null, frames: frames.getValue() || null, note: note.value.trim(),
        };
        await putEntry(cleanEntryNumbers(entry));
        ctx.showToast(t('log.saved'));
        ctx.navigate(`log?entry=${entry.id}`);
      } }),
      button(t('common.cancel'), { onClick: () => (isNew ? ctx.navigate('log') : ctx.navigate(`log?entry=${e.id}`)) }),
    ]));
  }

  function selectField(label, options, value) {
    const select = el('select', { class: 'select' }, options.map(([v, text]) => el('option', { value: v, text, selected: v === value })));
    return { select, field: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), select]) };
  }

  // ---------- Export / Import ----------
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
  }
  async function dataUrlToBlob(url) {
    const res = await fetch(url);
    return res.blob();
  }

  async function exportJson(entries) {
    const out = [];
    for (const e of entries) {
      out.push({ ...e, image: e.image ? await blobToDataUrl(e.image) : null, thumb: e.thumb ? await blobToDataUrl(e.thumb) : null });
    }
    downloadText(timestampName('focus-logbuch', 'json'), JSON.stringify({ schema: 1, kind: 'focus-log', exportedAt: new Date().toISOString(), entries: out }, null, 1));
    ctx.showToast(t('log.exported'));
  }

  function exportCsv(entries) {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['datum', 'quelle', 'kameratyp', 'blende', 'zeit_s', 'zeit', 'iso', 'film', 'nd_stufen', 'bilder', 'modus', 'notiz'];
    const lines = [head.join(';')];
    for (const e of entries) {
      lines.push([
        new Date(e.createdAt).toISOString(), e.source, e.cameraType, e.aperture ?? '', e.shutter ?? '', e.shutter ? fmtShutter(e.shutter) : '', e.iso ?? '', e.film ?? '', e.nd ?? '',
        e.capture?.frames ?? e.frames ?? '', e.capture ? e.capture.mode : '', e.note ?? '',
      ].map(esc).join(';'));
    }
    downloadText(timestampName('focus-logbuch', 'csv'), '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
    ctx.showToast(t('log.exported'));
  }

  function importButton() {
    const input = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const list = Array.isArray(data) ? data : data?.entries;
        if (!Array.isArray(list)) throw new Error(t('log.importInvalid'));
        let n = 0;
        for (const raw of list) {
          if (!raw || typeof raw !== 'object' || !raw.createdAt) continue;
          const entry = {
            id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
            createdAt: Number(raw.createdAt) || Date.now(),
            source: SOURCES.includes(raw.source) ? raw.source : 'manual',
            cameraType: CAMERA_TYPES.includes(raw.cameraType) ? raw.cameraType : 'digital',
            aperture: Number(raw.aperture) || null, shutter: Number(raw.shutter) || null, iso: Number(raw.iso) || null,
            film: typeof raw.film === 'string' ? raw.film : '', nd: Number(raw.nd) || null, frames: Number(raw.frames) || null,
            note: typeof raw.note === 'string' ? raw.note : '',
            capture: raw.capture && typeof raw.capture === 'object' ? raw.capture : undefined,
            image: typeof raw.image === 'string' && raw.image.startsWith('data:image/') ? await dataUrlToBlob(raw.image) : null,
            thumb: typeof raw.thumb === 'string' && raw.thumb.startsWith('data:image/') ? await dataUrlToBlob(raw.thumb) : null,
          };
          await putEntry(cleanEntryNumbers(entry));
          n += 1;
        }
        ctx.showToast(t('log.imported', { n }));
        await showList();
      } catch (err) {
        ctx.showToast(`${t('log.importFailed')}: ${err?.message || err}`);
      }
      input.value = '';
    });
    const btn = button(t('log.importJson'), { onClick: () => input.click() });
    btn.appendChild(input);
    return btn;
  }

  return () => { for (const u of urls) URL.revokeObjectURL(u); };
}
