// Winziger statischer Server für die lokale Entwicklung. Kein Teil der App.
//
//   node tools/serve.mjs            → http://localhost:8787  (nur dieser Rechner)
//   node tools/serve.mjs --lan      → zusätzlich im WLAN: http://<IP>:8788 und, wenn
//                                     tools/certs/server.{key,crt} vorhanden sind, https://<IP>:8443
//
// Handys brauchen https für Kamera und Service Worker. Dafür einmal das CA-Zertifikat
// tools/certs/focuslab-ca.crt auf dem Handy installieren (Download unter http://<IP>:8788/ca.crt).

import { createServer as createHttp } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', process.argv.includes('--dist') ? 'dist' : '');
const CERT_DIR = join(ROOT, 'tools', 'certs');
const args = process.argv.slice(2);
const LAN = args.includes('--lan');
const PORT = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 8787);
const LAN_HTTP_PORT = PORT + 1;
const LAN_HTTPS_PORT = 8443;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.crt': 'application/x-x509-ca-cert',
};

async function handler(req, res) {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (LAN && !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '')) {
      console.log(`[${new Date().toLocaleTimeString('de-DE')}] ${req.socket.remoteAddress} ${path} · ${(req.headers['user-agent'] || '').slice(0, 60)}`);
    }
    if (path === '/ca.crt') {
      const ca = join(CERT_DIR, 'focuslab-ca.crt');
      if (!existsSync(ca)) { res.writeHead(404); return res.end('kein CA-Zertifikat'); }
      res.writeHead(200, { 'Content-Type': MIME['.crt'], 'Content-Disposition': 'attachment; filename="focuslab-ca.crt"' });
      return res.end(await readFile(ca));
    }
    if (path.startsWith('/tools/') || path.startsWith('/.claude/')) { res.writeHead(403); return res.end(); }
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); return res.end('404'); }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500); res.end(String(err));
  }
}

function lanAddresses() {
  return Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

createHttp(handler).listen(PORT, '127.0.0.1', () => {
  console.log(`focus Lab läuft auf http://localhost:${PORT}/`);
});

if (LAN) {
  const ips = lanAddresses();
  createHttp(handler).listen(LAN_HTTP_PORT, '0.0.0.0', () => {
    for (const ip of ips) console.log(`WLAN (ohne Kamera/Offline): http://${ip}:${LAN_HTTP_PORT}/   CA-Zertifikat: http://${ip}:${LAN_HTTP_PORT}/ca.crt`);
  });
  const key = join(CERT_DIR, 'server.key');
  const crt = join(CERT_DIR, 'server.crt');
  if (existsSync(key) && existsSync(crt)) {
    createHttps({ key: readFileSync(key), cert: readFileSync(crt) }, handler).listen(LAN_HTTPS_PORT, '0.0.0.0', () => {
      for (const ip of ips) console.log(`WLAN mit https: https://${ip}:${LAN_HTTPS_PORT}/`);
    });
  } else {
    console.log('Kein Zertifikat in tools/certs – https im WLAN nicht verfügbar.');
  }
}
