# focus

Begleit-App für einen eintägigen Fotokurs zu Licht, Blende und Camera Obscura. Progressive Web App ohne Framework und ohne Build-Schritt. Vollständiger Auftrag in `SPEC.md`, Stand der Umsetzung in `CHANGELOG.md`.

## Tests

```
node --test tests/
```

## Lokal starten

```
node tools/serve.mjs
```

Öffnet unter http://localhost:8787/. Für die Nutzung auf dem Handy muss die App über `https://` liegen (Kamera-API und Service Worker).

## Veröffentlichen

`node tools/build-dist.mjs` baut den Ordner `dist/` und `dist.zip`. Darin stehen nur die Dateien aus der PRECACHE-Liste, dazu `sw.js`, die Schriftlizenz und `_headers` (Cache-Regeln für Netlify und Cloudflare Pages). Nie den ganzen Projektordner hochladen: `tools/certs/` enthält den privaten Schlüssel der Test-Zertifizierungsstelle.

Netlify Drop: app.netlify.com/drop öffnen, anmelden, den Ordner `dist/` auf die Seite ziehen. Für ein Update dieselbe Seite in Netlify öffnen (Deploys) und den neuen `dist/`-Ordner dort hineinziehen; die Adresse bleibt gleich. Jeder andere HTTPS-Webspace geht auch: Inhalt von `dist/` hochladen.

dogado (Webspace WEB S 5.0, Domain focus-fotografie.de): `node tools/deploy.mjs` baut `dist/` und zeigt per Probelauf, was übertragen würde; `node tools/deploy.mjs --go` lädt per rsync über SSH hoch (Server web204.dogado.net, Benutzer h786949, Zielordner `focus-fotografiede`, änderbar mit `DEPLOY_DIR`). Anmeldung über den Schlüssel `~/.ssh/focus_dogado`, der einmal mit `ssh-copy-id -i ~/.ssh/focus_dogado.pub h786949@web204.dogado.net` hinterlegt wird (dabei fragt der Server nach dem FTP-Passwort). `dist/` enthält eine `.htaccess` für Apache mit denselben Cache-Regeln wie `_headers`.

Prüfen vor dem Hochladen: `node tools/serve.mjs 8790 --dist` liefert genau `dist/` aus.

Nach jeder Änderung an Dateien, die offline verfügbar sein sollen: Datei in `PRECACHE` in `sw.js` eintragen und `VERSION` in `sw.js` sowie `APP_VERSION` in `js/app.js` hochzählen.

## Kurs-Codes für die App

QR-Code mit Direktzugang: `print/qr-app-direkt.png` / `.svg` öffnet https://focus-fotografie.de/app/ mit einem eigenen Schlüssel hinter `#k=` und schaltet ohne Eintippen frei (Eintrag „QR-Code“ in `data/access.json`, nur als Hash). Sperren, falls der QR-Code die Runde macht: `node tools/access-code.mjs off QR-Code`, dann hochladen. Auf dem iPhone hat eine zum Home-Bildschirm hinzugefügte App einen eigenen Speicher: Dort einmal den Kurs-Code eingeben.

Die App öffnet sich erst nach Eingabe eines Kurs-Codes. Codes verwalten:

```
node tools/access-code.mjs list
node tools/access-code.mjs add NEUERCODE herbst26
node tools/access-code.mjs off alle
```

Danach `node tools/deploy.mjs --go`. Ein gesperrter Code sperrt Handys beim nächsten Start mit Netz. Der QR-Code zur App liegt in `print/`.

## Website

Die Kurs-Website liegt in `site/` (`index.html`, `impressum.html`, `datenschutz.html`, `site.css`). Platzhalter stehen in Kästen mit der Klasse `todo`; wenn alle ausgefüllt sind, die Zeile `<meta name="robots" content="noindex">` aus allen drei Seiten löschen und in `tools/build-dist.mjs` `PROTECT_SITE` auf `false` setzen. Die Website nutzt Schrift und Logo aus `app/`. Hochladen wie die App mit `node tools/deploy.mjs --go`.

