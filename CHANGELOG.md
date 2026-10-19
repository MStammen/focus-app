# Changelog

Notizen nach jedem Umsetzungsschritt (SPEC.md Abschnitt 10): was geht, was auf welchem Gerät nicht geht.

## 0.1.0 – Schritt 1: Shell, Navigation, Dunkel-/Rotlichtmodus, Service Worker, Manifest (2026-10-13)

**Geht**
- App-Hülle mit Kopfzeile (Logo-Platzhalter, Rotlicht-Schalter, Einstellungen) und fünf Reitern unten: Aufnahme · Rechner · Timer · Lernen · Logbuch. Alle Reiter zeigen Platzhalter mit Hinweis auf den Schritt, in dem sie kommen.
- Hash-Router (`#/capture`, `#/calc`, `#/timer`, `#/learn`, `#/log`, `#/settings`), Module werden per `import()` nachgeladen. Läuft auf jedem statischen Webspace, auch in Unterordnern (alle Pfade relativ).
- Dunkles Design als Standard, Rotlichtmodus (rot auf schwarz, gedimmt; Bilder/Video/Canvas werden per CSS-Filter mit eingefärbt). Wahl wird in `localStorage` gespeichert und vor dem ersten Rendern gesetzt, kein Aufblitzen.
- Alle Texte in `i18n/de.json`.
- Service Worker mit Cache-First: 22 Dateien werden beim ersten Aufruf vorgeladen. Neue Version → Toast „Neue Version geladen / Neu starten“. Getestet: Server gestoppt, Seite neu geladen, App läuft vollständig aus dem Cache.
- `manifest.webmanifest` mit Icons 192/512 (any + maskable), `display: standalone`, Theme-Farben; `apple-touch-icon` für iOS.
- Einstellungen (Teilmenge): Rotlicht-Schalter, Installations-Hinweis (iOS: Teilen → Zum Home-Bildschirm; Android/Chrome: Knopf „Zum Homescreen hinzufügen“ über `beforeinstallprompt`), Offline-Status, Über mit Version.
- Touch-Ziele mindestens 48 px, Safe-Area-Abstände für Kerbe und Home-Indikator.

**Noch nicht / nicht getestet**
- Installation auf echtem iPhone und Android noch nicht geprüft (nur im Desktop-Browser mit Handy-Viewport). Bitte vor Schritt 2 auf je einem Gerät testen: Homescreen-Installation, Start ohne Browserleiste, Flugmodus-Neustart.
- Platzhalter-Logo und -Icons (Blendenring); echtes focus-Logo folgt.
- Die Precache-Liste in `sw.js` wird von Hand gepflegt. Neue Dateien dort eintragen und `VERSION` in `sw.js` hochzählen, sonst sehen installierte Geräte die Änderung nicht.

**Lokal starten**
```
node tools/serve.mjs
```
Dann http://localhost:8787/ öffnen. `localhost` zählt als sicherer Kontext, Service Worker und Manifest funktionieren dort ohne https.

## Schritt 2: Rechenkern mit Tests (2026-10-13)

**Geht**
- `js/core/exposure.js`: `ev`, `shutterFor`, `apertureFor`, `isoFor`, `stopsBetween`, `nearestStandard`, `formatShutter`, `ndStops` wie in SPEC Abschnitt 2, dazu `standardSeries`, `shutterWithNd`, `formatAperture`, `formatIso`, `formatStops` und die Liste `ND_FILTERS`.
- Standardreihen als Drittelstufen im Modul (Blende 1…256, Zeit 1/8000…8 h, ISO 25…102400). Ganze Stufen werden daraus abgeleitet, Halbstufen sind eigene Kamera-Nennwerte. Eine separate `data/standards.json` ist damit nicht nötig.
- Außerhalb der Reihen (Blende über f/256, Zeit über 8 h) gibt `nearestStandard` den exakten Wert zurück.
- 34 Tests in `tests/exposure.test.js`, laufen mit `node --test tests/` (Node-eigener Testrunner, kein Framework). Alle grün.

**Entscheidungen, die nicht in der Spec stehen**
- `stopsBetween(a, b, kind)` hat einen dritten Parameter `kind`, weil Blendenstufen anders rechnen als Zeit und ISO. Vorzeichen: positiv = b lässt mehr Licht durch.
- `formatShutter` schreibt Dezimalpunkt wie in den Spec-Beispielen (`0.5"`). Bei Anzeige im UI kann später auf Komma umgestellt werden.
- Zeitreihe endet bei 8 h = 28800 s, das ist ⅓ Stufe unter dem rechnerischen 30720 s.
- `package.json` nur für `npm test` und `"type": "module"`, kein Build, keine Abhängigkeiten.

**Noch nicht**
- `pinhole.js` und `film.js` kommen mit den Rechnern in Schritt 3.

## 0.2.0 – Schritt 3: Rechner (vier Unterseiten) und Timer (2026-10-13)

**Geht**
- **Belichtung:** Ausgangsmessung (Blende/Zeit/ISO aus Standardreihen, Stufenraster 1 · ½ · ⅓ umschaltbar), Zielwerte mit Schloss-Symbol am nachgebenden Parameter (Standard: Zeit). Berechneter Wert exakt plus Standardwert, Tabelle mit Stufendifferenz je Parameter und Summe. Knopf „Timer starten“ ab 1 s.
- **ND-Filter:** Ausgangszeit (Übernahme aus Belichtung), Filter aus Liste ND2 … ND100000, Dichten 0,3 … 5,0, freie Stufenzahl; stapelbar. Anzeige übliche Bezeichnung („10 Stufen“) mit exakter Zahl (9,97). Ergebnis groß, Rechnung in einer Zeile, Timer-Knopf.
- **Lochkamera:** „Ich habe ein Loch“ (Blendenzahl, Rayleigh-Optimum, Bewertung zu groß / nahe Optimum / zu klein), „Ich baue ein Loch“ (optimaler Durchmesser, Blendenzahl, Bildwinkel für Kleinbild, 4×5″, 8×10″, Dose mit Breite), „Belichtung übertragen“ (Referenzmessung + Lochblende + Film-ISO → Zeit mit Stufen; Knopf „Schwarzschild anwenden“ springt mit Zeit in den Filmrechner).
- **Film / Schwarzschild:** 15 eingebaute Filme in `data/films.json` mit Quelle und Datum je Film; gemessene Zeit → korrigierte Zeit, Stufenzuschlag, Status (Herstellerwert / interpoliert / extrapoliert / Lücke). Stützpunkt-Tabelle einsehbar, Herstellerwerte pro Film überschreibbar (lokal gespeichert, zurücksetzbar). Eigene Filme anlegen, löschen, als JSON exportieren. Hinweis zur Farbverschiebung bei Farbfilm.
- **Timer:** Countdown mit Einstellknöpfen, Schnellwahl und Minuten/Sekunden-Feldern, Übernahme aus den Rechnern (`#/timer?seconds=…`). Fortschrittsring, große Ziffern (im Rotlicht größer und rot). Wake Lock, Hinweis beim ersten Start. Töne per Web Audio (Start, jede volle Minute, 10 s vor Ende, Doppelton am Ende), Vibration wo verfügbar, beides abschaltbar. Nach Ablauf „Ins Logbuch“ (Ziel kommt in Schritt 5), „Nochmal“, „Neue Zeit“. Intervallmodus: Anzahl Bilder, Belichtung je Bild, Pause.
- Rechenkern erweitert: `js/core/pinhole.js` und `js/core/film.js` mit Tests. Insgesamt 60 Tests, alle grün.

**Filmdaten: Quellen und Lücken**
- Ilford HP5+, FP4+, Delta 100, Delta 400, Pan F+: HARMAN „Film Reciprocity Failure Compensation“ (Dez 2023), Formel Tc = Tm^p mit p = 1,31 / 1,26 / 1,26 / 1,41 / 1,33. Stützpunkte daraus berechnet.
- Kodak Tri-X 400: F-4017 (Okt 2021): 1 s → 2 s, 10 s → 50 s, 100 s → 1200 s. T-Max 100: F-4016 (Feb 2016). T-Max 400: F-4043 (Okt 2007). Zwischenwerte log-log interpoliert, über 100 s keine Herstellerdaten (als Lücke markiert).
- Kodak Portra 160/400, Ektar 100: Datenblätter (Jan 2025) nennen nur „bis 1 s keine Korrektur, darüber selbst testen“. Über 1 s als Lücke markiert, der Nutzer kann Werte eintragen.
- Fomapan 100/200/400: Foma-Datenblätter (Faktoren 2/8/16, 3/9/18, 1,5/6/8 bei 1/10/100 s). Über 100 s Lücke.
- Fuji Acros II: Datenblatt (undatiert): bis 120 s keine Korrektur, 120–1000 s +½ Stufe.
- Alle Datenblätter wurden am 2026-10-13 abgerufen; die Texte wurden maschinell aus den PDFs gezogen. Bitte vor dem Kurstag stichprobenartig gegen die Originale prüfen.

**Entscheidungen, die nicht in der Spec stehen**
- Lochkamera hat drei Umschalter statt zwei, weil „Belichtung übertragen“ eigene Eingaben braucht.
- Stützpunkte unter 0,5 s werden nicht korrigiert; zwischen 0,5 s und 1 s wird log-log überblendet.
- Über dem letzten Stützpunkt wird log-log extrapoliert und als Schätzung markiert; bei fehlenden Herstellerdaten im Bereich zusätzlich als Lücke.
- Übergabe zwischen Rechnern läuft über `sessionStorage` (nur für die Sitzung).

**Noch nicht / bekannte Grenzen**
- Nicht auf echten Geräten getestet: Ton auf iOS (braucht Nutzeraktion, ist eingebaut), Vibration (iOS kann das nicht), Wake Lock (Safari ab 16.4). Timer stoppt bei gesperrtem Display, wie in der Spec als bekannte Grenze vermerkt.
- „Ins Logbuch“ aus dem Timer führt bis Schritt 5 auf den Logbuch-Platzhalter.
- JSON-Import eigener Filme ist im Rechenkern vorhanden, aber noch ohne Oberfläche (kommt mit Einstellungen in Schritt 7).

## 0.3.0 – Schritt 4a: Aufnahme-Modul, Stapel-Pipeline mit allen drei Modi (2026-10-13)

**Geht (am Rechner im Demo-Modus geprüft, Gerätetest steht aus)**
- Kamerazugriff mit Rückkamera, höchste verfügbare Auflösung, tatsächliche Auflösung wird eingeblendet. Fähigkeiten (`getCapabilities`) werden gelesen; nur was das Gerät kann, erscheint unter „Kameraeinstellungen“: Belichtungskorrektur, manuelle Belichtungszeit, ISO, Fokus sperren, Weißabgleich sperren.
- Stapel-Pipeline: Einzelbilder per `requestVideoFrameCallback` (Fallback `requestAnimationFrame`) als `ImageBitmap` in einen Web Worker (`js/core/stack-worker.js`), dort Float32-Akkumulator RGB. Alle ~200 ms Vorschau zurück (bei über 1920 px Breite halbe Auflösung für die Vorschau, Akkumulation in voller Auflösung). Reicht der Speicher nicht, Rückfall auf halbe Auflösung mit Hinweis. Ohne OffscreenCanvas im Worker: Pixel werden im Hauptthread gelesen und als Puffer übertragen.
- Modi Mitteln, Aufhellen, Integrieren mit Einzeilen-Erklärung und Link ins Lernmodul. Integrieren setzt die Belichtungskorrektur auf das Geräteminimum (Ziel −3 EV), zeigt Luminanz-Histogramm, Clipping-Anteil und äquivalente Belichtung („entspricht ca. 8 s bei f/8, ISO 100“); ohne auslesbare Gerätewerte als „geschätzt“ gekennzeichnet.
- Weißabgleich wird beim Start eingefroren (falls möglich) und danach zurückgesetzt. Wake Lock während der Aufnahme.
- Bedienung: Dauer 2/5/10/20/30/60 s oder bis Stopp, großer Auslöser mit Fortschrittsring, Zähler „Bild 137 · 9,4 s“, Abbrechen. Vor der ersten Aufnahme je Sitzung Stativ-Hinweis, 3-s-Countdown (abschaltbar über Einstellung `countdown`). Datenschutz-Hinweis beim ersten Start.
- Ergebnis: Bild groß, Vergleich mit erstem Einzelbild per Wischen oder Schieber, Metadaten (Modus, Dauer, Einzelbilder, effektive fps, Auflösung, Gerätewerte wenn auslesbar). Speichern über Web Share API mit Datei, Fallback Download; Wasserzeichen (Logo + Modus + Dauer, Einstellung `watermark`, Standard an). „Ins Logbuch“ legt einen Eintrag mit Bild (max. 2048 px) in IndexedDB an. „Verwerfen“ startet die Kamera neu.
- Fehlerfälle: Zugriff verweigert, keine Kamera, kein https, Stream endet, App im Hintergrund (Aufnahme wird abgebrochen, Kamera beim Zurückkehren neu angefordert).
- Info-Karte „Was das Handy hier nicht kann“.
- Demo-Modus ohne Kamera für Tests am Rechner: `#/capture?demo=1` (synthetische Szene mit Laterne und wanderndem Licht).

