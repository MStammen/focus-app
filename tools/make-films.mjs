// Erzeugt data/films.json aus den Herstellerangaben. Stützpunkte werden mit core/film.js berechnet,
// damit Daten und Rechnung zusammenpassen. Aufruf: node tools/make-films.mjs
import { writeFileSync } from 'node:fs';
import { pointsFromPower, pointsFromTable, SUPPORT_TIMES } from '../js/core/film.js';

const RETRIEVED = '2026-10-13';
const THIRD = 2 ** (1 / 3);

const ILFORD = {
  title: 'HARMAN technology Ltd., Technical Information: Film Reciprocity Failure Compensation',
  url: 'https://www.ilfordphoto.com/wp/wp-content/uploads/2024/05/Reciprocity-Failure-Compensation-v2.pdf',
  date: '2023-12', retrieved: RETRIEVED,
};
const ilford = (id, name, iso, p) => ({
  id, name, maker: 'Ilford', iso, type: 'bw',
  points: pointsFromPower(p),
  model: { kind: 'power', p },
  source: ILFORD,
  note: `Herstellerformel: korrigierte Zeit = gemessene Zeit hoch ${p}. Bis 1 s keine Korrektur. Stützpunkte daraus berechnet.`,
});

const kodakTable = (id, name, iso, table, source, note) => ({
  id, name, maker: 'Kodak', iso, type: 'bw',
  points: pointsFromTable(table),
  model: { kind: 'table', table },
  source, note,
});

const kodakColor = (id, name, iso, doc) => ({
  id, name, maker: 'Kodak', iso, type: 'color',
  points: Object.fromEntries(SUPPORT_TIMES.map((t) => [t, t === 1 ? 1 : null])),
  model: { kind: 'table', table: [[1, 1]] },
  source: { title: `Kodak Alaris, Technical Data ${doc}`, url: `https://www.kodakprofessional.com/sites/default/files/2025-07/${doc.toLowerCase().replace('-', '')}.pdf`, date: '2025-01', retrieved: RETRIEVED },
  note: 'Hersteller: bis 1 s keine Korrektur, für längere Zeiten eigene Tests. Keine Herstellerdaten über 1 s – Lücke, eigene Werte eintragen. Farbfilm: bei langen Zeiten Farbverschiebung möglich.',
});

const foma = (id, name, iso, table, date) => ({
  id, name, maker: 'Foma', iso, type: 'bw',
  points: pointsFromTable(table),
  model: { kind: 'table', table },
  source: { title: `Foma Bohemia, Datenblatt ${name} (Schwarzschild effect)`, url: 'https://www.foma.cz/en/', date, retrieved: RETRIEVED },
  note: 'Herstellertabelle: Verlängerungsfaktor bei 1, 10 und 100 s. Über 100 s keine Herstellerdaten. Anwender berichten, dass die Tabelle eher zu viel Korrektur gibt.',
});

const films = [
  ilford('ilford-hp5-plus', 'Ilford HP5 Plus', 400, 1.31),
  ilford('ilford-fp4-plus', 'Ilford FP4 Plus', 125, 1.26),
  ilford('ilford-delta-100', 'Ilford Delta 100 Professional', 100, 1.26),
  ilford('ilford-delta-400', 'Ilford Delta 400 Professional', 400, 1.41),
  ilford('ilford-pan-f-plus', 'Ilford Pan F Plus', 50, 1.33),

  kodakTable('kodak-tri-x-400', 'Kodak Tri-X 400', 400, [[1, 2], [10, 50], [100, 1200]],
    { title: 'Kodak Alaris, Technical Data F-4017 (Tri-X 320 and 400)', url: 'https://kodakprofessional.com/sites/default/files/wysiwyg/film/f4017_trix_320400.pdf', date: '2021-10', retrieved: RETRIEVED },
    'Herstellertabelle: 1 s → 2 s (+1 Stufe), 10 s → 50 s (+2), 100 s → 1200 s (+3); dazu Entwicklung um 10/20/30 % kürzen. Zwischenwerte log-log interpoliert, über 100 s keine Herstellerdaten.'),
  kodakTable('kodak-t-max-100', 'Kodak T-Max 100', 100, [[1, THIRD], [10, 15], [100, 200]],
    { title: 'Kodak Alaris, Technical Data F-4016 (T-Max 100)', url: 'https://mail.kennethleegallery.com/pdf/TMax100.pdf', date: '2016-02', retrieved: RETRIEVED },
    'Herstellertabelle: 1 s → +⅓ Stufe, 10 s → 15 s (+½), 100 s → 200 s (+1). Keine Entwicklungsanpassung. Über 100 s keine Herstellerdaten.'),
  kodakTable('kodak-t-max-400', 'Kodak T-Max 400', 400, [[1, 1], [10, 10 * THIRD], [100, 300]],
    { title: 'Kodak, Technical Data F-4043 (T-Max 400, Emulsion ab 2007)', url: 'https://www.freestylephoto.com/pdf/product_pdfs/kodak/Kodak_Tmax400.pdf', date: '2007-10', retrieved: RETRIEVED },
    'Herstellertabelle: 1 s keine Korrektur, 10 s → +⅓ Stufe, 100 s → 300 s (+1½). Keine Entwicklungsanpassung. Über 100 s keine Herstellerdaten.'),

  kodakColor('kodak-portra-160', 'Kodak Portra 160', 160, 'E-4051'),
  kodakColor('kodak-portra-400', 'Kodak Portra 400', 400, 'E-4050'),
  kodakColor('kodak-ektar-100', 'Kodak Ektar 100', 100, 'E-4046'),

  foma('fomapan-100', 'Fomapan 100 Classic', 100, [[0.5, 0.5], [1, 2], [10, 80], [100, 1600]], '2010'),
  foma('fomapan-200', 'Fomapan 200 Creative', 200, [[0.5, 0.5], [1, 3], [10, 90], [100, 1800]], '2008'),
  foma('fomapan-400', 'Fomapan 400 Action', 400, [[0.5, 0.5], [1, 1.5], [10, 60], [100, 800]], '2010'),

  {
    id: 'fuji-acros-ii', name: 'Fujifilm Neopan 100 Acros II', maker: 'Fujifilm', iso: 100, type: 'bw',
    points: Object.fromEntries(SUPPORT_TIMES.map((t) => [t, t < 120 ? t : Number((t * Math.SQRT2).toPrecision(6))])),
    model: { kind: 'steps', steps: [[0, 120, 0], [120, 1000, 0.5]] },
    source: { title: 'Fujifilm, Datenblatt NEOPAN 100 ACROS II (135)', url: 'https://www.freestylephoto.com/static/pdf/product_pdf/fujifilm/NEOPAN_100_ACROSII_(135)_data_sheet.pdf', date: 'undatiert', retrieved: RETRIEVED },
    note: 'Hersteller: unter 120 s keine Korrektur, 120 bis 1000 s +½ Stufe. Praktisch kein Schwarzschild-Effekt – gutes Lehrbeispiel. Über 1000 s keine Herstellerdaten.',
  },
];

const out = {
  schema: 1,
  kind: 'focuslab-films',
  updated: RETRIEVED,
  supportTimes: SUPPORT_TIMES,
  description: 'Schwarzschild-Korrektur: Stützpunkte gemessene Sekunden → korrigierte Sekunden. null = keine Herstellerdaten (Lücke). Quellen je Film, Stand siehe source.date.',
  films,
};
writeFileSync(new URL('../data/films.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`geschrieben: data/films.json (${films.length} Filme)`);
