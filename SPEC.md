# focus Lab – Spezifikation

Begleit-App für einen eintägigen Fotokurs zu Licht, Blende und Camera Obscura. Die App ist Werkzeug und Lernbegleiter zugleich: Im Kurs probieren Teilnehmer damit Langzeitbelichtung am Handy aus (mit Handystativ), danach nutzen sie Rechner, Timer und Lernmodule dauerhaft weiter.

Dieses Dokument ist der vollständige Auftrag. Bei Unklarheiten: nachfragen, nicht raten.

---

## 1. Rahmenbedingungen

**Plattform:** Progressive Web App. Läuft ohne Installation in Safari (iOS) und Chrome (Android), installierbar auf den Homescreen. Kein App Store.

**Technik:**
- Vanilla HTML, CSS, JavaScript (ES2020+). Kein Framework, kein Build-Schritt, damit das Projekt in fünf Jahren noch läuft. Ausnahme erlaubt: ein kleines, ungebundeltes Hilfsmodul für Routing, falls nötig – aber bevorzugt selbst geschrieben.
- Statische Dateien, Hosting auf beliebigem HTTPS-Webspace. `https://` ist Pflicht (Kamera-API und Service Worker funktionieren sonst nicht).
- Service Worker mit Cache-First-Strategie: Nach dem ersten Aufruf funktioniert alles offline, auch Rechner und Lernmodule.
- `manifest.webmanifest` mit Name, Icons (192/512 px, maskable), `display: standalone`, Theme-Farben.
- Alle Nutzerdaten (Logbuch, eigene Filme, Einstellungen) in `localStorage`/IndexedDB. Keine Server-Kommunikation, keine Analytics, keine Cookies.
- Sprache: Deutsch. Texte in einer zentralen Datei (`i18n/de.json`), damit Englisch später nachrüstbar ist.

**Gestaltung:**
- Dunkles Design als Standard (Fotografen arbeiten in der Dämmerung). Zusätzlich ein **Rotlichtmodus** (alles in Rot auf Schwarz, Helligkeit stark reduziert), per Schalter in der Kopfzeile.
- Große Bedienelemente, mindestens 48 px Touch-Ziele. Einhändig bedienbar, wichtige Knöpfe unten.
- Logo-Platzhalter oben links (Datei `assets/logo.svg`, wird später durch das focus-Logo ersetzt).
- Keine Animationen, die ablenken. Kein Onboarding-Karussell.

**Navigation:** Fünf Reiter in einer unteren Leiste: **Aufnahme · Rechner · Timer · Lernen · Logbuch**.

---

## 2. Rechenkern (`core/exposure.js`)

Alles in der App rechnet in **Lichtwerten (EV)**. Ein einziges Modul, das alle anderen importieren. Keine Modul-eigene Belichtungsmathematik.

Funktionen (reine Funktionen, mit Unit-Tests in `tests/`):

```
ev(aperture, shutterSeconds, iso)      // EV bezogen auf ISO 100: log2(N² / t) - log2(ISO/100)
shutterFor(ev, aperture, iso)
apertureFor(ev, shutterSeconds, iso)
isoFor(ev, aperture, shutterSeconds)
stopsBetween(a, b)                     // Differenz zweier Werte als Stufen (für Blende, Zeit, ISO)
nearestStandard(value, kind, step)     // rundet auf Standardreihe; kind: 'aperture'|'shutter'|'iso'; step: 1 | 1/2 | 1/3
formatShutter(seconds)                 // "1/125", "0.5\"", "30\"", "2 min 15 s"
```

Standardreihen (Drittelstufen, aus denen Halb- und Ganzstufen abgeleitet werden):
- Blende: 1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32, 36, 40, 45, 51, 57, 64, 72, 81, 90, 102, 114, 128, 144, 161, 181, 203, 228, 256 (Lochkamera braucht Werte bis weit über f/256; über f/256 nicht runden, sondern exakt anzeigen)
- Zeit: 1/8000 bis 8 h, Drittelstufen; über 30 s in Sekunden/Minuten anzeigen
- ISO: 25 bis 102400, Drittelstufen