**Noch nicht**
- `DeviceMotionEvent`-Auswertung („verwackelt“) fehlt noch.
- Gerätetest auf iPhone und Android steht aus: Auflösung des Streams, effektive Framerate bei voller Auflösung, Speichergrenze, Web-Share in die Fotos-App, welche Fähigkeiten iOS tatsächlich anbietet (vermutlich keine Belichtungskorrektur, dann greift der Hinweis in Integrieren).

## 0.3.1 – Schritt 4b: Verwackelt-Erkennung (2026-10-13)
- `DeviceMotionEvent` während der Aufnahme: Beschleunigung ohne Schwerkraft, Spitze und Anteil bewegter Messungen. Über 1,5 m/s² Spitze oder mehr als 10 % bewegte Zeit gilt als „verwackelt“ und erscheint in den Metadaten mit Hinweis. iOS fragt beim ersten Antippen des Auslösers nach der Erlaubnis; wird sie verweigert, fehlt die Zeile einfach.

## 0.4.0 – Schritt 5: Logbuch (2026-10-13)

**Geht**
- Einträge mit Datum/Zeit, Quelle (Aufnahme / Timer / manuell), Kamera-Typ (Handy / Digital / Film / Lochkamera), Blende, Zeit, ISO, Film (Vorschlagsliste aus den Filmdaten), ND-Stufen, Bilderzahl, Notiz, optional Bild. Aufnahmen kommen mit Bild (max. 2048 px) und Vorschaubild aus Modul 3; der Timer übergibt Zeit und Bilderzahl in ein vorausgefülltes Formular.
- Liste mit Vorschaubild und Kurzzeile, Detailansicht mit allen Metadaten (bei Aufnahmen auch Modus, Einzelbilder, fps, Auflösung, Gerätewerte, Äquivalent, Bewegung), Bearbeiten, Löschen mit Rückfrage, Bild speichern (Teilen / Download).
- Export JSON (mit Bildern als Data-URL) und CSV (Semikolon, UTF-8 mit BOM, für Excel/Numbers), Import JSON (gleiche Datei, Einträge werden nach id ersetzt).
- Speicherbedarf: Summe der Bilddaten plus Browser-Schätzung; Warnung über 200 MB.
- Speicherung in IndexedDB (`js/lib/db.js`, Store `entries`).

**Spec-Ergänzung**
- Abschnitt 13 in SPEC.md: Kamera-Visualisierung mit drehenden Rädern und Geräteprofile (`data/devices.json`) für Schritt 6.

**Noch nicht**
- „Alles löschen“ und Gesamtexport kommen mit den Einstellungen in Schritt 7.
- Bilder aus dem Logbuch neben die Vergleichsgalerie legen (6.4) kommt mit dem Lernmodul.

## 0.5.0 – Schritt 6: Lernen (2026-10-13)

**Geht**
- **Verstehen:** acht Erklärkarten als Markdown in `content/cards/` (je unter 200 Wörter), gerendert mit eigenem kleinen Parser (`js/lib/markdown.js`, Tests). Jede Karte mit interaktiver SVG-Grafik mit Slidern (`js/modules/learn-graphics.js`): Stufen als Lichtkästchen, Blendenzahl als Öffnungskreis mit Handy/Kleinbild/Lochkamera-Presets, Schärfentiefe je Geräteprofil, Lochkamera-Unschärfekurve mit Rayleigh-Minimum, Integration Film gegen Stapel, ND-Glas, Schwarzschild-Kurve je Film aus den echten Daten. Link zum passenden Rechner, Blättern zwischen Karten.
- **Probieren:** Simulator mit Vektorszene (Laterne, Fahrzeug, Wasser, Person). Regler Blende, Zeit, ISO, ND. Zeigt Helligkeit gegen Szenen-EV, Bewegungsunschärfe und Lichtspur (gestrichelt beim Handy), Schärfentiefe über die absolute Öffnung, Rauschen, Blendenstern ab f/8. Umschalter Dein Handy / Vollformat / Lochkamera; beim Handy ist die Blende gesperrt mit Hinweis. Ehrlich beschriftet als Prinzipdarstellung.
- **Stilisierte Kamera mit drehenden Rädern** (`js/lib/camera-svg.js`, Spec 13.1): Zeitenrad, ISO-Rad, Iris. Erscheint im Simulator und im Belichtungsrechner und folgt den Zielwerten.
- **Geräteprofile** `data/devices.json` (Spec 13.1): Handy, Vollformat, Mittelformat, Lochkamera. Speisen Lernkarte 3 und den Simulator.
- **Aufgaben:** fünf Aufgaben aus `content/tasks.json` (Zahl mit Toleranz oder Auswahl), Prüfen mit Rückmeldung, Lösungsweg zum Aufklappen, Link in den Rechner, Fortschritt lokal gespeichert, zurücksetzbar.
- **Vergleich:** Galerie aus `content/compare/<szene>/meta.json`, Platzhalterbilder als SVG (Handy-Stapel, Digitalkamera, Film), zwei Bilder frei wählbar und per Wischen/Regler vergleichbar, Aufnahmedaten und Unterschiede je Bild. „Eigenes Bild daneben legen“: Logbuch-Einträge mit Bild erscheinen in der Auswahl.

**Noch nicht**
- Geräteprofile speisen die Äquivalenzrechnung im Modus Integrieren noch nicht (kommt mit den Einstellungen in Schritt 7, dort auch die Auswahl des eigenen Handyprofils).
- Echte Vergleichsbilder fehlen, Platzhalter sind markiert. Neue Szene: Ordner unter `content/compare/`, `meta.json` nach Vorbild, Ordnername in `content/compare/index.json` und Dateien in `sw.js` eintragen.

## 0.5.1 – Schritt 4c: Integrieren ohne Belichtungskorrektur (2026-10-14)

**Gerätetest iPhone (Kursleiter):** App läuft, Kamera, Stapeln, Speichern und Logbuch funktionieren. Unter „Kameraeinstellungen“ bietet iOS **keine Belichtungskorrektur** an, der Abschnitt bleibt leer bzw. ausgeblendet. Damit greift der Fall aus Spec 3.3: Modus Integrieren trotzdem erlauben, Hinweis anzeigen.

**Änderung**
- Integrieren dunkelt die Einzelbilder rechnerisch ab: Die Verstärkung wird je Vorschau so nachgeführt, dass das Bild am Ende der gewählten Dauer die Normalbelichtung erreicht (bei „bis Stopp“ nach 10 s) und danach wie Film langsam ausbrennt. Formel: Verstärkung = 2^(−Gerätekorrektur) · 2^(Regler) · (vergangene Zeit ÷ Zieldauer) ÷ Bilderzahl. Mit echter Gerätekorrektur (Android) bleibt die Unterbelichtung der Einzelbilder erhalten und wird rechnerisch wieder ausgeglichen; dann behalten ausgebrannte Lichter mehr Zeichnung.
- Neuer Regler „Verstärkung“ (−2 bis +2 Stufen in Drittelschritten, nur im Modus Integrieren), Einstellung `integrateGainStops`.
- Hinweistext ohne Korrektur angepasst.

**Bekannte Grenze:** Ohne echte Unterbelichtung bleiben Lichter, die im Einzelbild schon weiß sind, weiß. Das ist ein Lehrinhalt (Info-Karte „Was das Handy hier nicht kann“), kein Fehler.

## 0.6.0 – Schritt 7: Einstellungen (2026-10-14)

**Geht**
- Stufenraster (1, ½, ⅓) zentral; Handy-Profil aus `data/devices.json` oder eigene Werte für Blende und Brennweite (speisen die Äquivalenzrechnung im Modus Integrieren); Wasserzeichen an/aus; Countdown an/aus; Ton und Vibration (mit Hinweis, dass iPhones nicht vibrieren); Rotlichtmodus (zusätzlich zur Kopfzeile).
- Daten: „Alles exportieren“ sichert Logbuch mit Bildern, eigene Filme, Überschreibungen, Einstellungen und Aufgabenfortschritt in einer JSON-Datei (`kind: focuslab-backup`); Import liest dieselbe Datei; „Alles löschen“ mit doppelter Rückfrage, Rotlicht-Wahl bleibt erhalten.
- Installation (wie bisher) und Über: Version, Kursleiter-Platzhalter, Lizenzhinweis (keine fremden Bibliotheken), Liste der Filmdaten-Quellen mit Links.

**Feinschliff / alte Geräte (Hinweise für die Testmatrix in Spec 11)**
- Verwendete Browser-APIs mit Mindestversionen: ES-Module und optionale Verkettung (Safari 13.1, Chrome 80), `requestVideoFrameCallback` (Safari 15.4, Chrome 83; Fallback `requestAnimationFrame` eingebaut), OffscreenCanvas im Worker (Safari 16.4, Chrome 69; Fallback über Hauptthread eingebaut), Wake Lock (Safari 16.4, Chrome 84; wird still ignoriert), Web Share mit Dateien (Safari 15, Chrome 75; Fallback Download), CSS `:has()` nur für die Schriftgröße der Vier-Tab-Leiste (ohne: etwas größere Schrift), `aspect-ratio` (Safari 15, Chrome 88).
- Erwartung für ein iPhone mit zwei Jahre altem iOS (17): alles lauffähig. Android von 2020 mit aktuellem Chrome: lauffähig; mit altem WebView-Browser ohne Updates nicht geprüft.

## 0.7.0 – Modusrad-Übersetzer (2026-10-14)

**Anlass:** Kursteilnehmer verwechseln Av/Tv/S/A/M. Herstellerspezifisch sind jetzt die Beschriftungen und Menüwege, nicht die Gehäuse (Spec 13.2).

**Geht**
- `data/camera-modes.json`: Canon, Nikon, Sony, Fujifilm, Pentax/Ricoh, Olympus/OM System, Panasonic, Leica, iPhone, Android. Je Marke die Beschriftung der fünf Konzepte (Programm, Blendenvorwahl, Zeitvorwahl, Manuell, Bulb/Time), Hinweise, und eine Anleitung „lange Belichtung einstellen“ für den Kurstag. Angaben nach gängigen Modellreihen, Abweichungen einzelner Modelle möglich; bitte vom Kursleiter gegenlesen.
- Lernkarte 9 „Av, Tv, S, A: Was das Modusrad meint“ mit interaktivem Rad: Marke wählen, Stellung antippen → „Du wählst … / Die Kamera wählt …“ in der Beschriftung dieser Marke, dazu der Langzeit-Tipp.
- Einstellung „Deine Kamera“ (Marke). Der Belichtungsrechner zeigt unter „Ziel“ den Modus dieser Marke passend zum nachgebenden Parameter, z. B. „Canon: Av · Blendenvorwahl“.
- Strukturtests für die Datendateien und den Precache (`tests/data.test.js`).

## 0.7.1 – Modusrad in der Kamera unter „Probieren“ (2026-10-14)
- Die stilisierte Kamera hat ein Modusrad mit der Beschriftung der gewählten Marke (Einstellung „Deine Kamera“, im Simulator auch direkt wählbar).
- Im Simulator bestimmt der Modus, welcher Regler dir gehört: Programmautomatik (Kamera stellt Zeit und Blende), Blendenvorwahl (du Blende, Kamera Zeit bis 30 s), Zeitvorwahl (du Zeit, Kamera Blende im Bereich des Geräts), Manuell, Bulb (Zeiten bis 8 Minuten). Die Automatik rechnet mit dem Rechenkern zur Szene; stößt sie an ihre Grenze, wird das Bild sichtbar zu hell oder zu dunkel.
- Modus auch durch Antippen der Beschriftung auf dem Rad wählbar. Im Belichtungsrechner zeigt das Rad den Modus, der zum nachgebenden Parameter passt.

## 0.8.0 – Kamera-Grafik passt sich der Bauweise an (2026-10-14)
- Vier Bauweisen statt einer Einheitskamera (`js/lib/camera-svg.js`, Feld `layout` je Marke in `data/camera-modes.json`):
  - **pasm** (Canon, Nikon, Sony, Pentax, Olympus, Panasonic): Modusrad mit Markenbeschriftung, Display mit Zeit/Blende/ISO, zwei Einstellräder; das Rad, das du im gewählten Modus bedienst, leuchtet.
  - **dials** (Fujifilm, Leica): Zeitenrad und ISO-Rad oben, Blendenring am Objektiv, jeweils mit A-Stellung. Der Modus zeigt sich über die A-Stellungen („Zeitenrad auf A: Kamera wählt die Zeit“), kein Modusrad.
  - **phone** (iPhone, Android): Bildschirm statt Räder, Hinweis auf feste Blende, Werte „wählt das Handy“ bzw. „Pro-Modus“.
  - **pinhole**: Kasten mit Loch und offener Klappe, alles fest.
