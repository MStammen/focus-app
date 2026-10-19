# focus – Arbeitsnotizen für Claude

Begleit-App zum Fotokurs (PWA, Vanilla JS, kein Build). Auftrag: `SPEC.md` (Abschnitt 13 = spätere Ergänzungen). Stand und Verlauf: `CHANGELOG.md`. Bedienung, Inhalte pflegen: `README.md`.

## Stand (2026-10-19, Version 1.48.0)
- Alle Schritte aus SPEC 10 umgesetzt, dazu: Hauptreiter „Kamera“ ohne Unterreiter (virtuelle Kamera, „Wo finde ich was?“, Zusatztexte einklappbar; Langzeit-Assistent und Übungen vom Nutzer gestrichen), Design-System übernommen.
- Online: https://focus-fotografie.de (Website mit Code, Platzhalter noch auszufüllen) und https://focus-fotografie.de/app/ (App mit Kurs-Code). HTTPS (Let's Encrypt) und http→https-Weiterleitung aktiv.
- Offen: Website-Inhalte und Impressum/Datenschutz, Gerätetests (SPEC 11), echte Vergleichsbilder, Radbelegung Olympus/Panasonic prüfen.

## Regeln
- Jeder Reiter hat „i“ mit Kurzinfos (`titleWithInfo` in `js/lib/ui.js`, Texte `help.<reiter>` in `i18n/de.json`). Bei neuen Funktionen die Punkte dort mitpflegen.
- Reiter „Kurs“ ist gesperrt („coming soon“): `COURSE_OPEN` in `js/lib/features.js`. Freischalten nur auf Wunsch des Nutzers.
- Bei jeder Änderung an ausgelieferten Dateien: `VERSION` in `sw.js`, `APP_VERSION` in `js/app.js`, `version` in `package.json` hochzählen; neue Dateien in `PRECACHE` (`sw.js`) eintragen. Sonst sehen installierte Geräte die Änderung nicht.
- Tests: `node --test tests/` (müssen grün sein). Syntax: `node --check`.
- Texte nur in `i18n/de.json`. Farben nur über Tokens (`css/dark.css`, `css/redlight.css`). Schrift Work Sans selbst gehostet (`fonts/`).
- Akzent `#2E9E3F` (RGB 46/158/63, nah an Pantone 355 C; Vorgabe des Nutzers 2026-10-19), dazu `--accent-dark` `#1F7A2E` (Linien/Text auf Hell) und `--accent-light` `#D6EFD9` (Flächen hinter dunklem Text). Kein Bold. Touch-Ziele ≥ 48 px. Rotlicht muss funktionieren.
- Kamera-Grafik `js/lib/camera-svg.js`: nur Ansicht von hinten oben, vier Bauweisen (pasm, dials, phone, pinhole). Keine Vorderansicht. Objektiv nur angedeutet hinter dem Gehäuse (`lensBehind`, Wunsch 2026-10-16). Strichstil wie Handzeichnung (Filter `#cam-sketch`, Gestaltung am Ende von `css/base.css`), kein Blitzschuh; Sucher in der Mitte als Prismen-Kasten nach Skizze des Nutzers (parallele Kanten, Ecken exakt aufeinander). Räder/Tasten je Marke aus `body` in `data/camera-modes.json`, genauer je Modell aus `models[]` (zusammengeführt mit `withModel` in `js/lib/camera-profile.js`, Einstellung `cameraModel`). Neue Modelle nur mit Quelle aus der Herstelleranleitung; jedes Bedienteil trägt `data-part`; Antippen zeigt Namensschild (`highlight(id, name)`) und Erklärung unter der Grafik. „Wo finde ich was?“ (`js/modules/camera-finder.js`) enthält nur noch die Funktionen.
- Herstelleranleitungen liegen in `handbuecher/<marke>/` (Liste mit Quelle in `handbuecher/LIESMICH.md`), nur lokal, nie hochladen. Neue nur nach Rückfrage vom Herstellerserver laden und dort eintragen. Text ausziehen z. B. mit PDFKit (osascript JXA); Tastensymbole fehlen im Text, dann die Seite als Bild ansehen.
- Herstellerangaben nie raten: Filmdaten mit Quelle (`tools/make-films.mjs`), unsichere Kameradaten als `confidence: niedrig` markieren.
- Nutzer kommuniziert knapp auf Deutsch; Änderungen vorher kurz ankündigen, danach im Browser prüfen.

