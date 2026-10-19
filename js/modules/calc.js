// Rechner: Umschalter oben, vier Unterseiten als eigene Module (calc-*.js).
import { el, segmented, titleWithInfo } from '../lib/ui.js';

const PAGES = ['exposure', 'nd', 'pinhole', 'film'];

export async function init(root, ctx) {
  const { t, subpath } = ctx;
  const page = PAGES.includes(subpath[0]) ? subpath[0] : 'exposure';

  const head = titleWithInfo(ctx, { title: t('calc.title'), key: 'calc' });
  root.append(head.row, head.box);
  root.appendChild(segmented({
    ariaLabel: t('calc.title'),
    active: page,
    items: PAGES.map((id) => ({ id, label: t(`calc.tabs.${id}`), href: `#/calc/${id}` })),
  }));

  const container = el('div', { class: 'calc-page' });
  root.appendChild(container);
  const mod = await import(`./calc-${page}.js`);
  return mod.init(container, ctx);
}
