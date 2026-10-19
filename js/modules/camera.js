// Hauptreiter „Kamera“: virtuelle Kamera der eigenen Marke mit Livebild und „Wo finde ich was?“.
// Ältere Adressen (#/camera/long, #/camera/tasks) landen ebenfalls hier.
import { el, titleWithInfo } from '../lib/ui.js';
import { loadCameraModes } from '../lib/camera-profile.js';

export async function init(root, ctx) {
  const { t } = ctx;
  // Titel mit Info-Knopf: die wichtigsten Infos kurz, die App merkt sich offen/zu
  const head = titleWithInfo(ctx, { title: t('camera.title'), key: 'camera' });
  root.append(head.row, head.box);
  const body = el('div');
  root.appendChild(body);
  try {
    const [modes, devices] = await Promise.all([
      loadCameraModes(),
      fetch('./data/devices.json').then((r) => (r.ok ? r.json() : { devices: [] })).catch(() => ({ devices: [] })),
    ]);
    return (await import('./camera-view.js')).init(body, ctx, { modes, devices: devices.devices || [] });
  } catch (err) {
    console.error(err);
    body.appendChild(el('p', { class: 'notice', text: t('learn.loadError') }));
  }
  return () => {};
}
