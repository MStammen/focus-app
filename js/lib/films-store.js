// Filme laden (eingebaute aus data/films.json, eigene aus localStorage) und Überschreibungen verwalten.
import { applyOverrides, availablePoints } from '../core/film.js';

const CUSTOM_KEY = 'focuslab.films.custom';
const OVERRIDE_KEY = 'focuslab.films.overrides';
let builtinPromise = null;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* voll */ }
}

export function loadBuiltinFilms() {
  if (!builtinPromise) {
    builtinPromise = fetch('./data/films.json').then((r) => {
      if (!r.ok) throw new Error(`films.json: ${r.status}`);
      return r.json();
    }).then((data) => data.films.map((f) => ({ ...f, custom: false })));
  }
  return builtinPromise;
}

export function getCustomFilms() { return read(CUSTOM_KEY, []); }
export function saveCustomFilm(film) {
  const list = getCustomFilms().filter((f) => f.id !== film.id);
  list.push({ ...film, custom: true, points: Object.fromEntries(availablePoints(film.points)) });
  write(CUSTOM_KEY, list);
  return film;
}
export function deleteCustomFilm(id) {
  write(CUSTOM_KEY, getCustomFilms().filter((f) => f.id !== id));
}

export function getOverrides(filmId) { return read(OVERRIDE_KEY, {})[filmId] || null; }
export function setOverrides(filmId, overrides) {
  const all = read(OVERRIDE_KEY, {});
  if (!overrides || Object.keys(overrides).length === 0) delete all[filmId];
  else all[filmId] = overrides;
  write(OVERRIDE_KEY, all);
}

/** Alle Filme, eingebaute mit angewendeten Überschreibungen, dann eigene. */
export async function getAllFilms() {
  const builtin = await loadBuiltinFilms();
  return [
    ...builtin.map((f) => applyOverrides(f, getOverrides(f.id))),
    ...getCustomFilms(),
  ];
}

export function newCustomId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