ND-Filter-Umrechnung:
```
ndStops(filter)   // akzeptiert { stops: 10 } | { factor: 1000 } | { density: 3.0 }
                  // stops = log2(factor) = density / 0.301
```
Hinweis für die Anzeige: Handelsübliche Bezeichnungen sind ungenau (ND1000 = 9,97 Stufen, verkauft als "10 Stops"). Intern exakt rechnen, in der Anzeige auf die übliche Bezeichnung runden und die exakte Zahl kleiner darunter zeigen.

---

## 3. Modul Aufnahme (Langzeitbelichtung am Handy)

Das Herzstück für den Kurstag. Prinzip: Das Handy kann keinen Verschluss sekundenlang öffnen. Die App nimmt stattdessen den Kamerastream und **stapelt Einzelbilder** – und zeigt das offen, Bild für Bild. Das ist Absicht und Lehrinhalt, nicht Notlösung.

### 3.1 Kamerazugriff
- `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } } })`. Höchste verfügbare Auflösung nehmen, tatsächliche Auflösung anzeigen.
- Nach dem Start `track.getCapabilities()` auslesen. Wenn verfügbar, folgende Constraints anbieten (nur anzeigen, was das Gerät kann):
  - `exposureCompensation` (wichtig, siehe Modus Integrieren)
  - `exposureMode: 'manual'` + `exposureTime` (nur manche Android-Geräte)
  - `iso`
  - `focusMode: 'manual'` / Fokus sperren
  - `whiteBalanceMode: 'manual'` – Weißabgleich beim Start einfrieren, sonst wandert die Farbe während des Stapelns
- Wenn eine Fähigkeit fehlt: unaufgeregt ausblenden, nicht Fehlermeldung. Beim ersten Start ein kurzer Hinweis: "Diese App nutzt die Kamera nur lokal. Nichts verlässt dein Handy."
- Fehlerfälle sauber behandeln: Zugriff verweigert, keine Rückkamera, Stream bricht ab (App in den Hintergrund). Beim Zurückkehren Stream neu anfordern.

### 3.2 Stapel-Pipeline
- Einzelbilder per `requestVideoFrameCallback` (Fallback `requestAnimationFrame`) vom `<video>` auf ein Offscreen-Canvas ziehen, Pixeldaten in **Float32Array-Akkumulatoren** (RGB, keine Alpha) sammeln. Nie in 8 Bit akkumulieren.
- Verarbeitung in einem **Web Worker** (Akkumulator lebt dort, Hauptthread bekommt alle ~200 ms ein Vorschaubild zurück). Bei 4K ggf. auf halbe Auflösung für die Vorschau herunterrechnen, aber in voller Auflösung akkumulieren, solange Speicher reicht (Grenze testen, bei Fehler auf 1080p zurückfallen und das anzeigen).
- Pro Aufnahme speichern: Modus, Dauer, Anzahl Einzelbilder, effektive Framerate, Auflösung, Gerätewerte (falls auslesbar: Belichtungszeit, ISO, Korrektur).

### 3.3 Drei Modi
Jeder Modus hat einen Namen, eine Einzeilen-Erklärung direkt am Schalter und einen Link ins Lernmodul.

1. **Mitteln** – Akkumulator / Anzahl Bilder. Bewegung verschwindet, Helligkeit bleibt. *"Wasser wird glatt, Passanten lösen sich auf."*
2. **Aufhellen** – pro Pixel das Maximum über alle Bilder. *"Lichtspuren, Taschenlampenmalerei."*
3. **Integrieren (analog)** – Akkumulator als Summe, Ausgabe = Summe × Verstärkungsfaktor, Clipping bei Weiß. Das Bild wird mit der Zeit heller wie Film. *"So belichtet Film: Licht sammelt sich, solange der Verschluss offen ist."*
   - Beim Start dieses Modus `exposureCompensation` auf das Minimum setzen, das das Gerät erlaubt (Ziel: −2 bis −3 EV), damit Einzelbilder deutlich unterbelichtet sind und der Anstieg sichtbar wird. Wenn das Gerät keine Korrektur anbietet: Hinweis anzeigen, Modus trotzdem erlauben.
   - Live-Anzeige der **äquivalenten Belichtung**: aus Einzelbild-Belichtung (falls auslesbar, sonst geschätzt aus mittlerer Helligkeit des ersten Bildes) und Anzahl Bilder die Gesamt-Lichtmenge berechnen und als "entspricht ca. 8 s bei f/8, ISO 100" ausgeben. Die Blende des Handys (aus EXIF-ähnlichen Capabilities meist nicht auslesbar; Standardannahme f/1.8, vom Nutzer in den Einstellungen änderbar) in die Rechnung einbeziehen. Unsicherheit kennzeichnen: "ca.".
   - Live-Histogramm (klein, Luminanz), damit man sieht, wann es ausbrennt.

