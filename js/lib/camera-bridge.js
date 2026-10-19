// Brücke von den Rechnern zur eigenen Kamera: Hinweise zu ihren Grenzen und „Auf meiner Kamera einstellen“.
import { el, button } from './ui.js';
import { loadCameraModes, cameraLimits, currentBrand, checkLimits } from './camera-profile.js';

export function cameraBridge(ctx) {
  const box = el('div', { class: 'limit-notes' });
  let modes = null;
  let last = null;
  loadCameraModes().then((m) => { modes = m; if (last) update(last); }).catch(() => {});
  function update(v) {
    last = v;
    box.innerHTML = '';
    if (modes) {
      const brand = currentBrand(ctx, modes);
      if (brand) {
        const lim = cameraLimits(ctx, modes, brand);
        for (const w of checkLimits(lim, v)) box.appendChild(el('p', { class: 'notice small', text: ctx.t(`camera.limits.${w.key}`, w.vars) }));
      }
    }
    if (v.seconds >= 1) {
      const q = new URLSearchParams({ seconds: String(Math.round(v.seconds * 100) / 100) });
      if (v.aperture) q.set('aperture', String(v.aperture));
      if (v.iso) q.set('iso', String(Math.round(v.iso)));
      box.appendChild(button(ctx.t('camera.onMyCamera'), { block: true, onClick: () => ctx.navigate(`camera?${q}`) }));
    }
  }
  return { el: box, update };
}
