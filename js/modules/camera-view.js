// Kamera · Hauptansicht (Aufbau nach der Leinwand „focus · Kamera“): Marke, Kamera, Modi, Regler,
// „Wo finde ich was?“, einklappbar „Mehr zu …“. Die Anleitung steckt im Info-Knopf am Titel (camera.js).
import { el } from '../lib/ui.js';
import { virtualCamera } from './camera-virtual.js';
import { partFinder, partLabel, shortPart } from './camera-finder.js';
import { cameraLimits, withModel } from '../lib/camera-profile.js';

export async function init(root, ctx, { modes, devices }) {
  const { t, query } = ctx;
  // Vom Rechner („Auf meiner Kamera einstellen“): Zeit, Blende, ISO übernehmen, M oder bei zu langer Zeit Bulb
  const start = {};
  const sec = Number(query.get('seconds'));
  if (sec > 0) {
    const brand = withModel(modes.brands.find((b) => b.id === ctx.getSetting('cameraBrand', '')) || modes.brands[0], ctx.getSetting('cameraModel', ''));
    const lim = cameraLimits(ctx, modes, brand);
    start.shutter = sec;
    start.mode = sec > lim.maxShutter && lim.bulb ? 'bulb' : 'manual';
    if (Number(query.get('aperture')) > 0) start.aperture = Number(query.get('aperture'));
    if (Number(query.get('iso')) > 0) start.iso = Number(query.get('iso'));
  }
  const info = el('div', { class: 'modedial-info' });
  const dialNote = el('p', { class: 'notice small', hidden: true });
  const tip = el('div', { class: 'notice small' });
  const layoutNote = el('p', { class: 'muted small' });
  const moreSummary = el('summary');
  const cam = el('div');
  root.appendChild(cam);
  let lastMode = null, lastBrand = null, finder = null, tapped = null;
  // Angetipptes Teil: Name als Schild an der Grafik, kurze Erklärung in der Zeile unter der Kamera
  const partLine = el('p', { class: 'cam-part-line small', hidden: true, 'aria-live': 'polite' });
  const explain = (part) => {
    partLine.hidden = !part;
    partLine.replaceChildren(...(part ? [el('span', { class: 'cam-part-name', text: `${partLabel(t, part)}: ` }), shortPart(t, vc.state.brand, part, vc.state.mode)] : []));
  };
  // Teile, die den Modus wählen: Modusrad bzw. MODE-Taste, bei Zeitenrad-Kameras das Zeitenrad. Antippen = nächster Modus.
  const MODE_ORDER = ['program', 'aperturePriority', 'shutterPriority', 'manual', 'bulb'];
  const switchesMode = (id) => id === 'modeDial' || (id === 'shutterDial' && vc.state.brand.layout === 'dials');
  const showPart = (id) => {
    if (id && switchesMode(id)) {
      vc.state.mode = MODE_ORDER[(MODE_ORDER.indexOf(vc.state.mode) + 1) % MODE_ORDER.length];
      vc.redraw();
      tapped = id;
      const part = vc.dials.parts().find((p) => p.id === id);
      finder?.clear();
      vc.dials.highlight(id, part ? partLabel(t, part) : null);
      explain(part);
      return;
    }
    tapped = id && id !== tapped ? id : null;
    const part = tapped ? vc.dials.parts().find((p) => p.id === tapped) : null;
    if (tapped && !part) { tapped = null; }
    finder?.clear();
    vc.dials.highlight(part ? part.id : null, part ? partLabel(t, part) : null);
    explain(part);
  };
  const finderSlot = el('div', { class: 'finder-slot' }); // „Wo finde ich was?“ direkt unter der Kamera
  const vc = virtualCamera(cam, ctx, {
    modes, devices, start,
    afterCamera: finderSlot,
    // Kleines Rad gedreht: an der Kamera das Teil grün zeigen, mit dem man den Modus wählt
    onModeTurn: () => {
      const id = vc.state.brand.layout === 'dials' ? 'shutterDial' : 'modeDial';
      const part = vc.dials.parts().find((p) => p.id === id);
      if (!part) return;
      tapped = id; finder?.clear();
      vc.dials.highlight(id, partLabel(t, part));
      explain(part);
    },
    graphicNote: partLine,
    lightSwitch: false,
    showReadout: false,
    onPart: (id) => showPart(id),
    onChange(state) {
      if (state.mode === lastMode && state.brand === lastBrand) return;
      if (state.brand !== lastBrand) { tapped = null; partLine.hidden = true; if (finder) finder.refresh(state.brand); }
      else if (tapped) { const part = vc.dials.parts().find((p) => p.id === tapped); if (part) explain(part); } // Modus gewechselt: Erklärung passt sich an
      lastMode = state.mode; lastBrand = state.brand;
      const c = modes.concepts.find((x) => x.id === state.mode);
      moreSummary.textContent = t('camera.info.more', { mode: c.name, brand: state.brand.name });
      const note = state.brand.notes?.[state.mode];
      info.innerHTML = '';
      info.append(
        el('div', { class: 'modedial-title' }, [el('strong', { text: c.name }), c.alias ? el('span', { class: 'muted small', text: ` · ${c.alias}` }) : null]),
        el('div', { class: 'modedial-label', text: state.brand.modes[state.mode] || '–' }),
        el('div', { class: 'small' }, [el('strong', { text: `${t('learn.camera.youSet')}: ` }), c.youSet]),
        el('div', { class: 'small' }, [el('strong', { text: `${t('learn.camera.cameraSets')}: ` }), c.cameraSets]),
        note ? el('div', { class: 'muted small', style: 'margin-top:6px', text: note }) : '', // append() schreibt null sonst als Text
      );
      const dials = state.brand.dials;
      dialNote.hidden = !dials;
      if (dials) dialNote.textContent = `${t('camera.dials', { brand: state.brand.model ? `${state.brand.name} ${state.brand.model.name}` : state.brand.name })} ${dials.note || ''}${dials.confidence === 'niedrig' ? ` ${t('camera.dialsCheck')}` : ''}`;
      tip.innerHTML = '';
      tip.append(el('strong', { text: `${t('learn.camera.longExposure', { brand: state.brand.name })}: ` }), state.brand.longExposure); 
      const model = state.brand.model;
      layoutNote.textContent = model
        ? [`${model.name}.`, model.body?.note, t('camera.finder.source', { source: model.source })].filter(Boolean).join(' ')
        : modes.layouts?.[state.brand.layout] ? `${t('learn.camera.layout')}: ${modes.layouts[state.brand.layout]}` : '';
    },
  });
  finder = partFinder(ctx, { dials: vc.dials, onSelect: () => { tapped = null; partLine.hidden = true; } });
  finder.refresh(vc.state.brand);
  finderSlot.appendChild(finder.el);
  root.append(
    el('details', { class: 'panel cam-acc', dataset: { acc: 'more' } }, [moreSummary, el('div', { class: 'panel-body' }, [info, dialNote, tip, layoutNote, el('p', { class: 'muted small', style: 'margin-bottom:0', text: t('learn.camera.disclaimer') })])]),
  );
  // Bereiche unter der Kamera: immer nur einer offen, damit der geöffnete direkt unter dem Kamerabild steht
  root.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('details.cam-acc')) return;
    if (d.open) {
      for (const o of root.querySelectorAll('details.cam-acc[open]')) if (o !== d) o.open = false;
      ctx.setSetting('cameraSection', d.dataset.acc);
      requestAnimationFrame(() => d.querySelector('summary').scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    } else if (ctx.getSetting('cameraSection', 'settings') === d.dataset.acc) ctx.setSetting('cameraSection', '');
    // „Wo finde ich was?“ offen: Kamera bleibt oben stehen (CSS .cam-sticky), damit Markierung und Text zugleich sichtbar sind
    root.classList.toggle('cam-sticky', !!root.querySelector('details.cam-acc[data-acc="finder"][open]'));
  }, true); // toggle steigt nicht auf, daher in der Einfangphase
  // Schlagwort angetippt (und geöffnet): direkt unter die stehende Kamera rücken, die Erklärung steht darunter
  finderSlot.addEventListener('click', (e) => {
    const chip = e.target.closest?.('.fn-chip');
    if (!chip || chip.getAttribute('aria-pressed') !== 'true' || !root.classList.contains('cam-sticky')) return;
    requestAnimationFrame(() => {
      // Ziel: unter der Kamera an ihrer oben stehenden Stelle (sticky top + Höhe), nicht an der momentanen
      const card = root.querySelector('.camera-card');
      const dy = chip.getBoundingClientRect().top - (parseFloat(getComputedStyle(card).top) + card.offsetHeight + 8);
      if (Math.abs(dy) > 2) window.scrollBy(0, dy);
    });
  });
  const openKey = ctx.getSetting('cameraSection', 'settings');
  const first = openKey && root.querySelector(`details.cam-acc[data-acc="${openKey}"]`);
  if (first && !first.hidden) first.open = true;
  return () => {};
}