### 3.4 Bedienung
- Großer Auslöser unten, Dauer-Wahl darüber (2, 5, 10, 20, 30, 60 s, oder "bis Stopp").
- Während der Aufnahme: Vorschau des wachsenden Stapels, Zähler "Bild 137 · 9,4 s", Fortschrittsring um den Auslöser, Abbrechen jederzeit.
- Vor dem Start, einmalig pro Sitzung: Hinweis "Handy aufs Stativ. Drei Sekunden Vorlauf, damit das Antippen nicht verwackelt." Dann 3-s-Countdown vor jeder Aufnahme (abschaltbar).
- Optional: `DeviceMotionEvent` während der Aufnahme auswerten, bei starker Bewegung Hinweis "verwackelt" am Ergebnis.
- Ergebnisansicht: Bild groß, Vergleich mit dem ersten Einzelbild per Wischen oder Schieberegler (davor/danach), Metadaten, Knöpfe **Speichern** (Web Share API mit Datei; Fallback: Download-Link), **Ins Logbuch**, **Verwerfen**.
- Wasserzeichen beim Speichern optional (Schalter in Einstellungen, Standard an): kleines Logo unten rechts plus Zeile mit Modus und Dauer.

### 3.5 Grenzen offen zeigen
Eine Info-Karte "Was das Handy hier nicht kann" (aus dem Lernmodul verlinkt): Auslesepausen zwischen Bildern (Lichtspuren werden gestrichelt), pro Einzelbild geclippte Lichter (keine auslaufenden Höfe), feste Blende, geringe Auflösung. Ton: sachlich, kein Entschuldigen.

---

## 4. Modul Rechner

Vier Unterseiten, Umschalter oben.

### 4.1 Belichtung
- Eingabe einer Ausgangsmessung: Blende, Zeit, ISO (Picker mit Standardreihen; Stufenraster 1 · ½ · ⅓ umschaltbar, Standard ⅓).
- Darunter dieselben drei Parameter als Zielwerte. Wird einer geändert, hält die App die Belichtung konstant und passt den **gesperrten** Parameter an (Schloss-Symbol am Parameter, der nachgeben soll; Standard: Zeit gibt nach).
- Anzeige der Differenz in Stufen zur Ausgangsmessung.
- Knopf "Timer starten mit dieser Zeit" (erscheint ab 1 s).

### 4.2 ND-Filter
- Eingabe der Ausgangszeit (oder Übernahme aus 4.1).
- Filter hinzufügen: Auswahl aus Liste (ND2/4/8/16/32/64/400/1000/3200/100000 sowie Dichten 0.3 … 5.0, sowie "n Stufen"), mehrere Filter stapelbar, Stufen summieren sich.
- Ergebnis: neue Zeit, groß. Darunter die exakte Rechnung in einer Zeile. Knopf "Timer starten".

### 4.3 Lochkamera
Zwei Richtungen, Umschalter:
- **Ich habe ein Loch:** Lochdurchmesser (mm) + Bildweite (mm) → Blendenzahl N = Bildweite / Durchmesser. Dazu: optimaler Durchmesser für diese Bildweite nach Lord Rayleigh, d = 1,9 · √(λ · f) mit λ = 0,00055 mm, und Bewertung "zu groß (unscharf durch Geometrie) / nahe Optimum / zu klein (unscharf durch Beugung)".
- **Ich baue ein Loch:** Bildweite → optimaler Durchmesser, Blendenzahl, Bildwinkel für wählbares Format (Kleinbild, 4×5", 8×10", Dose mit Eingabe der Breite).
- **Belichtung übertragen:** Referenzmessung (Blende/Zeit/ISO einer normalen Kamera) + Lochkamera-Blende + Filmempfindlichkeit → Belichtungszeit, mit Stufenangabe. Knopf "Schwarzschild anwenden" springt in 4.4 mit vorbelegter Zeit.