- Im Simulator bestimmt das Gerät (Handy, Lochkamera) das Layout, sonst die Marke. Im Belichtungsrechner die Marke.
- Weiterhin keine Gehäuse echter Modelle, nur die Bauweise.

## 0.9.0 – Reiter „Deine Kamera“ (2026-10-14)
- Neuer Reiter unter Lernen: Verstehen · Probieren · **Deine Kamera** · Aufgaben · Vergleich (Leiste scrollt bei fünf Einträgen seitlich).
- „Deine Kamera“: Marke wählen, große Kamera in der Bauweise der Marke, Modusrad-Übersetzer (Du wählst / Die Kamera wählt, Hinweise, Langzeit-Anleitung), Regler für Blende, Zeit und ISO; gesperrte Regler stellt die Kamera im gewählten Modus gegen eine feste Beispielszene.
- Simulator „Probieren“ zeigt nur noch Szene, Modus und Regler; die Kamera-Grafik ist in den neuen Reiter gewandert (Link dorthin).

## 0.9.1 – Logo und Name (2026-10-14)
- Echtes Logo aus dem Paket des Kursleiters: Glyphe (Linie durch Kreis) als `assets/logo.svg` in Weiß (für Wasserzeichen und Rotlichtfilter), Wortmarke `assets/wordmark.svg` in der Kopfzeile statt Text, App-Icons 192/512/180/32 aus den gelieferten PNGs (schwarzer Grund, dient zugleich als maskable).
- Name der App ist jetzt **focus** (ohne „Lab“): Titel, Manifest, Homescreen-Name, Wasserzeichen, Texte. Interne Schlüssel (`focuslab.*`, Cache-Name) bleiben, damit gespeicherte Daten erhalten bleiben.

## Design-System (Artefakt), 2026-10-14
- Schrift des Logos ist Work Sans Light 300 (Google Fonts, SIL OFL). Das Design-System nutzt Work Sans in allen Stufen: 300 für Titel, Timer-Ziffern und große Werte, 400 für Lesetext, 500 für Kartentitel, Beschriftungen und Reiter.
- Für die App: Die drei Schnitte sollen als WOFF2 unter `fonts/` mitgeliefert und im Service Worker vorgeladen werden (offline, kein Google-Server im Kurs). Kommt mit der Übernahme der Tokens in die App.

## 0.9.2 – Kamera-Grafik neu gezeichnet (2026-10-14)
- Alle vier Bauweisen mit Proportionen und Material statt Schemaskizze: Gehäuse mit Griff, Belederung und Deckkappe, Trageösen, Prisma mit Blitzschuh, roter Auslöser, geriffelte Räder mit Nabe und Gravur, Objektiv mit Fassungsringen, Glanzlicht und sieben echten Lamellen. Klassische Bauweise mit Sucherfenstern und geriffeltem Blendenring. Handy mit Notch, Kamerabuckel und Auslöser auf dem Bildschirm. Lochkamera als Holzkasten mit Maserung, Messingplatte und offener Klappe.
- Materialfarben sind feste dunkle Töne (Metall, Leder, Glas), Bedienhinweise (Marke, aktives Rad, Werte) weiter über die Tokens `accent`, `fg`, `fg-muted`. Rotlicht dimmt Glanz und helle Flächen.

## 1.0.0 – Design-System in der App (2026-10-14)

**Geht**
- Farben aus dem Design-System „focus“ übernommen, beide Themen: kühle, leicht blaue Neutraltöne, Akzent **Grün `#55f23a`** (auf der Design-System-Seite vom Kursleiter so gesetzt), Rotlicht unverändert rot auf Schwarz. Neue Rollen statt fester Farbwerte: `bg-input` (Felder), `accent-soft` (gewählte Chips), `success`, `info` (zweite Diagrammlinie), `overlay` (Badges über Bildern), `viewfinder` (Sucher, Vergleich, Simulator), `shadow-toast`.
- Schrift **Work Sans** (Logoschrift), selbst gehostet unter `fonts/` (variable WOFF2, Latin und Latin-Ext, zusammen 86 KB) mit Lizenz `fonts/OFL.txt`, im Service Worker vorgeladen. Gewichte nach den Typo-Stufen: 300 für Titel, Timer-Ziffern und große Ergebnisse, 400 für Text und Werte, 500 für Kartentitel, Beschriftungen, Knöpfe und Reiter. Kein Bold mehr.
- Histogramm im Modus Integrieren nimmt Akzent und Warnfarbe aus den Tokens.
- Theme-Farbe der Browserleiste und des Manifests auf den neuen Grund angepasst.
- Kamera-Baustein im Design-System (lebende Vorschau aller vier Bauweisen aus dem App-Code).

**Hinweis**
- Die Texte im Design-System beschreiben den Akzent noch als Amber. Wenn Grün bleibt, werden sie angepasst.

## 1.0.1 – Kamera aus Sicht des Fotografen (2026-10-15)
- Neue Standardansicht der Kamera-Grafik: **von hinten oben**. Man sieht die Deckkappe mit Modus-, Zeit- und ISO-Rad in Perspektive, das Objektiv zeigt vom Betrachter weg, auf der Rückseite Okular, Daumenrad, Tasten und ein Rückmonitor mit Modus, Zeit, Blende, ISO und Belichtungsskala. Was du im gewählten Modus selbst stellst, steht im Akzent; darunter eine Zeile, welches Rad was stellt.
- Klassische Bauweise (Fujifilm, Leica): Blendenring von oben lesbar, Zeiten- und ISO-Rad zeigen den eingestellten Wert an der Marke und seine Nachbarn. Lochkamera: Kasten von hinten mit Rückwand, Wasserwaage und offener Klappe. Handy unverändert (Bildschirm ist bereits die Sicht von hinten).
- Im Reiter „Deine Kamera“ umschaltbar zwischen „von hinten“ und „von vorn“ (Vorderansicht zeigt die Blendenlamellen), Wahl wird gespeichert.
- Korrektur: ISO-Rad zeigt echte Werte (1600 statt „2k“).

## 1.0.2 – Reiter „Kamera“, neues Homescreen-Icon (2026-10-15)
- „Deine Kamera“ ist ein eigener Hauptreiter (`#/camera`) zwischen Rechner und Timer. Unter Lernen gibt es wieder vier Bereiche; alte Links auf `#/learn/camera` führen weiter. Lernkarte 9 verlinkt auf den neuen Reiter. Tableiste mit sechs Reitern, Beschriftung etwas kleiner.
- App-Icons neu benannt (`assets/icons/focus-*.png`), Inhalt: nur das Zeichen aus dem Logo-Paket, weiß auf Schwarz. Die neuen Namen verhindern, dass Geräte die alten Platzhalter weiterverwenden. `tools/make-icons.mjs` entfernt.
- iPhone: Das Homescreen-Icon wird beim Hinzufügen gespeichert und nie aktualisiert. Für das neue Icon die App vom Homescreen entfernen und neu hinzufügen. Achtung: Dabei löscht iOS die Daten der App (Logbuch, eigene Filme, Einstellungen). Vorher unter Einstellungen → Daten → „Alles exportieren“ sichern und danach importieren.

## 1.0.3 – Akzent im Canon-Automatikgrün (2026-10-15)
- Akzentfarbe `#2bb24c`: das Grün, mit dem Canon das Automatikfeld auf dem Modusrad markiert. Näherung nach Aussehen, Canon veröffentlicht keinen Farbwert. Kontrast 7,0:1 auf dem Seitengrund, 6,4:1 auf Karten; Text auf grünen Knöpfen in `#071209` (6,8:1). Rotlicht unverändert.
- Design-System: gleiche Werte, Texte von Amber auf Grün umgestellt, Tableisten-Baustein mit sechs Reitern.

## 1.0.4 – Vorderansicht gestrichen (2026-10-15)
- Die Vorderansicht der Kamera und der Umschalter „von hinten / von vorn“ sind entfernt. Sie mischte zwei Blickwinkel (Gehäuse von vorn, Räder von oben) und zeigte nichts außer der Blendenöffnung, was die Ansicht von hinten nicht auch zeigt.
- Die Blendenöffnung zeigt jetzt ein kleiner Einblick „Blick ins Objektiv“ links oben neben der Kamera; die sieben Lamellen folgen der Blendenzahl. Gilt für Modusrad- und klassische Bauweise.
- Code der Vorderansichten aus `js/lib/camera-svg.js` entfernt.

## 1.1.0 / 1.2.0 – Kamera-Modul ausgebaut (2026-10-15)

**Geht**
- **Virtuelle Kamera mit Livebild:** Der Rückmonitor zeigt die Straßenszene live, darüber eine Infozeile mit Modus, Zeit, Blende, ISO und einer Belichtungsskala, die mitwandert. Lichtwahl Dämmerung/Tageslicht, ND-Filter 3/6/10 Stufen. Programmautomatik mit Auto-ISO (hält 1/30 s), Blendenvorwahl stößt an die längste Zeit der Kamera. Auswertung unter der Kamera: Belichtung, Bewegung, Rauschen, Hinweise wie „Lösung: Bulb und der Timer“. Szene als gemeinsames Modul `js/lib/scene.js`, auch für „Probieren“.
- **Langzeit-Assistent** (`#/camera/long`): Zeit eingeben oder aus den Rechnern übernehmen; entscheidet „direkt in M“ oder „über Bulb/Time“ anhand der Grenzen der Kamera; acht Schritte mit Haken (Stativ, Stabilisator, Fokus, Modus, Blende/ISO mit Radnamen der Marke, Auslösen, Rauschreduzierung, Auslösen/Timer); Timer- und Logbuch-Knopf.
- **„Auf meiner Kamera einstellen“** in Belichtungs-, ND-, Lochkamera- und Filmrechner, dazu Warnungen, wenn Zeit, Blende oder ISO die eigene Kamera überschreiten.
- **Grenzen der eigenen Kamera** in den Einstellungen (leer = Markenwert): längste Zeit ohne Bulb, ISO von/bis, Objektiv größte/kleinste Blende. Standardobjektiv Kit-Zoom f/3,5–22.
- **Übungen** (`#/camera/tasks`): sechs Aufgaben (Lichtspuren, Wasser glatt am Tag, Bewegung einfrieren, Blendenstern, ohne Rauschen, Hintergrund unscharf) mit Prüfen, Tipp, Lösung und Fortschritt. Die Freistell-Übung ist mit dem Kit-Zoom bewusst nicht lösbar.
- **Radbelegung je Marke:** Canon (M: Hauptwahlrad vorn = Zeit, Schnellwahlrad hinten = Blende), Nikon, Sony, Pentax mit Radnamen; Olympus und Panasonic als unsicher markiert. Kamera-Grafik zeigt die Radnamen, das aktive Rad und die passende Zeile.
- Tests: 76 (neu: Kameragrenzen, Übungsprüfung inkl. Nachweis, dass jede Übung lösbar ist, Kameradaten).

**Bitte prüfen**
- Radbelegung für Olympus/OM System und Panasonic am Gerät; Grenzwerte je Marke sind typische Werte, einzelne Modelle weichen ab (z. B. Nikon Z bis 900 s in M).

## 1.2.0 – Veröffentlichungsordner (2026-10-15)
- `tools/build-dist.mjs` baut `dist/` und `dist.zip` für statisches Hosting: genau die PRECACHE-Dateien plus `sw.js`, Schriftlizenz und `_headers` (Service Worker, Startseite und Manifest ohne Browser-Cache, Kamera nur für die eigene Seite). Bricht ab, wenn eine gelistete Datei fehlt oder etwas aus `tools/`/`tests/` oder ein Schlüssel hineingeraten würde.
- `tools/serve.mjs --dist` liefert zum Prüfen nur `dist/` aus. Geprüft: alle Bereiche laden, Service Worker cacht 73 Einträge, keine Konsolenfehler.
- App-Dateien unverändert, daher keine neue Version.

## 1.3.0 – Gehäuse je Marke, „Wo finde ich was?“ (2026-10-15)

**Geht**
- Kamera-Grafik ohne Objektiv und ohne den Einblick „Blick ins Objektiv“.
- Jede Marke hat ihr eigenes Gehäuse nach einem Vorbild-Modell: Canon EOS R6 (Modusrad rechts, Hauptwahlrad hinter dem Auslöser, Schnellwahlrad hinten), Nikon Z 5/6/7 (Modusrad links, Schulterdisplay, Subbefehlsrad vorn am Griff, Hauptbefehlsrad hinten), Sony Alpha 7 III/IV (Modusrad rechts, Korrekturrad, Steuerrad), Pentax K-3 III, Olympus OM-D E-M10 IV (Rad um den Auslöser, hinteres Rad oben), Panasonic G80/G90, Fujifilm X-T5 (ISO-Rad, Zeitenrad, Korrekturrad, Joystick), Leica M10/M11 (Messsucher links, Tasten links vom Monitor). Abweichende Modelle stehen als Hinweis dabei.
- „Wo finde ich was?“ im Reiter Kamera: alle Räder, Tasten, Sucher, Monitor als Liste. Antippen (Liste oder Grafik) lässt das Teil aufleuchten und erklärt es, bei Einstellrädern mit „Es stellt: in Av die Blende, in M die Zeit …“.
- Grafik nutzt die Breite besser (weniger Rand rechts).
- Tests: 77 (neu: Gehäusedaten vollständig, jede Taste hat einen Erklärtext).