## Logo und Icons

Logo, Wortmarke und App-Icons kommen aus dem Logo-Paket des Kursleiters (, , ).  erzeugt nur noch Platzhalter und wird nicht mehr gebraucht.

## Filmdaten neu erzeugen

```
node tools/make-films.mjs
```

Schreibt `data/films.json` aus den Herstellerangaben in `tools/make-films.mjs`. Neue Filme dort eintragen, nicht direkt in der JSON.

## Auf dem Handy testen (gleiches WLAN)

```
node tools/serve.mjs --lan
```

Startet zusätzlich `http://<Mac-IP>:8788` und `https://<Mac-IP>:8443`. Kamera und Service Worker brauchen https, dafür liegt in `tools/certs/` eine lokale Entwicklungs-CA (mit `openssl` erzeugt, gültig bis Januar 2029, nur für diese IP).

Einmal pro Handy:

1. Im WLAN `http://<Mac-IP>:8788/ca.crt` öffnen und das Zertifikat installieren.
   - iPhone: Safari fragt „Profil laden“ → Einstellungen → „Profil geladen“ → Installieren. Danach Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen → „focus Lab Dev CA“ einschalten.
   - Android: Einstellungen → Sicherheit → Verschlüsselung & Anmeldedaten → Zertifikat installieren → CA-Zertifikat → Datei wählen.
2. `https://<Mac-IP>:8443/` öffnen, zum Homescreen hinzufügen.

Die privaten Schlüssel (`*.key`) bleiben auf dem Mac; der Server liefert nichts aus `tools/` aus. Ändert sich die IP des Macs, Zertifikat in `tools/certs/openssl-server.cnf` anpassen und neu erzeugen.

## Inhalte pflegen (ohne Code)

- Erklärkarten: `content/cards/*.md`, Reihenfolge und Grafik in `content/cards/index.json`.
- Aufgaben: `content/tasks.json`.
- Vergleichsszenen: `content/compare/<szene>/meta.json` plus Bilder, Szene in `content/compare/index.json` eintragen.
- Filme: `tools/make-films.mjs`, Geräteprofile: `data/devices.json`.

Nach jeder Änderung die neuen Dateien in `sw.js` (`PRECACHE`) ergänzen und `VERSION` hochzählen, sonst sehen installierte Geräte sie offline nicht.

## Kameramodelle ergänzen

Marken und Modelle stehen in `data/camera-modes.json`. Ein neues Modell kommt als Eintrag in `models` der Marke dazu: `id`, `name`, `source` (Anleitung des Herstellers mit Seitenzahl, ohne Quelle kein Eintrag), `body` (Lage von Modusrad, Sucher, Rädern und Tasten), `dials` (Radnamen laut Anleitung und welches Rad in A, S, M und Bulb was stellt). Dazu `sensor` mit `format` (z. B. „APS-C“), `size` und `crop` (Cropfaktor 1, 1,5, 1,6 oder 2) aus den technischen Daten des Herstellers; der Kamera-Reiter zeigt es unter der Modellwahl. Unter `functions` stehen die Angaben für „Wo finde ich was?“: `af`, `timer`, `shake` (Pflicht) und optional `afmf`, `points`, `metering`, `drive`, `quality`, `iso`, `stab`, jeweils mit `where`, `source` (Seite), `confidence` und optional `part` (Taste an der Grafik, z. B. `button:ISO`, oder `lens`). Fehlt ein optionaler Eintrag, zeigt die App einen allgemeinen Hinweis und markiert eine passende vorhandene Taste. Vorlage: ein vorhandenes Modell derselben Marke kopieren. Unsichere Angaben mit `"confidence": "mittel"` oder `"niedrig"` markieren; die App zeigt dann „bitte am Gerät prüfen“. Danach `node --test tests/` laufen lassen: Der Test prüft, ob jedes genannte Rad am Gehäuse existiert und jede Taste einen Erklärtext hat.
