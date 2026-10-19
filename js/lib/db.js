// IndexedDB für Logbuch-Einträge mit Bildern. Einfache Promise-Hülle.
const DB_NAME = 'focuslab';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB fehlt'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function putEntry(entry) {
  return tx('entries', 'readwrite', (s) => s.put(entry)).then(() => entry);
}
export function getEntry(id) {
  return tx('entries', 'readonly', (s) => s.get(id));
}
export function deleteEntry(id) {
  return tx('entries', 'readwrite', (s) => s.delete(id));
}
export function allEntries() {
  return tx('entries', 'readonly', (s) => s.getAll()).then((list) => (list || []).sort((a, b) => b.createdAt - a.createdAt));
}
export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate();
  } catch { /* egal */ }
  return null;
}