**Bitte prüfen**
- Lage der Teile ist je Marke an einem Vorbild ausgerichtet und als „mittel“ bzw. bei Olympus/Panasonic „niedrig“ markiert. Am liebsten mit den Kameras der Teilnehmenden abgleichen und in `data/camera-modes.json` (`body`) korrigieren.
- Leica: Die Angaben zur Programmautomatik („Blendenring auf A“) passen zur Q, nicht zur M; M-Objektive haben kein A.

## 1.4.0 – Kamera ohne Unterreiter, Zusatztexte einklappbar (2026-10-15)
- Unterreiter Langzeit und Übungen entfernt, samt `js/modules/camera-long.js`, `js/modules/camera-tasks.js`, `content/camera-tasks.json`, Texten, Stilen und den zugehörigen Tests. Alte Adressen öffnen die Kamera.
- „Auf meiner Kamera einstellen“ (Belichtungs-, ND-, Lochkamera-, Filmrechner) öffnet jetzt die virtuelle Kamera mit den Werten aus dem Rechner, in M oder bei zu langer Zeit in Bulb.
- Einklappbar und anfangs zu: „So funktioniert es“, „Vorbild: …“ und „Mehr zu {Modus} bei {Marke}“. Die App merkt sich, was offen ist.
- Tests: 75.

## 1.4.1 – ISO-Beschriftung (2026-10-15)
- Am ISO-Regler stand „ISO ISO 400“, jetzt „ISO 400“ (Kamera und Lernen › Probieren).

## 1.5.0 – Kamera-Reiter nach der Leinwand (2026-10-15)
- Aufbau des Kamera-Reiters wie auf der Design-Leinwand: Info-Knopf am Titel statt „So funktioniert es“; Reihenfolge Marke, Kamera, Modi, Regler, „Wo finde ich was?“, „Mehr zu …“.
- Entfernt: Auswertung unter der Kamera, Lichtwahl (fest Dämmerung), Knopf „Grenzen meiner Kamera“, in „Wo finde ich was?“ Einleitung, Vorbild-Hinweis und Platzhalter. Die Liste zeigt nur noch Räder, Auslöser und Sucher; Tasten und Monitor erklärt die App beim Antippen an der Grafik.
- Antippen an der Grafik rollt die Erklärung in die Bildmitte.
- Behoben: unter der Kamera stand „null“.

## 1.6.0 – Kameramodelle aus den Herstelleranleitungen (2026-10-15)

**Geht**
- Neues Feld **Modell** unter der Marke (Kamera-Reiter und Einstellungen). 27 Einträge für Canon (D- und R-Serie), Nikon (Z und D), Sony Alpha und OM System/Olympus; baugleiche Modelle sind zusammengefasst (z. B. „EOS 2000D / 4000D“).
- Je Modell aus der Anleitung: Lage von Modusrad, Sucher, Schulterdisplay, Einstellrädern und Tasten, Radnamen und welches Rad in A, S, M und Bulb was stellt. Kameras mit nur einem Rad (Canon 2000D/250D/R50/R100, Nikon D3500) zeigen „Rad + Taste gedrückt halten“ für die Blende. Sony α6400/α7C: Drehrad hinten für die Zeit. Nikon Z fc/Z f mit Zeitenrad.
- Quelle (Anleitung und Seite) steht unter „Mehr zu …“.
- Korrigiert: Canon 2000D und 250D haben das Modusrad rechts (bisheriger Hinweis sagte links). OM-1: vorderes Rad senkrecht am Griff, Modusrad rechts.
- Tests: 76 (neu: Modelldaten vollständig, jedes genannte Rad existiert am Gehäuse).

**Bitte prüfen**
- Als „mittel“ markiert, weil nach Bauähnlichkeit übertragen oder nur aus der Teileliste: 250D (nach 200D), R8/RP, R7, D3500/D5600, D780/D7500, α6700, α7C, OM-1/E-M1 III, Belegung R6 Mark II.

## 1.7.0 – Funktionen: AF-Modus, Selbstauslöser, Spiegelvorauslösung (2026-10-15)
- „Wo finde ich was?“ hat eine zweite Reihe **Funktionen**. Für alle 27 Modelle steht, wo AF-Modus und Selbstauslöser sitzen, dazu Spiegelvorauslösung bzw. elektronischer erster Verschlussvorhang, mit Quelle aus der Anleitung. Die zugehörige Taste leuchtet an der Kamera auf (z. B. EOS 90D: Taste AF, Sony: Drehrad links für den Selbstauslöser).
- Erklärungen: Einzel-AF gegen nachführenden AF (One-Shot/AI Servo, AF-S/AF-C, S-AF/C-AF), warum 2 s Selbstauslöser auf dem Stativ, was Spiegelvorauslösung und elektronischer erster Verschlussvorhang bringen.
- Canon 2000D: Laut Anleitung keine Spiegelverriegelung, die App rät zum 2-s-Selbstauslöser. Nikon D3500/D780 und OM System ohne Angabe zur Erschütterung („noch nicht erfasst“).
- Tests: 77.

**Bitte prüfen** (als „mittel“ markiert): Menüwege bei Canon R8/R7/R6 Mark II/R100/R10, Nikon außer Z 50, Sony α7 IV/α6700, OM-1/E-M5 III, Canon 250D und 6D Mark II (Tasten).

## 1.7.1 – Canon EOS R5 Mark II (2026-10-15)
- Neues Modell **EOS R5 Mark II / R5**: Statt Modusrad eine MODE-Taste neben dem Hauptwahlrad, der Modus steht im Schulterdisplay. Hauptwahlrad hinter dem Auslöser, Schnellwahlrad 2 oben hinten, Schnellwahlrad 1 als Ring hinten. Radbelegung laut Anleitung: Av, Tv und BULB mit dem Hauptwahlrad; in M Hauptwahlrad die Zeit, Schnellwahlrad 1 die Blende.
- Funktionen: AF-Betrieb im AF-Menü, Selbstauslöser über die Taste M-Fn (10 s, 2 s), Verschlussmodus mechanisch, elektronischer 1. Verschlussvorhang oder elektronisch. Quelle: EOS R5 Mark II Online-Handbuch.
- Grafik kann jetzt Kameras mit MODE-Taste statt Modusrad zeichnen.

## 1.7.2 – Nikon Z 8, Z 9, D850 (2026-10-15)
- Neue Modelle **Z 8**, **Z 9** und **D850**: kein Modusrad, sondern die MODE-Taste links oben im Tastenblock (Z 8 mit BKT, WB, Aufnahmebetriebsart; Z 9 und D850 auf dem Aufnahmebetriebsart-Rad). Modus: MODE-Taste halten und Hauptbefehlsrad drehen, Anzeige im Schulterdisplay. Radbelegung wie bei den anderen Nikons (D850 laut Anleitung geprüft).
- Funktionen: AF über die Fokusmodus-Taste vorn am Objektivanschluss plus Hauptbefehlsrad. Selbstauslöser bei der Z 8 über die Taste für die Aufnahmebetriebsart, bei Z 9 und D850 über das Rad links. D850: Spiegelvorauslösung Mup auf demselben Rad. Z 8 und Z 9 haben keinen mechanischen Verschluss.
- „Wo finde ich was?“ kennt das Aufnahmebetriebsart-Rad.
- Quellen: Nikon Online-Handbücher Z 8, Z 9, D850; Nikon-Produkttext zum rein elektronischen Verschluss der Z 8.

