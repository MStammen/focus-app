// Baut den Veröffentlichungsordner dist/ (und dist.zip) für statisches Hosting.
//
//   node tools/build-dist.mjs
//
// Aufbau: dist/ = Kurs-Website aus site/ (Startseite, Impressum, Datenschutz, Aufräum-sw.js),
//         dist/app/ = die App: genau die Dateien aus der PRECACHE-Liste in sw.js, dazu sw.js und die
//         Schriftlizenz. Alles andere (tools/ mit den Zertifikatsschlüsseln, tests/, SPEC …)
//         bleibt draußen. Bricht ab, wenn eine gelistete Datei fehlt.

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const APP = join(DIST, 'app');
const SITE_FILES = ['index.html', 'impressum.html', 'datenschutz.html', 'site.css', 'sw.js'];

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const block = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!block) throw new Error('PRECACHE-Liste in sw.js nicht gefunden');
const listed = [...block[1].matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
const files = [...new Set([...listed, 'sw.js', 'fonts/OFL.txt'])];

const missing = files.filter((f) => !existsSync(join(ROOT, f)));
if (missing.length) throw new Error(`Fehlende Dateien: ${missing.join(', ')}`);
const forbidden = files.filter((f) => /^(tools|tests|\.claude)\//.test(f) || /\.(key|crt|pem)$/.test(f));
if (forbidden.length) throw new Error(`Darf nicht veröffentlicht werden: ${forbidden.join(', ')}`);

rmSync(DIST, { recursive: true, force: true });
for (const f of files) {
  mkdirSync(dirname(join(APP, f)), { recursive: true });
  copyFileSync(join(ROOT, f), join(APP, f));
}
for (const f of SITE_FILES) {
  if (!existsSync(join(ROOT, 'site', f))) throw new Error(`Website-Datei fehlt: site/${f}`);
  copyFileSync(join(ROOT, 'site', f), join(DIST, f));
}

// Kopfzeilen für Netlify und Cloudflare Pages. Der Service Worker und die Startseite
// dürfen nicht im Browser-Cache hängen bleiben, sonst kommen Updates nicht an.
writeFileSync(join(DIST, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(self), microphone=(), geolocation=()

/sw.js
  Cache-Control: no-cache

/
  Cache-Control: no-cache

/app/sw.js
  Cache-Control: no-cache

/app/index.html
  Cache-Control: no-cache

/app/
  Cache-Control: no-cache

/app/manifest.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
  Cache-Control: no-cache
`);

// Dasselbe für Apache-Webspace (z. B. dogado/Plesk): .htaccess
writeFileSync(join(DIST, '.htaccess'), `# focus: Service Worker, Startseite und Manifest nicht zwischenspeichern, sonst kommen Updates nicht an
<IfModule mod_headers.c>
  <FilesMatch "^(sw\\.js|index\\.html|manifest\\.webmanifest)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  # Skripte, Stile, Daten und Texte vor jeder Nutzung kurz prüfen (Antwort 304, wenn unverändert)
  <FilesMatch "\\.(js|css|json|md|html)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "no-referrer"
  Header set Permissions-Policy "camera=(self), microphone=(), geolocation=()"
</IfModule>
AddType application/manifest+json .webmanifest
AddType font/woff2 .woff2
AddType text/markdown .md
Options -Indexes
`);

// Website mit Zugangscode schützen (Vorschau, solange Platzhalter drinstehen). Der Code liegt als
// Hash in .htpasswd-focus im Home-Verzeichnis auf dem Server, nicht im Projekt. Zum Abschalten
// PROTECT_SITE auf false setzen, neu bauen und hochladen.
const PROTECT_SITE = true;
const HTPASSWD = '/var/www/vhosts/h786949.web204.dogado.net/.htpasswd-focus';
if (PROTECT_SITE) {
  writeFileSync(join(DIST, '.htaccess'), readFileSync(join(DIST, '.htaccess'), 'utf8') + `
# Zugangsschutz für die Website (Benutzer und Code in ${HTPASSWD})
AuthType Basic
AuthName "focus - Vorschau"
AuthUserFile ${HTPASSWD}
Require valid-user
# Der Aufräum-Service-Worker muss ohne Code erreichbar sein, sonst bleibt bei alten Besuchern die App hängen
<Files "sw.js">
  Require all granted
</Files>
`);
  // Die App unter /app/ bleibt offen: Mit Passwortschutz lässt sie sich auf dem Handy nicht installieren
  writeFileSync(join(APP, '.htaccess'), `# App ohne Zugangscode (überschreibt den Schutz der Website)
Require all granted
`);
}

const version = sw.match(/const VERSION = '([^']+)'/)?.[1] || '?';
rmSync(join(ROOT, 'dist.zip'), { force: true });
execFileSync('zip', ['-qr', join(ROOT, 'dist.zip'), '.'], { cwd: DIST });
console.log(`dist/ gebaut: Website (${SITE_FILES.length} Dateien) + app/ (${files.length} Dateien, Version ${version}) + _headers/.htaccess. Zip: dist.zip`);
