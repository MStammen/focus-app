// Kurs-Codes für die Zugangssperre der App pflegen (data/access.json). Gespeichert wird nur der Hash.
//
//   node tools/access-code.mjs list                 → alle Einträge anzeigen
//   node tools/access-code.mjs add CODE [Name]      → Code hinzufügen (z. B. pro Kurstermin)
//   node tools/access-code.mjs off Name             → Code sperren (App mit diesem Code sperrt sich beim nächsten Start mit Netz)
//   node tools/access-code.mjs on Name              → wieder freigeben
//
// Danach hochladen: node tools/deploy.mjs --go (eine neue App-Version ist dafür nicht nötig).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeHash } from '../js/lib/access.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'access.json');
const data = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { info: '', codes: [] };
data.info = 'Kurs-Codes der App als SHA-256 von "focus:" + Code (Großbuchstaben). Pflege mit node tools/access-code.mjs.';
const [cmd, a, b] = process.argv.slice(2);
const save = () => writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');

if (cmd === 'add' && a) {
  const name = b || a;
  if (data.codes.some((c) => c.label === name)) throw new Error(`Name schon vergeben: ${name}`);
  data.codes.push({ label: name, sha256: await codeHash(a), active: true, added: new Date().toISOString().slice(0, 10) });
  save(); console.log(`Code „${name}“ hinzugefügt.`);
} else if ((cmd === 'off' || cmd === 'on') && a) {
  const c = data.codes.find((x) => x.label === a);
  if (!c) throw new Error(`Kein Code mit dem Namen ${a}`);
  c.active = cmd === 'on'; save(); console.log(`Code „${a}“ ${c.active ? 'freigegeben' : 'gesperrt'}.`);
} else {
  for (const c of data.codes) console.log(`${c.active === false ? 'gesperrt ' : 'aktiv    '} ${c.label}  (seit ${c.added || '?'})`);
  if (!data.codes.length) console.log('Noch keine Codes. Hinzufügen: node tools/access-code.mjs add CODE Name');
}