### 4.4 Film / Schwarzschild
- Filmauswahl aus eingebauter Liste. Jeder Film mit Korrekturfunktion als Tabelle gemessene Zeit → korrigierte Zeit (Stützpunkte 1, 2, 4, 8, 15, 30, 60, 120, 240, 480 s; dazwischen log-linear interpolieren). Mitgelieferte Daten nach Herstellerangaben, mit Quellenangabe und Datum im Datensatz (`data/films.json`). Mindestens: Ilford HP5+, FP4+, Delta 100, Delta 400, Pan F+; Kodak Tri-X 400, T-Max 100, T-Max 400, Portra 160/400, Ektar 100; Fomapan 100/200/400; Fuji Acros II (praktisch kein Schwarzschild – gutes Lehrbeispiel). Wo Herstellerkurven fehlen, Lücke markieren statt Praxiswerte unterschieben; der Nutzer kann Werte überschreiben.
- Eigene Filme anlegen: Name, ISO, Stützpunkte, Notiz. Werden lokal gespeichert, exportierbar als JSON.
- Eingabe gemessene Zeit → korrigierte Zeit, Stufenzuschlag, Knopf "Timer starten".
- Hinweis zur Farbverschiebung bei Farbfilm als Text, nicht als Rechnung.

---

## 5. Modul Timer

- Zeit setzen: Drehrad oder Eingabe, Übernahme aus Rechnern.
- Start → großer Countdown, Fortschrittsring. Bildschirm bleibt an (`navigator.wakeLock.request('screen')`, Fehler stillschweigend ignorieren). Hinweis beim ersten Start: "Handy nicht sperren, der Timer läuft nur bei eingeschaltetem Display."
- Signale: kurzer Ton bei Start, jede volle Minute, 10 s vor Ende, Doppelton am Ende. Audio über Web Audio API (selbst erzeugt, keine Dateien). Vibration (`navigator.vibrate`) wo verfügbar. Lautstärke-Schalter.
- Funktioniert im Rotlichtmodus, Ziffern dann groß und rot.
- Nach Ablauf: "Ins Logbuch" mit vorbelegten Werten.
- Zweiter Modus **Intervall**: Anzahl Bilder + Pause, für Reihen und Mehrfachbelichtungen.

---

## 6. Modul Lernen

Drei Bereiche: **Verstehen**, **Probieren**, **Aufgaben**. Inhalte liegen als Markdown in `content/` und werden zur Laufzeit gerendert (kleiner Markdown-Parser selbst schreiben oder ein einzelnes kleines Modul einbinden; keine schwere Bibliothek).

### 6.1 Verstehen – Erklärkarten
Je Karte: Titel, kurzer Text (max. 200 Wörter), eine interaktive Grafik (SVG mit Slidern), Link zum passenden Rechner. Karten, erste Fassung:
1. Alles ist eine Stufe (EV, Verdopplung, warum f/1.4 → f/2 eine Stufe ist)
2. Die Blendenzahl ist ein Verhältnis (Brennweite / Öffnung; Beispiele Handy 6 mm f/1.8 ≈ 3,5 mm Loch, Kleinbild 50 mm f/1.8, Lochkamera 150 mm f/250 ≈ 0,6 mm)
3. Schärfentiefe hängt am Format (gleiche f-Zahl, anderes Bild)
4. Lochkamera: Geometrie gegen Beugung (Slider Lochdurchmesser → Unschärfe-Kurve mit Minimum)
5. Was ist Langzeitbelichtung (Integration; wie Film, wie das Handy stapelt, wo der Unterschied liegt)
6. ND-Filter
7. Schwarzschild-Effekt
8. Handy gegen Kamera gegen Film (siehe 6.4)

### 6.2 Probieren – Simulator
- Szene als Vektorgrafik (Straße mit Laterne, fahrendes Fahrzeug, Wasser, Person im Vordergrund). Slider: Blende, Zeit, ISO, optional ND. Anzeige: Helligkeit (Gesamt-EV gegen Szenen-EV), Bewegungsunschärfe am Fahrzeug und Wasser (Länge der Unschärfe ∝ Zeit), Schärfentiefe (Weichzeichnung Hinter-/Vordergrund ∝ 1/N), Rauschen (∝ ISO), Blendenstern an der Laterne (Zacken ab f/8). Keine fotorealistische Simulation; Prinzipdarstellung, ehrlich beschriftet.
- Umschalter "Dein Handy" / "Vollformat" / "Lochkamera": Beim Handy ist der Blendenslider gesperrt mit Hinweis "feste Blende, das hat dein Handy nicht".

