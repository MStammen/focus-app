// Lädt dist/ per SFTP/rsync auf den Webspace (dogado, Plesk). Kein Passwort im Skript:
// Anmeldung über den Schlüssel ~/.ssh/focus_dogado, den der Nutzer einmal auf dem Server hinterlegt.
//
//   node tools/deploy.mjs                 → baut dist/ und zeigt, was übertragen würde (Probelauf)
//   node tools/deploy.mjs --go            → überträgt wirklich
//   DEPLOY_DIR=httpdocs node tools/deploy.mjs --go   → anderer Zielordner auf dem Server (Standard: focus-fotografiede)
//
// Im Zielordner werden nur Dateien gelöscht, die zur App gehören und nicht mehr in dist/ stehen
// (rsync --delete), deshalb nie auf einen Ordner mit anderen Inhalten zeigen lassen.

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.DEPLOY_HOST || 'h786949@web204.dogado.net';
const DIR = process.env.DEPLOY_DIR || 'focus-fotografiede'; // Plesk-Ordner der Domain focus-fotografie.de
const KEY = process.env.DEPLOY_KEY || join(homedir(), '.ssh', 'focus_dogado');
const go = process.argv.includes('--go');

if (!/^[A-Za-z0-9._/-]+$/.test(DIR) || DIR.startsWith('/') || DIR.includes('..')) throw new Error(`Zielordner ungültig: ${DIR}`);
execFileSync('node', [join(ROOT, 'tools', 'build-dist.mjs')], { stdio: 'inherit' });
const ssh = `ssh -i ${KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
// cgi-bin und .well-known (Let's-Encrypt-Prüfung) gehören dem Server und bleiben unangetastet
const args = ['-rlptvz', '--delete', '--exclude=/cgi-bin/', '--exclude=/.well-known/', '-e', ssh, ...(go ? [] : ['--dry-run']), `${join(ROOT, 'dist')}/`, `${HOST}:${DIR}/`];
console.log(go ? `Übertrage nach ${HOST}:${DIR}/ …` : `Probelauf (nichts wird übertragen). Für echt: --go`);
execFileSync('rsync', args, { stdio: 'inherit' });
console.log(go ? 'Fertig.' : 'Probelauf fertig.');