## Entwicklung und Handy-Test
- Server: Preview-Konfiguration `focus-lab-lan` (`node tools/serve.mjs 8787 --lan`). Mac-IP 192.168.178.31; iPhone (iOS 18.7) über `https://192.168.178.31:8443/` im WLAN, Dev-CA in `tools/certs/` ist dort installiert. Nicht über Mobilfunk erreichbar.
- Beim Testen im Browser vorher Service Worker abmelden und Caches löschen, sonst liefert er alte Dateien.
- iOS: Homescreen-Icon wird nie aktualisiert; Neu-Hinzufügen löscht App-Daten (vorher Einstellungen → Alles exportieren).

## Veröffentlichen
- Ziel: dogado WEB S 5.0 (oneHome, Vertrag 786949), Domain focus-fotografie.de, Ordner `focus-fotografiede`, Let's-Encrypt-Zertifikat und http→https-Weiterleitung aktiv (2026-10-15). Upload: `node tools/deploy.mjs` (Probelauf) / `--go`, rsync über SSH mit Schlüssel `~/.ssh/focus_dogado`. Nie Passwörter eingeben; Konto-Änderungen in oneHome nur nach Rückfrage.
- Zugang zur App nur mit Kurs-Code (`js/lib/access.js`, Hashes in `data/access.json`, Pflege `node tools/access-code.mjs`, danach hochladen). Code nie im Klartext ins Projekt schreiben. QR-Code mit Direktzugang (`print/qr-app-direkt.*`, Code „QR-Code“, `#k=` in `js/app.js`) – der Schlüssel steckt nur im QR-Bild.
- Aufbau online: Website aus `site/` an der Hauptadresse (mit Zugangscode, Basic Auth, `PROTECT_SITE` in `tools/build-dist.mjs`), App unter `/app/` ohne Code. `site/sw.js` ist ein Aufräum-Service-Worker für alte Besucher der Hauptadresse.
- `node tools/build-dist.mjs` → `dist/` (Website) und `dist/app/` (nur PRECACHE + sw.js). Nie den Projektordner hochladen (`tools/certs` enthält CA-Schlüssel). Prüfen mit Preview `focus-dist`.
- Code auf GitHub: privates Repository `MStammen/focus-app` (git@github.com:MStammen/focus-app.git, Zweig `main`, SSH-Schlüssel `~/.ssh/id_ed25519` als „Mac focus“ eingetragen, `core.sshCommand` gesetzt). Nach dem Hochladen einer Version committen und `git push`. `.gitignore` hält `tools/certs/`, Handbuch-PDFs, `dist/` und `.claude/settings.local.json` heraus – vor jedem Commit prüfen, dass nichts davon dabei ist.

## Design-Leinwand (Artefakt)
- Kamera-Reiter als bearbeitbarer Entwurf: https://claude.ai/artifact/7dvETQHF44ajpJUEMBXRjh (Typ Design). Der Nutzer ändert dort selbst und sagt dann „übernimm die Leinwand“: `project/Main.dc.html` frisch lesen, mit dem vorigen Stand vergleichen, Unterschiede in die App übernehmen. Kamera-Grafik dort ist ein hochgeladenes Bild.

## Design-System (Artefakt)
- https://claude.ai/artifact/KfvmErazerKLn47PmNV3Et (Typ Design System, Dateien unter `project/`). Vor jedem Veröffentlichen `project/design-system.json` frisch lesen und `lastChange` setzen; der Nutzer ändert dort auch selbst (z. B. Akzentfarbe).
- Baustein `Camera` bündelt `js/core/exposure.js` + `js/lib/camera-svg.js` als `components/Camera/camera.js`; nach Änderungen an der Kamera neu bündeln.

## Kamera-Skizzenblock (Artefakt)
- https://claude.ai/artifact/UvRuB587kX5XcPcAEckgGt — Malfläche über der echten Kamera-Grafik (Dateien `js/lib/camera-svg.js`, `camera-profile.js`, `js/core/exposure.js`, `data/camera-modes.json` mitveröffentlicht, Kamera-CSS aus `css/base.css` herausgezogen). Quelle der Seite im Scratchpad; bei Kamera-Änderungen `camera.css` neu aus `css/base.css` ziehen (alle Zeilen, die mit `.camera-svg` oder `.cam-` beginnen) und mit `camera-svg.js` neu veröffentlichen.
- Der Nutzer zeichnet und tippt „Für Claude speichern“: Bild als Asset, Eintrag in Sammlung `skizzen` (`bild` = Asset-ID, `notiz`, `marke`, `modell`, `kamera`, `erstellt`). Abholen: `ArtifactData` list `skizzen`, dann `Artifact` read mit `path` = Asset-ID und das Bild ansehen.