### 6.3 Aufgaben
- Liste von Aufgaben mit Fragetext, Eingabefeld oder Auswahl, Lösungsweg zum Aufklappen. Fortschritt lokal speichern.
- Erste Aufgaben: ND1000 + 1/125 s → Zeit?; Lochkamera 0,4 mm bei 120 mm → Blende?; HP5 bei 30 s gemessen → korrigiert?; Handy f/1.8 10 s "Integrieren" entspricht Vollformat f/8 wie lange?; warum wird die Lichtspur gestrichelt?
- Inhalte als `content/tasks.json`, damit neue Aufgaben ohne Code ergänzt werden können.

### 6.4 Vergleich Handy / Kamera / Film
- Galerie mit Referenzszenen. Pro Szene bis zu drei Bilder (Handy-Stapel, Digitalkamera, Film) als Vorher/Nachher-Schieber oder Wischen, mit Beschriftung der Unterschiede (Perlenkette vs. Linie, Clipping vs. Hof, Blende, Rauschen/Korn).
- Bilder liegen in `content/compare/<szene>/` mit `meta.json` (Titel, Beschreibung, Aufnahmedaten je Bild). Platzhalter mitliefern; echte Bilder kommen vom Kursleiter.
- Funktion "Eigenes Bild daneben legen": Ein Bild aus dem Logbuch wählen und neben die Referenz stellen.

---

## 7. Modul Logbuch

- Einträge: Datum/Zeit, Quelle (Aufnahme / Timer / manuell), Kamera-Typ (Handy / Digital / Film / Lochkamera), Blende, Zeit, ISO, Film, ND, Notiz, optional Bild (Aufnahmen aus Modul 3, verkleinert auf max. 2048 px lange Kante für den Speicher).
- Liste, Detail, Bearbeiten, Löschen. Export als JSON und CSV, Import JSON.
- Speicherbedarf anzeigen, Warnung bei über 200 MB.

---

## 8. Einstellungen

- Stufenraster (1, ½, ⅓)
- Angenommene Handy-Blende (Standard 1.8) und Brennweite (Standard 6 mm) für die Äquivalenzrechnung
- Wasserzeichen an/aus
- Countdown vor Aufnahme an/aus
- Ton/Vibration
- Rotlichtmodus (auch in Kopfzeile)
- Daten: Export/Import alles, alles löschen (mit Rückfrage)
- Über: Version, Kursleiter-Info (Platzhalter), Lizenzhinweise

---

## 9. Dateistruktur (Vorschlag)

```
/index.html
/manifest.webmanifest
/sw.js
/css/        base.css, dark.css, redlight.css
/js/         app.js (Router, Shell), modules/ (capture.js, calc-*.js, timer.js, learn.js, log.js, settings.js), core/ (exposure.js, pinhole.js, film.js, stack-worker.js), lib/ (markdown.js, storage.js, share.js)
/i18n/       de.json
/data/       films.json, standards.json
/content/    cards/*.md, tasks.json, compare/<szene>/
/assets/     logo.svg, icons/
/tests/      exposure.test.js, pinhole.test.js, film.test.js (laufen mit node, ohne Framework)
```

---

## 10. Reihenfolge der Umsetzung

1. Shell, Navigation, Dunkel- und Rotlichtmodus, Service Worker, Manifest. Muss auf iPhone und Android installierbar sein.
2. Rechenkern mit Tests. Erst wenn die Tests grün sind, weiter.
3. Rechner (alle vier Unterseiten) und Timer.
4. Aufnahme-Modul: zuerst Mitteln, dann Aufhellen, dann Integrieren mit Äquivalenzanzeige. Nach jedem Modus auf echten Geräten testen.
5. Logbuch, Speichern, Export.
6. Lernen: Karten, Simulator, Aufgaben, Vergleichsgalerie.
7. Einstellungen, Feinschliff, Lauf auf alten Geräten.

Nach jedem Schritt: kurze Notiz in `CHANGELOG.md`, was geht und was auf welchem Gerät nicht geht.

---

## 11. Testmatrix