## Veröffentlichung (2026-10-15)
- App liegt auf dem dogado-Webspace (WEB S 5.0) im Ordner der Domain: http://focus-fotografie.de/ – alle 72 Dateien abrufbar, `.htaccess` greift (Service Worker und Manifest ohne Zwischenspeicher, richtiger Typ fürs Manifest), `tools/` nicht online. Die Platzhalterseite von dogado wurde dabei ersetzt.
- Upload: `node tools/deploy.mjs` (Probelauf) und `--go`, rsync über SSH mit dem Schlüssel `~/.ssh/focus_dogado`.
- Offen: HTTPS-Zertifikat (Let's Encrypt) für focus-fotografie.de und www. Ohne HTTPS laufen Kamera, Offline-Betrieb und Installation auf dem Handy nicht.

## Website und App unter /app (2026-10-15)
- Neue Kurs-Website in `site/` (Startseite, Impressum, Datenschutz), Gestaltung wie die App. Inhalte, die noch fehlen, stehen in gestrichelten Kästen („Noch ergänzen“): Ablauf, Termine, Preis, Ort, Kontakt, Kursleitung, Angaben im Impressum und Datenschutz. Bis dahin `noindex`.
- `dist/` = Website, `dist/app/` = App. Die App läuft unverändert unter http://focus-fotografie.de/app/ (alle Pfade relativ, eigener Service Worker mit Scope /app/).
- Aufräum-Service-Worker `site/sw.js` an der Hauptadresse: meldet den alten App-Service-Worker ab, damit frühere Besucher die Website statt der zwischengespeicherten App sehen. Lokal getestet.
- Website mit Zugangscode geschützt (Basic Auth, Benutzer „focus“, Code im Hash in `.htpasswd-focus` im Home-Verzeichnis auf dem Server). Die App unter /app/ und `sw.js` bleiben ohne Code erreichbar. Abschalten: `PROTECT_SITE` in `tools/build-dist.mjs`.
- Geprüft auf focus-fotografie.de: Website ohne Code 401, mit Code 200, falscher Code 401; App und alle 71 App-Dateien ohne Code 200.

## 1.8.0 – Zugang nur für Seminarteilnehmer (2026-10-15)
- Die App fragt beim ersten Öffnen nach einem Kurs-Code (`js/lib/access.js`). Gültige Codes stehen nur als SHA-256-Hash in `data/access.json`, gepflegt mit `node tools/access-code.mjs` (add/off/on/list). Erster Code: „alle“.
- Mit Netz prüft die App beim Start, ob der Code noch gilt; ein gesperrter Code sperrt sie wieder („Dieser Code gilt nicht mehr“). Ohne Netz bleibt eine freigeschaltete App offen. Die Code-Liste holt der Service Worker immer zuerst frisch vom Server.
- Funktioniert auch ohne HTTPS (eigene SHA-256-Umsetzung, falls `crypto.subtle` fehlt). Im Browser geprüft: falscher Code, richtiger Code, gesperrter Code, offline.
- Grenze: eine Sperre, kein Tresor. Die Dateien sind öffentlich abrufbar.
- QR-Code zur App in `print/qr-app.svg` und `print/qr-app.png` (https://focus-fotografie.de/app/), Inhalt per Decoder geprüft.
- Tests: 80.
- Gestalteter QR-Code `print/qr-app-logo.svg` und `.png`: leicht abgerundete Punkte, abgerundete Erkennungsquadrate, Schriftzug „focus“ mittig (höchste Fehlerkorrektur, Version 6, Logo deckt 11 % ab). Runde Punkte wurden verworfen, weil sie sich nicht zuverlässig einlesen ließen. Lesbarkeit per Decoder geprüft von 150 bis 1500 Pixel. Erzeugt mit dem npm-Paket qrcode 1.5.4 außerhalb des Projekts.

## 1.8.2 – HTTPS live, Updates zuverlässig (2026-10-15)
- Let's-Encrypt-Zertifikat für focus-fotografie.de (gilt auch für www, bis 13.01.2027, dogado verlängert automatisch). Weiterleitung http → https in oneHome aktiv und wirksam (301, greift vor dem Code-Schutz der Website).
- Behoben: Beim ersten Besuch lud die App neu, sobald der Service Worker übernahm; ein gerade getippter Kurs-Code ging verloren. Neu geladen wird nur noch bei Updates.
- Behoben: Der Service Worker konnte beim Vorladen alte Dateien aus dem Browser-Zwischenspeicher übernehmen. Jetzt lädt er mit `cache: 'reload'`; zusätzlich schickt der Server für js/css/json/md/html `Cache-Control: no-cache` (Prüfung per ETag).
- Geprüft auf https://focus-fotografie.de/app/ mit leerem Browser: Sperrbildschirm, Code 2211, App offen, Service Worker aktiv, 73 Einträge im Offline-Speicher. Der QR-Code führt ohne Warnung zur App.

## 1.9.0 – Teile direkt an der Kamera benennen (2026-10-15)
- „Wo finde ich was?“ zeigt nur noch die **Funktionen** (AF-Modus, Selbstauslöser, Spiegelvorauslösung bzw. erschütterungsfrei auslösen). Die Liste der Teile ist entfernt.
- Tippt man an der Kamera-Grafik auf ein Teil, erscheint sein Name als grünes Schild direkt daneben und die Erklärung gleich unter der Grafik. Nochmal tippen blendet beides aus. Wählt man eine Funktion, bekommt die zugehörige Taste ebenfalls ein Namensschild (z. B. „Taste AF“).
- Einleitungstext angepasst.

## 1.10.0 – Aufnahme aufgeräumt, Kamera bleibt offen (2026-10-16)
- Die drei Aufnahmearten (Mitteln, Aufhellen, Integrieren) stehen jetzt ganz unten unter „Art der Aufnahme“.
- Die Erklärung der gewählten Art, die Grenzen („Was das Handy hier nicht kann“) und der Link zum Lernmodul liegen hinter einem „i“ am Titel. Die App merkt sich, ob der Text offen ist (`captureInfoOpen`).
- Das Bildfenster ist größer: Hochformat 3:4, bis 72 % der Bildschirmhöhe, auf dem Handy bis an den Rand.
- Die Kamera bleibt beim Reiterwechsel 5 Minuten offen (`acquireCamera`/`releaseCamera` in `js/lib/camera.js`). Wer in dieser Zeit zurückkommt, wird nicht neu gefragt. Auch „Verwerfen“ nach einer Aufnahme fragt nicht mehr. Geht die App in den Hintergrund, wird die Kamera sofort freigegeben.
- Grenze: Eine auf dem Homescreen installierte App fragt unter iOS nach jedem Neustart wieder. In Safari kann man die Kamera pro Website dauerhaft erlauben.

## 1.11.0 – „Langzeitaufnahme“ (2026-10-16)
- Der Reiter „Aufnahme“ heißt jetzt „Langzeitaufnahme“ (Titel, Seitentitel, Logbuch-Quelle, Datenschutztext). In der unteren Leiste steht kurz „Langzeit“ (`nav.captureTab`), weil das ganze Wort nicht in die 62 px breiten Reiter passt.
- Verstärkung (beim Integrieren) und Kameraeinstellungen stehen jetzt unter den Zeit-Knöpfen. Ganz unten bleiben die drei Arten der Aufnahme.

## 1.12.0 – Moduswahlrad unter der Kamera (2026-10-16)
- Im Reiter „Kamera“ sind die Modus-Knöpfe unter der Grafik durch ein drehbares Moduswahlrad ersetzt (`js/lib/mode-dial.js`). Die gewählte Art steht oben an der grünen Marke. Antippen eines Kürzels oder Drehen mit dem Finger wählt (rastet ein), Pfeiltasten gehen auch.
- Die Beschriftung richtet sich nach der Marke: Canon und Pentax P/Av/Tv/M/B, Nikon, Sony, OM System und Panasonic P/A/S/M. Wo die Marke kein kurzes Kürzel hat (z. B. Bulb bei Nikon nur in M, Fujifilm/Leica mit Zeitenrad, Handys), steht das allgemeine Kürzel; die Zeile darunter nennt dann die Angabe der Marke („Nikon: Bulb / Time in M“).
- Geprüft im Browser (Handygröße): Antippen von M, Drehen um 90° zurück auf Av, Markenwechsel auf Nikon.

## 1.13.0 – Reiter umsortiert, „Kurs“ (2026-10-16)
- Untere Leiste jetzt: Langzeit · Kamera · Rechner · Timer · Kurs · Logbuch („Kamera“ und „Rechner“ getauscht).
- „Lernen“ heißt jetzt „Kurs“ (Reiter, Titel, Hinweis „Mehr dazu im Kurs.“).

## 1.14.0 – Canon EOS 5D Mark IV (2026-10-16)
- Neues Modell EOS 5D Mark IV (nach der 6D Mark II). Quelle: Canon EOS 5D Mark IV Bedienungsanleitung (DE), Ausgabe von gdlp01.c-wss.com, Teilebezeichnungen S. 28–30, Modus-Wahlrad S. 35.
- Gehäuse: Modus-Wahlrad links mit Sperrtaste, LCD-Anzeige, Tasten WB, AF·DRIVE, ISO, Hauptwahlrad hinter dem Auslöser, Schnellwahlrad mit SET, AF-ON, ✱, Q, ▶. Reihenfolge der oberen Tasten als „mittel“ markiert (in der Anleitung nur als Bild).
- Räder: Av und Tv mit dem Hauptwahlrad, in M Zeit am Hauptwahlrad und Blende am Schnellwahlrad (S. 251), B mit beiden Rädern (S. 260).
- Funktionen: AF-Betrieb über Taste AF·DRIVE und Hauptwahlrad (S. 100), Selbstauslöser über AF·DRIVE und Schnellwahlrad (S. 163), Spiegelverriegelung im Aufnahmemenü, Registerkarte 4 (S. 276).
- Neue Taste „AF·DRIVE“ mit Erklärtext in `i18n/de.json`.

## 1.15.0 – Verstärkung unter „Einstellungen“ (2026-10-16)
- Langzeitaufnahme: Die Verstärkung (nur beim Integrieren) steht jetzt im aufklappbaren Bereich, der statt „Kameraeinstellungen“ nur noch „Einstellungen“ heißt. Darunter folgen wie bisher die Regler, die das Handy anbietet (Belichtungskorrektur, Belichtungszeit, ISO, Fokus- und Weißabgleich-Sperre).
- Der Bereich erscheint, sobald es etwas einzustellen gibt: beim Integrieren immer, sonst nur, wenn das Handy Regler anbietet.

## 1.16.0 – Auslöser ohne Scrollen erreichbar (2026-10-16)
- Langzeitaufnahme: Der Auslöser liegt jetzt unten mittig im Bild (88 px, wie in der Kamera-App). Die Zeiten stehen in einer Zeile darunter, zum Wischen.
- Die Bildhöhe richtet sich nach dem Bildschirm (`--cap-chrome` in `css/base.css`): Titel, Bild mit Auslöser und Zeiten passen ohne Scrollen zwischen Kopfzeile und Reiterleiste. Breite auf dem Handy weiter bis an den Rand. Mindesthöhe 260 px.
- Histogramm und Vergleichszeile beim Integrieren sitzen jetzt oben im Bild, damit sie den Auslöser nicht verdecken.
- Geprüft bei 390 × 664 px: Bild 390 × 384, Zeiten enden 27 px über der Reiterleiste, keine seitliche Verschiebung.

## 1.17.0 – Angetipptes Rad erscheint groß (2026-10-16)
- Kamera: Unter der Grafik steht eine „Bühne“. Ohne Auswahl zeigt sie das Moduswahlrad. Tippt man an der Kamera ein Einstellrad an (Hauptwahlrad, Schnellwahlrad, vorderes/hinteres Rad, Daumenrad, Zeitenrad, ISO), erscheint es groß als Walze (`js/lib/command-dial.js`): Wert darüber, darunter, was das Rad im gewählten Modus stellt. Drehen mit dem Finger, die Knöpfe ‹ › oder Pfeiltasten stellen den Wert; Grafik, Livebild und Regler gehen mit. Stellt das Rad im Modus weder Zeit noch Blende, ist die Walze ausgegraut und sagt das.
- Nochmal antippen oder das Modusrad an der Grafik antippen bringt das Moduswahlrad zurück.
- Der längere Erklärtext unter der Kamera ist entfernt; angetippte Teile zeigen nur noch ihr Namensschild.
- Die kurze Moduszeile (z. B. „M · Hauptwahlrad: Zeit · Schnellwahlrad: Blende“) steht jetzt größer direkt unter der Grafik statt klein im Bild.
- Belegung aus `dialUses()` in `js/lib/camera-svg.js` (dieselben Daten wie die Moduszeile, je Modell aus `data/camera-modes.json`).

## 1.18.0 – Art der Aufnahme unter „Einstellungen“ (2026-10-16)
- Langzeitaufnahme: „Art der Aufnahme“ (Mitteln, Aufhellen, Integrieren) steht jetzt oben im Bereich „Einstellungen“, darunter die Verstärkung (nur Integrieren) und die Regler des Handys. Der Bereich ist immer da; offen/zu merkt sich die App (`captureSettingsOpen`).
- Eigenes „i“ neben „Art der Aufnahme“: erklärt alle drei Arten, die gewählte ist grün (`captureModesInfoOpen`).
- Erklärtexte der Arten verständlicher formuliert (ohne „Akkumulator“).
- Das „i“ am Titel zeigt nur noch „Was das Handy hier nicht kann“ und den Link zum Kurs.

## 1.19.0 – „Was das Handy hier nicht kann“ entfernt (2026-10-16)
- Langzeitaufnahme: Abschnitt „Was das Handy hier nicht kann“ und das „i“ am Titel entfernt (Texte `capture.limits` und `capture.info` gelöscht). Der Link „Mehr dazu im Kurs.“ steht jetzt am Ende der Erklärung der Aufnahmearten.
- Kurs-Aufgabe in `content/tasks.json`: Verweis auf diese Karte aus der Lösung gestrichen.

## 1.20.0 – Unter der Kamera nur das Moduswahlrad (2026-10-16)
- Die große Walze für angetippte Einstellräder (1.17.0) ist wieder entfernt (`js/lib/command-dial.js` gelöscht, `dialUses` und die Texte `camera.stage` raus). Unter der Kamera steht immer das Moduswahlrad.
- Bleibt aus 1.17.0: Angetippte Teile zeigen ihr Namensschild an der Grafik, kein langer Erklärtext; die kurze Moduszeile steht größer direkt unter der Grafik.

## 1.21.0 – Fehler aus dem externen Test behoben (2026-10-16)
Externer Test (Claude im Browser, 390 px, Testkamera) auf 1.19/1.20. Umgesetzt:
- **Logbuch (ernst):** Ein Eintrag mit negativer Blende ließ das ganze Logbuch dauerhaft abstürzen. Jetzt prüft `js/core/entry.js` beim Speichern, beim Logbuch-Import und beim Gesamt-Import: Blende, Zeit, ISO, Bilder > 0, ND ≥ 0; leere Einträge werden abgelehnt (Hinweis als Toast). `fmtAperture`/`fmtShutter` zeigen bei ungültigen Werten „–“ statt einen Fehler zu werfen, alte kaputte Einträge erscheinen also wieder. Tests: `tests/entry.test.js`.
- **„null“ als Text:** `append()` mit `x ? el() : null` in `camera-view.js`, `camera-finder.js` und `learn-graphics.js` behoben.
- Timer: Start- und Abbrechen-Knopf bleiben über der Reiterleiste stehen (sticky); die große Zahl hat eine Einheit (s, min, h).
- Langzeitaufnahme: Das Bildfenster übernimmt das Seitenverhältnis des Videos, kein schwarzer Leerraum mehr.
- Kurs, Karte 5: Bildunterschrift der Grafik in zwei Zeilen, nicht mehr abgeschnitten. Knopf heißt „Langzeitaufnahme“.
- Sperrbildschirm: Hinweis bei leerem Code.
- Toasts nutzen die Breite (`width: max-content`); Knöpfe in Reihen brechen nicht mehr mitten im Text um, sondern rutschen als Ganzes in die nächste Zeile.
- Texte: „Kursleitung: (Platzhalter)“ ausgeblendet, bis ein Name eingetragen ist (`settings.instructor`); Schrift-Hinweis korrigiert (Work Sans wird mitgeliefert); „focus Lab“ entfernt (Sicherung heißt `focus-backup-….json`, alte `focuslab-backup`-Dateien lassen sich weiter einlesen; Logbuch-, Film- und Bild-Dateinamen ebenso); „Modul Aufnahme“ → „Langzeitaufnahme“; „Feste Blende: Verstellen kann dein Handy sie nicht.“; Vibrationshinweis ohne „(iPhone)“; Website: 32 Kameramodelle.
- Offen: Website-, Impressums- und Datenschutz-Angaben (vom Kursleiter), echte Bildrate am Handy prüfen (Testkamera lieferte bei 4K nur 3,5 Bilder/s).

## 1.21.1 – Name „Hauptwahlrad“ eindeutig zugeordnet (2026-10-16)
- Kamera-Grafik: Bei Modellen mit Rad am Auslöser (vorn „release“ oder „collar“, z. B. Canon EOS R6, R7, R8) stand der Name des vorderen Rads („Hauptwahlrad“, „vorderes Einstellrad“ …) oben rechts frei über der Kamera, direkt über dem Modusrad. Er las sich wie dessen Name. Jetzt führt eine feine Linie vom Namen zum Rad (`cam-leader`).

## 1.22.0 – Langzeitaufnahme schneller und physikalisch richtig (2026-10-16)
Nach Vorschlägen aus einer Code-Durchsicht (Claude im Browser):
- **Stapeln auf der Grafikkarte** (`js/lib/gpu-stack.js`, WebGL2 + `EXT_color_buffer_float`): Jedes Videobild geht als Textur auf die GPU und wird dort in einen 32-Bit-Float-Puffer addiert bzw. als Maximum übernommen. Mit `EXT_float_blend` ein Puffer (Blending, für Aufhellen `MAX`), sonst zwei Puffer im Wechsel. Ausgelesen werden nur ein 128er-Abbild für Histogramm und Ausbrennen, das erste Bild in Vorschaugröße und das Endergebnis. Klappt etwas nicht (keine Erweiterung, zu wenig Grafikspeicher, Kontext verloren), rechnet wie bisher der Worker auf dem Prozessor. Abschaltbar über die Einstellung `gpuStack` (nur für Tests).
- **Lineares Licht:** Beide Wege rechnen sRGB → linear vor dem Addieren und zurück bei der Ausgabe (Worker über Nachschlagetabellen). Integrieren ergibt damit wirklich die doppelte Lichtmenge bei doppelter Bilderzahl; Mitteln wird in den Lichtern nicht mehr zu dunkel. Tests: `tests/stack-worker.test.js`.
- **Längere Belichtung pro Bild** (wo das Gerät manuelle Belichtung erlaubt, vor allem Android-Chrome): gleiche Helligkeit wie die Automatik, aber Zeit bis zur vollen Bilddauer und ISO so niedrig wie möglich; beim Integrieren rund 3 Stufen Reserve (wird beim Verstärken wieder ausgeglichen). Reicht selbst ISO-Minimum nicht: Hinweis „Zu hell für lange Einzelbilder … ND-Filter“. Fokus wird während der Aufnahme ebenfalls gesperrt. Auf dem iPhone bietet Safari diese Regler nicht an, dort bleibt die Automatik.
- **Verpasste Bilder zählen:** Mit `requestVideoFrameCallback` zeigt die Anzeige „Bild 287 von 300“, das Ergebnis „Einzelbilder 287 von 300“. Neu im Ergebnis: „Gerechnet auf: Grafikkarte / Prozessor“.
- **Auflösung wählbar** unter Einstellungen: „Tempo (Full HD)“ mit bis zu 60 Bildern/s oder „Detail (4K)“ mit 30. Standard: Mitteln Detail, Aufhellen und Integrieren Tempo; die Wahl merkt sich die App je Art.
- Hinweis auf Wärme nach 2 Minuten Aufnahme.
- Geprüft im Browser mit Demo-Strom (1280 × 720): Grafikkarte 60 Bilder in 2 s (30 fps) in allen drei Arten, Ergebnis gleich hell wie über den Prozessor (31,7 zu 31,6), richtig herum, Lichtspur durchgehend. Am Handy noch zu messen: Bildrate bei 4K und Full HD, Verhalten bei wenig Grafikspeicher, Android mit manueller Belichtung.

## 1.23.0 – Kamera-Grafik als Handzeichnung (2026-10-16)
- Neuer Strichstil nach einer Stilvorlage des Kursleiters (Doodle-Zeichnung; Bild nur als Stilvorbild, nicht übernommen): helle Linien auf dem Kartenhintergrund statt grauer Flächen, runde Ecken.
- Handgezeichneter Strich über SVG-Filter: `#cam-sketch` für große Umrisse (Gehäuse, Deckel, Sucherbuckel, Okular, Monitor, Schulterdisplay; zwei leicht versetzte, wackelnde Striche), `#cam-sketch-s` für Räder, Tasten, Fenster (ein milder Strich). Schrift bleibt scharf. Glanzstriche und Schraffur am Sucher (`.cam-glint`).
- Formen rundlicher: Deckel, Rückseite (oben und unten), Sucherbuckel, Okular, Monitor (Livebild rund zugeschnitten), Schulterdisplay.
- Gilt für alle Bauformen (pasm, dials, phone, pinhole); Antippen, Namensschilder, aktive Räder (grün) und Rotlicht unverändert. Gestaltung am Ende von `css/base.css` („Kamera-Grafik im Strichstil“).
- Offen: Baustein „Camera“ im Design-System neu bündeln.

## 1.23.1 – Ohne Blitzschuh, Sucher im Blitzschuh-Stil (2026-10-16)
- Blitzschuh aus allen Bauformen entfernt.
- Der Sucherbuckel oben ist jetzt ein flaches Rechteck mit leicht runden Ecken und dünnem, mild wackelndem Strich (Stil des früheren Blitzschuhs) statt des Trapezes mit Doppelstrich und Schraffur. Antippen zeigt „Sucher“ und hebt Buckel und Okular hervor.

## 1.24.0 – Näher an der Stilvorlage: angedeutetes Objektiv (2026-10-16)
- Auf Wunsch wieder ein Objektiv, aber nur angedeutet: Kreis mit Ring und Schraffur, der oben rechts neben dem Sucher hinter dem Gehäuse herausragt (`lensBehind` in `js/lib/camera-svg.js`, kein Bedienteil). Die Regel „kein Objektiv“ in CLAUDE.md ist entsprechend angepasst.
- Seitenwand rechts als schmaler Streifen: Die Kamera wirkt leicht schräg von hinten gesehen, wie in der Vorlage.
- Gilt für alle Bauformen mit Deckel (pasm, dials); Handy und Lochkamera unverändert.

## 1.24.1 – Auslöser wieder auf der Kamera (2026-10-16)
- Durch die runden Deckel-Ecken (1.23.0) lag der Auslöser oben rechts außerhalb des Umrisses und wirkte wie ein roter Punkt neben der Kamera. Der Deckel hat jetzt rechts eine fast senkrechte Griffseite (wie in der Vorlage); der Auslöser liegt bei allen 32 Modellen innerhalb (per Skript geprüft).
- Auslöser im Strichstil als Umriss statt roter Fläche.

## 1.25.0 – Kamera-Form näher an der Stilvorlage (2026-10-16)
- Linker Rand: weicher Bogen von der Rückseite hinauf zur Oberseite statt schräger Kante.
- Rechter Rand: stark gerundete Griffecke, die in die durchgehende Seitenwand übergeht.
- Sucherbuckel wie in der Vorlage: runde Kuppel hinten, davor ein Okularblock mit gewölbtem Fenster und schräger Seitenfläche auf der Oberseite (antippbar als „Sucher“). Das bisherige Okular auf der Rückwand entfällt. Der Block wird vor den Rädern gezeichnet, damit benachbarte Modus- und Zeitenräder (Canon R8/R10, Nikon Zf/Zfc, Fujifilm, OM System) obenauf liegen.
- Auslöser liegt weiter bei allen Modellen auf der Kamera (geprüft).

## 1.25.1 – Linker Rand geschlossen, Sucher entfernt (2026-10-16)
- Nach einer Skizze des Kursleiters im Skizzenblock: Am linken Rand liefen Deckel und Rückwand mit runden Ecken nach innen, dazwischen war eine Kerbe. Jetzt gehen beide gerade ineinander über, der Rand ist eine durchgehende Linie.
- Der Sucher in der Mitte (Kuppel, Okularblock, Seitenfläche) ist auf Wunsch komplett entfernt. Das angedeutete Objektiv bleibt. Der Sucher links bei Messsucher-Bauform (Fujifilm, Leica) ist unverändert.

## 1.26.0 – Prismenbuckel nach Skizze (2026-10-16)
- Neuer Sucher nach der Skizze des Kursleiters im Skizzenblock („so ähnlich der Sucher, in hübsch und passend, Linien parallel, Stoßpunkte auf Linien“): Kasten in Schrägansicht auf der Oberseite. Vorderfläche unten bündig mit der Kante zur Rückwand, oben links gerundet, rechteckiges Okularfenster; Dach nach hinten oben mit zwei Schraffurlinien; rechte Seitenfläche.
- Geometrie mit einer gemeinsamen Tiefenrichtung: Dach- und Seitenkanten exakt parallel, Ober- und Unterkante waagrecht, alle Ecken auf denselben Punkten. Nur der milde Handstrich (`#cam-sketch-s`), damit die Stoßpunkte sitzen. Antippbar als „Sucher“.
- CLAUDE.md: „kein Sucher in der Mitte“ ersetzt durch den Prismenbuckel nach Skizze.

## 1.26.1 – Sucher etwas runder (2026-10-16)
- Prismenbuckel: Außenumriss als ein Pfad mit runden Ecken (vorn oben links, hinten am Dach, hinten unten an der Seite). Die inneren Kanten (Vorderfläche/Dach, Vorderfläche/Seite, Dach/Seite) setzen genau auf der Mitte der Rundungen an, die Stoßpunkte bleiben auf den Linien. Okularfenster runder.

## 1.26.2 – Sucherecke links runder (2026-10-16)
- Prismenbuckel: linke obere Ecke der Vorderfläche deutlich runder (Radius 9 → 17); die Kante zum Dach setzt weiter auf der Mitte der Rundung an.

## 1.26.3 – Innere Sucherecke gerundet (2026-10-16)
- Nach Skizze im Skizzenblock: Die innere Ecke oben rechts an der Vorderfläche des Suchers (Treffpunkt von Vorderkante, Seitenkante und Dachkante) ist jetzt deutlich gerundet (Radius 12). Die Dachkante setzt auf der Mitte der Rundung an.

## 1.26.4 – Keine feste Beschriftung „Hauptwahlrad“ (2026-10-16)
- Die graue Beschriftung des vorderen Rads oben rechts im Kamerabild (z. B. „Hauptwahlrad“, „Subbefehlsrad“, „vorderes Rad“) samt Hinweislinie ist entfernt. Der Name erscheint beim Antippen als Namensschild und steht in der Moduszeile unter der Kamera. Die Beschriftung des hinteren Rads (z. B. „Schnellwahlrad“) bleibt.

## 1.26.5 – Moduszeile verständlicher (2026-10-16)
- Die Zeile unter der Kamera nennt jetzt zuerst das Modusrad und dann, welches Rad was stellt: „Modusrad auf M · Zeit am Hauptwahlrad · Blende am Schnellwahlrad“ (vorher „M · Hauptwahlrad: Zeit · …“, das las sich, als sei das Hauptwahlrad das Modusrad). Bei MODE-Taste: „MODE-Taste: M · …“. Tastenkombination: „Blende am Hauptwahlrad (mit Av± gedrückt)“. Radnamen im Dativ („am vorderen Einstellrad“).
- Bulb bei Nikon, Sony und Panasonic (kein B auf dem Modusrad): „Modusrad auf M, Zeit auf Bulb · …“.

## 1.27.0 – „focus photography“ in der Kopfzeile (2026-10-16)
- Hinter der Wortmarke „focus“ steht in der App-Kopfzeile jetzt „photography“: gleiche Schrift (Work Sans Light, wie die Wortmarke), alles klein, gleiche x-Höhe (10,2 px) und auf der Grundlinie von „focus“ (Abweichung unter 0,5 px). Text in `i18n/de.json` (`app.tagline`), Link-Beschriftung „focus photography“.
- Geprüft bis 320 px Breite: keine Überlappung mit den Knöpfen rechts.

## 1.28.0 – Kamera schmaler, mehr Platz rechts (2026-10-16)
- Kamera-Grafik links um 16 Einheiten gekürzt (Deckel, Rückwand, Glanzstriche; Sichtbereich 304 statt 320 breit). Rechte Seite unverändert.
- Sucher (Prismenbuckel) und angedeutetes Objektiv 14 nach links: mehr Platz zwischen Sucher und den Rädern und Tasten rechts.
- Mitgerückt: Modusrad links (x 92), Tasten links (Leica), Messsucher-Okular (Fujifilm, Leica). Monitor links schmaler (rechte Kante wie gehabt, minus 6).
- Beschriftung des hinteren Rads bleibt zwischen Monitor und Seitenwand; lange Namen („Schnellwahlrad 1“) etwas kleiner.
- Per Skript für alle Modelle geprüft: kein Teil außerhalb des Sichtbereichs, keine Beschriftung über Monitor oder Seitenwand.

## 1.29.0 – Ohne großes Moduswahlrad, „Wo finde ich was?“ unter der Kamera (2026-10-16)
- Das große Moduswahlrad unter der Kamera (1.12.0) ist entfernt (`js/lib/mode-dial.js` gelöscht). Den Modus wechselt man jetzt an der Kamera selbst: Modusrad antippen schaltet zum nächsten Modus (P → Av → Tv → M → B), bei MODE-Taste (Canon R5, Nikon Z 8/Z 9/D850) die Taste, bei Fujifilm und Leica das Zeitenrad. Die Kürzel auf dem Modusrad bleiben direkt wählbar. Hinweiszeile unter der Moduszeile („Modusrad antippen: nächster Modus.“).
- „Wo finde ich was?“ steht direkt unter der Kamera, damit die hervorgehobene Taste sofort sichtbar ist; Regler und „Mehr zu …“ folgen darunter.

## 1.30.0 – Drehbares Rad wieder da, mit Namen je Kamera (2026-10-16)
- Das drehbare Moduswahlrad unter der Kamera ist zurück (`js/lib/mode-dial.js`), jetzt mit Überschrift, wie das wichtigste Rad an dieser Kamera heißt: „Modusrad“, „MODE-Taste (mit dem Einstellrad drehen)“ bei Canon R5 und Nikon Z 8/Z 9/D850, „Zeitenrad und Blendenring“ bei Fujifilm und Leica, „Aufnahmemodus“ bei Handys. Kürzel je Marke, Angabe der Marke darunter, wo nötig.
- Reihenfolge im Kamera-Reiter: Kamera, „Wo finde ich was?“, Rad, Regler. Rad und Grafik bleiben gekoppelt (Antippen des Modusrads an der Grafik dreht auch das große Rad weiter). Die Hinweiszeile „antippen: nächster Modus“ aus 1.29.0 ist wieder entfernt.

## 1.31.0 – Kurze Erklärung zum angetippten Teil (2026-10-16)
- Kamera: Unter der Moduszeile erscheint beim Antippen eines Teils eine kurze Erklärung („Hauptwahlrad: In M stellt es die Zeit.“). Bei Einstellrädern passend zum gewählten Modus (wechselt mit, wenn man den Modus dreht), bei Tasten und anderen Teilen der erste Satz der ausführlichen Erklärung (`shortPart` in `js/modules/camera-finder.js`). Nochmal antippen blendet sie aus.
- Text der Taste AF korrigiert (Canon 90D, 6D Mark II): Sie wählt den AF-Betrieb, nicht das Scharfstellen mit dem Daumen (das ist AF-ON).

## 1.31.1 – Grün nur für das angetippte Teil (2026-10-16)
- Die Einstellräder werden nicht mehr automatisch grün, wenn sie im gewählten Modus etwas stellen (das Hauptwahlrad war dadurch fast immer grün). Grün ist jetzt nur das angetippte und unten erklärte Teil (bzw. das in „Wo finde ich was?“ gewählte), bei Rädern samt Riffelung.

## 1.32.0 – Kleines Moduswahlrad über der Kamera (2026-10-16)
- Das drehbare Rad steht jetzt verkleinert (130 px) über der Kamera, rechts daneben: wie das Rad an dieser Kamera heißt, die Stellung („Av · Blendenvorwahl“), was sie bedeutet („Du wählst: Blende. Die Kamera wählt: Zeit.“) und wo nötig die Angabe der Marke.
- Dreht man das kleine Rad, wird an der Kamera-Grafik das Teil grün, mit dem man den Modus wählt (Modusrad, MODE-Taste bzw. bei Fujifilm/Leica das Zeitenrad), mit Namensschild und kurzer Erklärung darunter.
- Reihenfolge: Marke/Modell, Rad mit Bedeutung, Kamera, „Wo finde ich was?“, Regler.

## 1.32.1 – Unter der Kamera nur noch das Angewählte (2026-10-16)
- Die lange Moduszeile unter der Kamera („Modusrad auf Av · Blende am Hauptwahlrad · …“) entfällt; die Bedeutung des Modus steht neben dem kleinen Rad.
- Unter der Kamera steht nur noch eine ganz kurze Erklärung zum angewählten Teil: „Hauptwahlrad: stellt die Blende.“, „Modusrad: wählt den Modus, gerade Av.“, „Schnellwahlrad: stellt in Av weder Zeit noch Blende.“ Ohne Auswahl bleibt die Zeile leer.

## 1.33.0 – Kamera erst auf Knopfdruck (2026-10-16)
- Langzeitaufnahme: Die Kamera bleibt beim Öffnen aus. Im Bildfenster steht „Die Kamera ist aus …“ mit dem Knopf „Kamera einschalten“; der Auslöser ist so lange ausgeblendet. Läuft die Kamera aus derselben Sitzung noch (kurzer Reiterwechsel, `cameraIsLive()` in `js/lib/camera.js`), ist sie gleich wieder an; nach Rückkehr aus dem Hintergrund nur, wenn sie vorher an war.
- Beim Einschalten werden alle Genehmigungen in einem Rutsch abgefragt: erst Bewegungssensor (Hinweis auf Verwackeln; iOS verlangt die Rückfrage direkt aus dem Tippen heraus), dann Kamera. Der bisherige Hinweis-Kasten „nur lokal“ ist in den Text im Bildfenster übergegangen.
- Datenschutzerklärung der Website entsprechend ergänzt (Kamera erst nach Einschalten, Bewegungssensor nur während der Aufnahme, bleibt auf dem Gerät).

## 1.33.1 – Kamera aus beim Verlassen des Reiters (2026-10-16)
- Langzeitaufnahme: Beim Verlassen des Reiters wird die Kamera sofort freigegeben (vorher 5 Minuten offen gehalten). Beim Zurückkommen ist sie aus, mit „Kamera einschalten“.

## 1.34.0 – Kurs vorerst gesperrt („coming soon“) (2026-10-16)
- Der Reiter „Kurs“ zeigt vorerst nur „coming soon – Die Kursinhalte werden gerade vorbereitet.“, auch bei direkten Links auf einzelne Karten. Lernkarten, Aufgaben und Grafiken bleiben im Projekt.
- Schalter `COURSE_OPEN` in `js/lib/features.js` (neu, in PRECACHE). Solange `false`, sind Verweise aus anderen Reitern in den Kurs ausgeblendet („Mehr dazu im Kurs.“ bei Langzeit, Lernkarte „Modusrad“ in den Einstellungen; im Rechner führt „Kamera wählen“ zu den Einstellungen). Zum Freischalten auf `true` setzen, Version hochzählen, hochladen.

## 1.34.1 – Blende ab f/2,8 (2026-10-16)
- Standardobjektiv (`lensDefault` in `data/camera-modes.json`) jetzt f/2,8 bis f/22 statt Kit-Zoom f/3,5 bis f/22. Gilt für Kamera-Reiter und Rechner, solange in den Einstellungen kein eigenes Objektiv eingetragen ist.

## 1.35.0 – Sensorformate der Kameras (2026-10-16)
- Alle 32 Modelle haben jetzt ein Sensorformat (`sensor` in `data/camera-modes.json`: Format, Nennmaß, Formatfaktor; Quelle: technische Daten der Hersteller): Vollformat bzw. Nikon FX (Faktor 1), Canon APS-C (1,6), Nikon DX und Sony APS-C (1,5), Micro Four Thirds (2). Bei den allgemeinen Markeneinträgen nur, wo eindeutig: Fujifilm X (APS-C), Leica M (Vollformat), OM System (MFT).
- Kamera-Reiter: Unter der Modellwahl steht z. B. „Sensor: APS-C, ca. 22,3 × 14,9 mm, Formatfaktor 1,6“ bzw. „Sensor: Vollformat, 36 × 24 mm (wie Kleinbildfilm)“.
- Test: jedes Modell hat Format, Maß und einen der vier Formatfaktoren.

## 1.35.1 – Tasten passen, Modusrad leichter zu treffen (2026-10-16)
- Tasten oben höchstens 28 Einheiten breit; lange Beschriftungen werden in die Taste gestaucht. „AF·DRIVE“ (5D Mark IV) ragt nicht mehr ins Schulterdisplay. Bei der R5 sitzen MODE- und M-Fn-Taste neben statt auf dem Schulterdisplay. Per Skript geprüft: keine Taste überlappt das Schulterdisplay.
- Größere, unsichtbare Tippflächen für Modusrad, MODE-Tasten und Tasten oben. Antippen eines Kürzels am Modusrad der Grafik wählt den Modus, macht das Modusrad grün und erklärt es (wie beim kleinen Rad).
- Kleines Rad über der Kamera: 150 statt 130 px, größere Trefferflächen für die Kürzel, Tipp auf die Mitte schaltet einen Modus weiter.

## 1.35.2 – Überschrift „Kameraeinstellungen“ (2026-10-16)
- Kamera-Reiter: Über den Schiebereglern für Blende, Zeit, ISO und ND-Filter steht jetzt die Überschrift „Kameraeinstellungen“.

## 1.36.0 – ND-Rechner: Filter zur Zielzeit (2026-10-16)
- Rechner → ND hat zwei Richtungen, umschaltbar oben: „Zeit → Filter“ (neu, Standard) und „Filter → Zeit“ (bisher).
- Zeit → Filter: gemessene Zeit ohne Filter und gewünschte Zeit (Schnellwahl 1 s bis 8 min oder Sekunden eingeben) → fehlende Stufen und bis zu drei Vorschläge aus „Meine Filter“ (einzeln oder als Kombination aus bis zu drei Filtern, jeder einmal; weniger Filter leicht bevorzugt). Je Vorschlag: tatsächliche Belichtungszeit, Abweichung und wie man sie ausgleicht (Blende schließen/ISO senken bzw. Blende öffnen/ISO erhöhen), Knöpfe „Timer starten“ und „Als Stapel übernehmen“. „Auf meiner Kamera einstellen“ übernimmt den besten Vorschlag.
- „Meine Filter“: antippen, welche ND-Filter man hat (Einstellung `ndOwn`, Standard ND8, ND64, ND1000).
- Rechenkern `suggestNdFilters` in `js/core/exposure.js`, Tests in `tests/nd-suggest.test.js`.
- Kamera-Reiter: Überschrift „Wo finde ich was?“ jetzt wie „Kameraeinstellungen“ über der Karte.

## 1.37.0 – „i“ mit Kurzinfos in jedem Reiter (2026-10-16)
- Alle Reiter (Langzeit, Kamera, Rechner, Timer, Kurs, Logbuch) haben neben der Überschrift ein „i“. Es blendet eine Karte mit den wichtigsten Infos in vier bis fünf kurzen Punkten ein; offen/zu merkt sich die App je Reiter (`helpOpen.<reiter>`).
- Gemeinsamer Baustein `titleWithInfo` in `js/lib/ui.js`, Texte unter `help` in `i18n/de.json` (Punkte mit „|“ getrennt). Der Kamera-Reiter nutzt ihn jetzt auch (vorher eigener Fließtext).

## 1.38.0 – Belichtungsrechner: Modus und Kamera direkt wählen (2026-10-16)
- Rechner → Belichtung: Umschalter „Modus“ beim Ziel mit den Kürzeln der Marke („Av · Blendenvorwahl“, „Tv · Zeitvorwahl“, „M · Manuell + Auto-ISO“; ohne Marke A · S · M). Der Modus legt fest, welcher Wert nachgibt; Schloss und Modus bleiben gekoppelt. Antippen eines Kürzels am Modusrad der Kamera-Grafik wechselt ebenfalls.
- Marke und Modell direkt über der Kamera-Grafik wählbar (gilt für die ganze App); der Umweg über die Einstellungen entfällt.
- „i“-Text des Rechners ergänzt.

## 1.38.1 – Hinweis zu den Reglern kürzer und an der richtigen Stelle (2026-10-16)
- Kamera → Kameraeinstellungen: Der Hinweis steht jetzt direkt unter den Reglern Blende, Zeit, ISO (vor dem ND-Filter) und ist kürzer: „Ausgegraute Regler stellt die Kamera selbst.“

## 1.38.2 – Belichtungsrechner ohne Marke und Modell (2026-10-16)
- Auf Wunsch zurückgenommen: Marke/Modell-Auswahl im Belichtungsrechner entfernt. Der Rechner hängt nicht mehr an Marke und Modell aus den Einstellungen; die Kamera-Grafik zeigt eine neutrale Kamera (P · A · S · M · B).
- Gefragt wird nur der Modus, neutral benannt: „Blendenvorwahl (A/Av)“, „Zeitvorwahl (S/Tv)“, „Manuell (M + Auto-ISO)“. Er legt fest, welcher Wert nachgibt (gekoppelt mit dem Schloss); Antippen des Modusrads an der Grafik wechselt ebenfalls.

## 1.38.3 – Vergleichsregler verständlich (2026-10-16)
- Langzeitaufnahme, Ergebnis: Der Regler blendet jetzt über statt eine Trennlinie zu schieben. Ganz links das erste Einzelbild, ganz rechts der fertige Stapel, dazwischen weich gemischt; Start rechts (Ergebnis). Beschriftung an den Enden unter dem Regler, im Bild oben links der aktuelle Stand („Stapel“, „erstes Einzelbild“ oder z. B. „erstes Einzelbild 60 % · Stapel 40 %“). Wischen über das Bild stellt den Regler weiterhin.

## 1.39.0 – QR-Code mit Direktzugang (2026-10-16)
- Neuer QR-Code `print/qr-app-direkt.png` (1200 px), `-klein.png` (300 px) und `.svg` im gewohnten Stil (Schriftzug „focus“ mittig). Er öffnet die App mit einem eigenen Schlüssel hinter `#k=` und schaltet ohne Eintippen frei. Per Decoder bei 1200, 600 und 300 px geprüft.
- Der Schlüssel ist ein eigener Kurs-Code „QR-Code“ (in `data/access.json` nur als Hash), getrennt vom Kurs-Code und einzeln sperrbar (`node tools/access-code.mjs off QR-Code`). Er steht hinter dem „#“, geht also nicht an den Server, und die App entfernt ihn sofort aus der Adresse.
- `js/app.js`: liest `#k=…` vor der Zugangsprüfung. Geprüft: richtiger Schlüssel öffnet ohne Sperrbildschirm, falscher führt zum Sperrbildschirm.
- Grenze: Auf dem iPhone hat eine zum Home-Bildschirm hinzugefügte App einen eigenen Speicher; dort einmal den Kurs-Code eingeben.

## 1.39.1 – ND-Filter als eigene Überschrift (2026-10-16)
- Kamera-Reiter: „ND-Filter“ steht jetzt als Überschrift wie „Wo finde ich was?“ und „Kameraeinstellungen“, die Auswahl (kein Filter, ND 3, ND 6, ND 10) in einer eigenen Karte darunter.

## 1.40.0 – Sensorformat als Grafik (2026-10-16)
- Kamera-Reiter: Das Sensorformat steht jetzt als Zeile wie die Modusrad-Zeile. Links eine kleine Grafik: gestrichelter Umriss = Vollformat 36 × 24 mm, grün und mittig darin der Sensor der gewählten Kamera im echten Größenverhältnis (Kantenlänge / Formatfaktor). Rechts „Sensor“, Format und Maß mit Formatfaktor.

## 1.40.1 – Cropfaktor, Beschriftung Vollformat (2026-10-16)
- Sensorzeile: „Cropfaktor“ statt „Formatfaktor“ (international „crop factor“), Text kürzer („ca. 22,3 × 14,9 mm, Cropfaktor 1,6“). In der Grafik führt ein Strich von der gestrichelten Linie zur Beschriftung „Vollformat 36 × 24 mm“.

## 1.40.2 – „35 mm“ statt „Vollformat“ in der Sensorgrafik (2026-10-16)
- Beschriftung am gestrichelten Umriss: „35 mm · 36 × 24 mm“ (Bezug zum 35-mm-Kleinbildfilm). Bei Vollformat-Kameras: „36 × 24 mm, so groß wie 35-mm-Film“.

## 1.40.3 – Beschriftung 35-mm-Film zweizeilig (2026-10-16)
- Sensorgrafik: „35-mm-Film“ und darunter „Bild 36 × 24 mm“, damit Filmbreite (35 mm) und Bildmaß auf dem Film (36 × 24 mm) nicht als ein Maß gelesen werden.

## 1.40.4 – Beschriftung „Vollformat 36 × 24 mm“ (2026-10-16)
- Sensorgrafik: Am gestrichelten Umriss steht wieder nur eine Zeile, „Vollformat 36 × 24 mm“.

## 1.41.0 – Symbole in „Wo finde ich was?“ (2026-10-16)
- Hinter den Schlagworten stehen kleine Symbole wie auf Kameradisplays: AF-Modus (Fokusrahmen), Selbstauslöser (Uhr), Spiegelvorauslösung (Spiegel mit Pfeil nach oben), Erschütterungsfrei auslösen (Vorhang mit „e“). `FN_ICONS` in `js/modules/camera-finder.js`.

## 1.42.0 – „Wo finde ich was?“ nach der Liste des Kursleiters (2026-10-16)
- Schlagworte (für alle Modelle gleich, jedes mit Symbol): AF / MF · AF-Modi · Fokusfeld verschieben · Messmethode · Einzelbild / Serie · Selbstauslöser · Speicherformat · ISO · Stabilisator · Spiegelvorauslösung bzw. Erschütterungsfrei auslösen.
- Je Schlagwort ein kurzer „Wofür“-Text (z. B. Stabilisator: ohne Stativ ein, auf dem Stativ aus; RAW lohnt sich bei Nacht und Langzeit).
- Wo am Modell: aus der Herstelleranleitung, wenn erfasst (mit Seite). Sonst ein allgemeiner Hinweis („bitte am Gerät prüfen“) und, falls das Modell eine passende Taste hat (ISO, DRIVE, Q, i, Joystick, Steuerkreuz …), wird sie grün markiert. Mit Anleitungs-Angabe wird nur das dort genannte Teil markiert.
- Canon EOS 5D Mark IV vollständig aus der Anleitung: AF/MF (S. 100), Fokusfeld (S. 61, 106), Messmethode (S. 253), Einzelbild/Serie (S. 160), Bildqualität (S. 169), ISO (S. 177).
- Das angedeutete Objektiv ist jetzt ein antippbares Teil „Objektiv“ (für AF/MF und Stabilisator).
- Offen: die übrigen 31 Modelle mit Anleitungs-Angaben für die neuen Schlagworte ergänzen.

## 1.42.1 – Sony: „Wo finde ich was?“ vollständig (2026-10-16)
- A6400, A6700, A7C, A7 III, A7 IV: AF/MF, Fokusfeld, Messmodus, Einzelbild/Serie, Dateiformat, ISO und SteadyShot aus der offiziellen Sony-Hilfe (Druckfassung, Seitenangaben). Teile: Einstellrad (Bildfolgemodus links, ISO rechts), Taste C2 (Fokusfeld, A7 III/A7 IV), Objektiv (AF/MF, SteadyShot).
- Hinweise aus der Hilfe übernommen: A6400 stabilisiert nur mit OSS-Objektiven; auf dem Stativ SteadyShot aus; hat das Objektiv einen SteadyShot-Schalter, gilt dieser.

## 1.43.0 – Canon: „Wo finde ich was?“ vollständig (2026-10-16)
- Alle 13 Canon-Modelle aus den deutschen Canon-Anleitungen (Seitenangaben): R100, R50, R10, R8, R7, R6 Mark II, R5 Mark II, 850D (Online-Handbuch als PDF), 2000D, 250D (nach 200D-Anleitung), 90D, 6D Mark II (gedruckte Anleitung), 5D Mark IV (Stabilisator ergänzt).
- Markierte Teile: Taste M-Fn (Betriebsart/Selbstauslöser, R10–R5 II), Steuerkreuz (R100, R50, R8, 2000D, 250D), ISO-Taste, DRIVE/AF-Taste (90D, 6D II), Q-Taste (250D), Objektiv (AF/MF, Stabilisator) und neu das hintere Rad (ISO an R8, R6 II, R5 II).
- Korrekturen gegenüber vorher: R100 hat keinen Menüpunkt Verschlussmodus (löst immer mit elektronischem 1. Vorhang aus), Betriebsart/Selbstauslöser der R100 im Menü, der 250D über die Q-Taste, AF-Betrieb der 250D im Menü.
- Stabilisator: R7, R6 II, R5 II stabilisieren im Gehäuse; R100, R50, R10, R8 und alle Spiegelreflex nur über das Objektiv (Spiegelreflex-Anleitungen erwähnen den Schalter nur als Hinweis, daher „mittel“).

## 1.43.1 – Kamera: Einstellungen vor „Wo finde ich was?“ (2026-10-16)
- Reihenfolge im Reiter Kamera: Kamera, Kameraeinstellungen (Regler), „Wo finde ich was?“, ND-Filter. Außerdem Ordner `handbuecher/` mit den Herstelleranleitungen angelegt (nur lokal, Liste in `handbuecher/LIESMICH.md`).

## 1.43.2 – „Wo finde ich was?“: Erklärung unter der Schaltfläche (2026-10-16)
- Der Erklärtext klappt direkt unter dem angetippten Schlagwort auf (eigene Zeile, grüne Linie links), nicht mehr unter der ganzen Liste. Erneutes Antippen schließt ihn.

## 1.43.3 – Kamera: kein Moduswahlrad beim Handy (2026-10-16)
- Bei iPhone und Android wird das kleine Moduswahlrad über der Kamera ausgeblendet (Handys haben keins). Kameramarken unverändert.

## 1.43.4 – Handy im Querformat (2026-10-16)
- Kamera-Grafik für iPhone/Android quer gehalten wie beim Fotografieren: Kamerainsel links, Auslöser rechts, Livebild dazwischen (Szene im vollen Querformat). Blende und Automatik-Werte stehen jetzt unter dem Handy.
- Kamera-Skizzenblock mit neuer Grafik und den Canon-Daten neu veröffentlicht (Version 13).

## 1.44.0 – Kamera: „Im Bild: …“ unter der Grafik (2026-10-16)
- Unter dem Kamerabild steht kurz, was im Monitor zu sehen ist, passend zu Blende, Zeit und ISO: zu hell/zu dunkel (nur wenn daneben), Auto eingefroren / verwischt / Leuchtspur / fast verschwunden, Wasser mit Wellen / glatter / spiegelglatt, Hintergrund unscharf bzw. von vorn bis hinten scharf, Laterne mit Blendenstern, Rauschen sichtbar.
- Die Angaben kommen aus derselben Berechnung wie die Zeichnung (`scene.render` liefert `seen`). „i“-Text des Reiters ergänzt.

## 1.45.0 – Sony Alpha 7R V (2026-10-17)
- Neues Modell aus der Sony-Hilfe ILCE-7RM5 (Druckfassung, in `handbuecher/sony/`): Gehäuse (Moduswahlknopf rechts, hintere Drehräder L und R, Einstellrad, C1/C2 oben, AF-ON/AEL/Fn/▶ hinten), Radbelegung (M: vorderes Drehrad Blende, hinteres Drehrad L Zeit; BULB über das Drehrad L), Grenzen (30 s, BULB, ISO 100–32000), Sensor 35,7 × 23,8 mm.
- „Wo finde ich was?“ vollständig mit Seitenzahlen (Fokusmodus, Fokusfeld, Messmodus, Bildfolgemodus, Selbstauslöser, Dateiformat, ISO, SteadyShot im Gehäuse, Elekt. 1. Verschlussvorhang).

## 1.46.0 – Rechner: Licht schätzen statt messen (2026-10-17)
- In der Ausgangsmessung des Belichtungsrechners neue Auswahl „Licht schätzen statt messen“: Tag (Schnee in praller Sonne bis Schatten), Abend (vor, bei, nach Sonnenuntergang), Nacht und Kunstlicht (Leuchtreklame, Einkaufsstraße, Straße bei Nacht, Autoverkehr, angestrahlte Gebäude, Stadt aus der Ferne, Vollmondlicht), Innen (Büro, Wohnung).
- Die Situation setzt die Zeit passend zu Blende und ISO der Ausgangsmessung (pralle Sonne, f/8, ISO 100 → 1/500). Lichtwerte nach ANSI PH2.7 (gerundete Tabelle „Exposure value“, englische Wikipedia); Spannen werden genannt. Über 30 s ein Beispiel mit f/2,8 und ISO 1600. Hinweis Seiten-/Gegenlicht. Milchstraße bewusst weggelassen (Tabellenwert passt nicht zur Praxis).
- Eigene Änderung an Blende, Zeit oder ISO setzt die Auswahl zurück. „i“-Text des Rechners ergänzt.

## 1.47.0 – Kamera: Bereiche unter der Grafik aufklappbar (2026-10-19)
- Kameraeinstellungen, „Wo finde ich was?“, ND-Filter und „Mehr zu …“ sind aufklappbare Bereiche (`details.cam-acc`). Immer nur einer ist offen; der geöffnete steht damit direkt unter dem Kamerabild (nur zugeklappte Kopfzeilen darüber). Der zuletzt offene wird gemerkt (Einstellung `cameraSection`, anfangs Kameraeinstellungen).
- „i“-Text des Reiters ergänzt.

## 1.48.0 – Neue Akzentfarbe (2026-10-19)
- Akzent `#2E9E3F` (RGB 46/158/63, nah an Pantone 355 C) statt `#2bb24c`, in App (`css/dark.css`) und Website (`site/site.css`). Neue Tokens `--accent-dark` `#1F7A2E` (Linien/Text auf Hell) und `--accent-light` `#D6EFD9` (Flächen hinter dunklem Text), vorerst ohne Verwendung im dunklen Design.
- Kontrast: Grün auf Seitengrund 5,6:1, auf Karten 5,1:1, dunkler Text auf grünen Knöpfen 5,5:1, Weiß auf Dunkelgrün 5,4:1, Dunkelgrün auf Hellgrün 4,4:1 (nur für größere Schrift). Rotlicht unverändert. Direktzugangs-PDF auf dem Schreibtisch mit neuem Grün neu erzeugt.

## 1.49.0 – „Wo finde ich was?“: Kamera bleibt sichtbar (2026-10-19)
- Solange „Wo finde ich was?“ offen ist, bleibt die Kamera-Karte oben stehen (sticky unter der Kopfzeile, Grafik auf höchstens 30 % der Bildschirmhöhe, „Im Bild“-Zeile ausgeblendet). Schlagworte und Erklärungen laufen darunter durch.
- Tippt man ein Schlagwort an, rückt es direkt unter die stehende Kamera; markiertes Teil und Erklärtext sind zugleich zu sehen. Unten etwas Luft (50 % Bildschirmhöhe), damit auch die letzten Schlagworte hochrollen können.