Vor dem Kurstag auf mindestens diesen Geräten: aktuelles iPhone, iPhone mit zwei Jahre altem iOS, aktuelles Android (Pixel oder Samsung), Android-Gerät von 2020 oder älter. Jeweils prüfen: Installation auf Homescreen, Kamerafreigabe, alle drei Stapelmodi 30 s, Speichern in Fotos, Timer mit gesperrtem und entsperrtem Display, Offline-Betrieb nach Neustart.

Bekannte Grenzen, die nicht als Fehler gelten: keine manuelle Belichtungszeit auf iPhone, keine Vibration auf iPhone, Timer stoppt bei gesperrtem Display, Auflösung abhängig vom Stream.

---

## 12. Was die App nicht ist

Keine Kamera-App als Ersatz für eine richtige Kamera. Kein Social-Feature, kein Konto, kein Server. Keine fotorealistische Simulation. Keine Werbung. Wenn eine Funktion nur mit einem dieser Dinge geht, lieber weglassen.

---

## 13. Ergänzungen (nach Kursleiter-Rücksprache, 2026-10-13)

### 13.1 Kamera-Visualisierung (zu Schritt 6, Modul Lernen)
- **Stilisierte Kamera mit drehenden Rädern:** Eine SVG-Kamera von oben mit Zeitenrad, Blendenring und ISO-Rad. Im Belichtungsrechner (4.1) und im Simulator (6.2) drehen sich die Räder sichtbar mit, wenn Werte geändert werden; eine Stufe ist eine Raste. Datengetrieben aus `core/exposure.js`, keine Marken, kein fotorealistisches Gehäuse.
- **Geräteprofile statt Markenmodelle:** `data/devices.json` mit wenigen Profilen (Handy-Hauptkamera, Kleinbild, Mittelformat, Lochkamera): Sensorgröße, Brennweite, Blende (fest oder Bereich). Vom Kursleiter ohne Code pflegbar. Daraus: Sensorgrößen als Rechtecke nebeneinander, Öffnungsdurchmesser als Kreise (Handy ≈ 3,5 mm, Lochkamera ≈ 0,6 mm), Schärfentiefe bei gleicher Blendenzahl. Speist Lernkarten 2 und 3, den Umschalter „Dein Handy / Vollformat / Lochkamera“ im Simulator und die Äquivalenzrechnung im Modus Integrieren (ersetzt dort die feste Annahme f/1,8, bleibt in den Einstellungen änderbar).
- Bewusst nicht: echte Kameramodelle mit ihren Bedienoberflächen (viele Modelle, schnell veraltet, Markenabbildungen).

### 13.2 Modusrad-Übersetzer (zu Schritt 6, Modul Lernen, und Rechner 4.1)
- Teilnehmer verwechseln die Bezeichnungen der Belichtungsmodi (Av/Tv bei Canon und Pentax, A/S bei Nikon, Sony, Panasonic, Olympus, A-Stellungen auf Zeitenrad und Blendenring bei Fujifilm und Leica). Die Konzepte sind gleich, nur die Beschriftung nicht.
- `data/camera-modes.json`: je Hersteller die Beschriftung für Programmautomatik, Blendenvorwahl, Zeitvorwahl, Manuell, Bulb/Time, dazu Hinweise und eine Anleitung „lange Belichtung einstellen“ für den Kurstag. Auch Handy-Profile (iPhone-Kamera, Android-Pro-Modus). Vom Kursleiter pflegbar.
- Lernkarte 9 „Av, Tv, S, A: Was das Modusrad meint“ mit interaktivem Modusrad: Marke wählen, Modus antippen, es erscheint „du wählst … / die Kamera wählt …“ in der Beschriftung dieser Marke.
- Einstellung „Deine Kamera“ (Marke). Der Belichtungsrechner zeigt am nachgebenden Parameter den passenden Modus: Zeit gibt nach → Blendenvorwahl → „Av“ bei Canon.
- Herstellerspezifisch sind nur Beschriftungen und Menüwege, keine Gehäuse-Abbildungen.

### 13.3 Hauptreiter „Kamera“ (2026-10-15)
- Abweichend von Abschnitt 1 hat die untere Leiste sechs Reiter: **Aufnahme · Rechner · Kamera · Timer · Lernen · Logbuch**. „Kamera“ zeigt die stilisierte Kamera der eigenen Marke (Spec 13.1, 13.2) mit Modusrad-Übersetzer und Reglern. Jeder Reiter bleibt mindestens 48 px breit (bei 375 px Bildschirmbreite 62 px).
- Homescreen-Icon: nur das Zeichen (Linie durch Kreis), weiß auf Schwarz, aus dem Logo-Paket.

### 13.4 Kamera-Modul ausgebaut (2026-10-15)
Der Reiter „Kamera“ hat drei Bereiche: **Kamera · Langzeit · Übungen**.
1. **Virtuelle Kamera:** Der Rückmonitor zeigt die Szene aus dem Simulator als Livebild mit Infozeile und wandernder Belichtungsskala. Licht wählbar (Dämmerung EV 5, Tageslicht EV 14), ND-Filter 0/3/6/10 Stufen. Automatiken wie an der echten Kamera: Programmautomatik hält 1/30 s und regelt die ISO (Auto-ISO), Blendenvorwahl endet an der längsten Zeit der Kamera. Unter der Kamera eine Auswertung (Belichtung, Bewegung, Rauschen, Grenzen).
2. **Langzeit-Assistent:** nimmt Zeit, Blende und ISO aus den Rechnern („Auf meiner Kamera einstellen“ in Belichtungs-, ND-, Lochkamera- und Filmrechner) und zeigt die Schritte für die eigene Marke: direkt im Modus M oder über Bulb/Time, mit Radnamen der Marke, Timer-Übergabe.
3. **Grenzen der eigenen Kamera:** längste Zeit ohne Bulb, ISO-Bereich, Objektiv (größte und kleinste Blende) in den Einstellungen; Standard je Marke aus `data/camera-modes.json` (`limits`, `lensDefault`). Rechner warnen bei Überschreitung, die virtuelle Kamera begrenzt ihre Regler.
4. **Übungen** an der virtuellen Kamera aus `content/camera-tasks.json` (ohne Code erweiterbar), geprüft gegen den Kamerazustand, Fortschritt lokal.
5. **Radbelegung je Marke und Modus** in `data/camera-modes.json` (`dials`: Radnamen, welches Rad Zeit und Blende stellt, Verlässlichkeit hoch/mittel/niedrig). Unsichere Angaben sind in der App als „bitte am Gerät prüfen“ markiert.

### 13.5 Gehäuse je Marke und „Wo finde ich was?“ (2026-10-15)
1. **Kein Objektiv mehr in der Grafik.** Objektiv und Einblick „Blick ins Objektiv“ sind entfernt; die Blende steht im Monitor und in der Bildunterschrift (Fujifilm/Leica: „Blendenring am Objektiv f/8“).
2. **Räder und Tasten folgen der Marke.** `data/camera-modes.json` → `body` je Marke: Vorbild-Modelle (`ref`), Lage des Modusrads (links/rechts), Schulterdisplay, Sucher (Mitte/links), vorderes Rad (`grip` senkrecht am Griff, `release` hinter dem Auslöser, `collar` Ring um den Auslöser), hinteres Rad (`thumb` Daumenrad an der Kante, `thumbTop` oben, `ring` großer Ring hinten), Steuerrad, Steuerkreuz, Joystick, Korrekturrad, ISO-Rad, Tasten oben/hinten/links, Hinweis auf abweichende Modelle, Verlässlichkeit.
3. **„Wo finde ich was?“** unter der virtuellen Kamera: Liste aller Bedienteile der Marke. Antippen in der Liste oder an der Grafik hebt das Teil hervor und erklärt Lage und Zweck; bei den Einstellrädern zusätzlich, was sie in welchem Modus stellen (aus `dials`). Texte in `i18n/de.json` (`camera.part`, `camera.partText`, `camera.buttons`).

### 13.6 Kamera ohne Unterreiter (2026-10-15)
1. Der Reiter „Kamera“ hat keine Unterreiter mehr. **Langzeit-Assistent und Übungen sind gestrichen** (13.4 Punkt 2 und 4 entfallen). Alte Adressen `#/camera/long` und `#/camera/tasks` öffnen die Kamera.
2. „Auf meiner Kamera einstellen“ in den Rechnern öffnet die virtuelle Kamera mit Zeit, Blende und ISO aus dem Rechner: Modus M, oder Bulb, wenn die Zeit länger ist als die längste Zeit der eigenen Kamera.
3. Zusatztexte sind einklappbar und anfangs zu: „So funktioniert es“ (oben), „Vorbild: …“ (in „Wo finde ich was?“), „Mehr zu {Modus} bei {Marke}“ (Modus-Erklärung, Radbelegung, Langzeit-Tipp, Bauweise, Hinweis). Offen/zu merkt sich die App.

### 13.7 Kamera-Reiter nach der Leinwand (2026-10-15)
Aufbau nach der Design-Leinwand „focus · Kamera“ (https://claude.ai/artifact/7dvETQHF44ajpJUEMBXRjh), vom Kursleiter bearbeitet:
1. Titel „Deine Kamera“ mit kleinem Info-Knopf; er blendet die Anleitung ein und aus (ersetzt „So funktioniert es“).
2. Reihenfolge: Marke · Kamera · Modi · Regler (Blende, Zeit, ISO, ND, Hinweis) · „Wo finde ich was?“ · „Mehr zu {Modus} bei {Marke}“.
3. Entfallen: Auswertung unter der Kamera, Lichtwahl Dämmerung/Tageslicht (fest Dämmerung), Knopf „Grenzen meiner Kamera“ (bleibt in den Einstellungen), in „Wo finde ich was?“ Einleitungssatz, Vorbild-Hinweis und Platzhalter.
4. „Wo finde ich was?“ listet nur Räder, Auslöser und Sucher. Andere Teile (Tasten, Monitor …) erklärt die App, wenn man sie an der Grafik antippt; die Erklärung rollt dann ins Bild.

### 13.8 Kameramodelle (2026-10-15)
1. Unter der Marke ein Feld **Modell** (Kamera-Reiter und Einstellungen, Einstellung `cameraModel`). „Allgemein“ behält die Markenbauform.
2. `data/camera-modes.json` → `brands[].models[]`: `id`, `name` (auch baugleiche Modelle), `source` (Anleitung und Seite), `body` (Lage von Modusrad, Sucher, Rädern, Tasten wie in 13.5, dazu `evf: none`, `front`/`rear: null` für Kameras mit nur einem Rad, `ring` für einen zusätzlichen Drehring, `shutterDial`/`modeDialLabel` für Nikon Z fc/Z f), `dials` (Radnamen laut Anleitung, Belegung je Modus; `"front+Av±"` heißt: Taste gedrückt halten und Rad drehen; zusätzliche Räder `wheel` und `shutterDial`), optional `limits`.
3. Erfasst aus den Herstelleranleitungen: Canon EOS 2000D, 250D, 850D, 90D, 6D Mark II, R100, R50, R10, R8, R7, R6 Mark II; Nikon Z 30, Z 50, Z 5, Z 6II/7II, Z fc, Z f, D3500, D780; Sony α6400, α6700, α7C, α7 III, α7 IV; OM System/Olympus E-M10 IV, E-M5 III, OM-1. Canon R5 Mark II/R5 mit MODE-Taste statt Modusrad (`modeDial: "button"`, Modus im Schulterdisplay). Nikon Z 8, Z 9 und D850 mit MODE-Taste im Tastenblock links (`modeButtonSide: "left"`, `leftTopButtons`), Z 9 und D850 dazu mit Aufnahmebetriebsart-Rad (`releaseDial`).
4. Gewähltes Modell bestimmt Grafik, „Wo finde ich was?“, Bildunterschrift, Radbelegung und (falls angegeben) Grenzen; die Quelle steht unter „Mehr zu …“.

### 13.9 Funktionen in „Wo finde ich was?“ (2026-10-15)
1. Unter den Teilen eine zweite Reihe **Funktionen**: AF-Modus, Selbstauslöser, Spiegelvorauslösung (Spiegelreflex) bzw. erschütterungsfrei auslösen (Spiegellose: elektronischer erster Verschlussvorhang).
2. Antippen zeigt für das gewählte Modell, wo die Funktion sitzt (Taste oder Menüweg), eine kurze Erklärung und die Quelle; die zugehörige Taste leuchtet an der Kamera auf (`part`). Ohne Modell: Erklärung und Hinweis, das Modell zu wählen.
3. Daten: `models[].functions.{af, timer, shake}` mit `where`, `source`, `confidence`, optional `part` (`button:AF`, `pad`, `controlWheel`, `modeDial`) und bei `shake` der `type` (`mirror` oder `efc`).
