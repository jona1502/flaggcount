# Audience Live – Umbenennungs-, Icon- und Release-Plan

## Zielbild

FlagCount wird als Produkt in **Audience Live** umbenannt. Der neue Name soll die
Live-Zuschauerinteraktion in den Mittelpunkt stellen und nicht dauerhaft auf rote
Flaggen als einzige Funktion festlegen.

**Festgelegte Produktbezeichnung**

- Produktname: `Audience Live`
- Kurzform in der UI: `Audience`
- Claim: `Live audience interaction for streams`
- Deutsche Erklärung: `Live-Interaktion für Streams`
- Interne Modulnamen wie `flagcountApi` dürfen zunächst bestehen bleiben, wenn
  eine Umbenennung keinen Nutzerwert hat und unnötiges Risiko erzeugt.

## Leitplanken

- Bestehende Einstellungen, Lizenzen, Profile und Update-Installationen bleiben
  kompatibel.
- Das alte Branding wird in sichtbaren Nutzerflächen vollständig entfernt.
- Die App erhält ein eigenes Audience-Live-Icon statt einer bloßen Umfärbung des
  bisherigen FlagCount-Icons.
- Der erste öffentliche Rename-Release ist eine normale stabile Version; kein
  erzwungener Daten- oder Lizenzumzug.
- Domain-, Marken-, App-Store- und Social-Handle-Prüfung wird vor der
  Veröffentlichung dokumentiert. Eine Namensverfügbarkeit im Web allein ist
  keine Markenfreigabe.

## Bestandsaufnahme

### Sichtbare und release-relevante Stellen

- React-Titel, Navigation, Seitenüberschriften, Dialoge, Toasts und Fehlermeldungen
- `README.md`, Changelog und Dokumentation
- Website, Login-, Download-, Pro- und Checkout-Texte unter `apps/web`
- `package.json`-Beschreibung und sichtbare Metadaten
- `src-tauri/tauri.conf.json`:
  - `productName`
  - Fenster-Titel
  - Bundle-Beschreibungen
  - Publisher-/Release-Texte
  - Icon-Dateien
- `src-tauri/Cargo.toml` und Rust-Metadaten, soweit dort der Produktname
  sichtbar ist
- GitHub Actions `.github/workflows/release.yml`:
  - Workflowname
  - Release-Titel und Release-Body
  - Updater-Endpunkt
- GitHub-Repository-/GHCR-Namen nur nach separater Entscheidung umbenennen;
  GitHub-Redirects nicht als alleinige Kompatibilitätsstrategie voraussetzen.

### Absichtlich stabil halten

- `com.jona1502.flagcount` als Tauri-Identifier, damit bestehende Installationen
  und Windows-App-Daten nicht automatisch in einen neuen Datenbereich wechseln
- bestehende `%APPDATA%`-/`%LOCALAPPDATA%`-Pfade und Lizenzspeicher
- interne API-/Dateinamen, soweit sie nicht sichtbar sind
- Updater-Signaturschlüssel
- Datenformat und gespeicherte Profil-/Counter-Strukturen

Falls später auch der technische Identifier geändert werden soll, braucht das
einen eigenen Migrationsrelease mit expliziter Übernahme alter Speicherpfade.

## Umsetzung in Phasen

### Phase 0 – Namens- und Releasefreigabe

- Schreibweise verbindlich festlegen: `Audience Live`, nicht wechselnd
  `AudienceLive` oder `Audience.live`.
- Domain und gewünschte TLD prüfen.
- Deutsche und internationale Markenregister sowie App-Store-Suche prüfen.
- GitHub-Repository-Strategie entscheiden:
  - bevorzugt bestehendes Repository behalten und nur Produktbranding ändern;
  - Repository nur umbenennen, wenn Redirects, Actions, Secrets, Webhooks und
    Updater-Endpunkt anschließend geprüft werden können.
- Releaseversion festlegen, z. B. `0.6.0` als erster Audience-Live-Release.

**Ergebnis:** dokumentierte Freigabe für Name, Repository und Version.

### Phase 1 – Produkt- und UI-Rename

- Alle sichtbaren `FlagCount`-Vorkommen mit `rg` erfassen und klassifizieren:
  Produktname, Funktionsname, interne Bezeichnung.
- Sichtbare Produkttexte auf `Audience Live` bzw. `Audience` umstellen.
- Funktionsbegriffe wie „FlagCount Pro“ auf „Audience Live Pro“ umstellen.
- Seitentitel, Browser-/Tauri-Titel, Login, Lizenz, Update-Hinweise und
  Overlay-Hilfe aktualisieren.
- Bestehende Fachbegriffe wie rote Flagge/Counter nur dort behalten, wo sie die
  konkrete Funktion beschreiben.
- Tests und Accessibility-Namen auf das neue Branding aktualisieren.
- `package.json`, Website-Metadaten und README anpassen.
- Keine blind ausgeführten globalen Ersetzungen in IDs, Storage-Keys oder
  Protokollformaten.

**Ergebnis:** sichtbare Oberfläche ist konsistent auf Audience Live umgestellt.

### Phase 2 – Technische Kompatibilität und Migration

- Prüfen, dass die bestehende Tauri-Identifier-/Storage-Strategie alte Daten
  weiterhin liest und schreibt.
- Bestehende Lizenzaktivierungen und Offline-Lizenzstatus mit der neuen Anzeige
  testen.
- Update von einer installierten FlagCount-Version auf Audience Live testen.
- Bei Bedarf einen kleinen Alias-/Kompatibilitätstest für alte Konfigurations-
  oder Lizenzdateien ergänzen.
- Log-, Export- und Overlay-Daten auf unbeabsichtigte sichtbare Altbezeichnungen
  prüfen.

**Ergebnis:** Update verliert keine Einstellungen, Profile, Lizenzen oder lokalen
Zugänge.

### Phase 3 – Neues App-Icon

- Icon-Konzept festlegen: stilisiertes Publikum/Signal/Wellenform, klar in 16–32
  px, ohne kleine Textbestandteile und ohne rote-Flaggen-Abhängigkeit.
- Eine Masterdatei in einem verlustfreien Format anlegen, bevorzugt SVG oder
  hochauflösendes PNG mit transparentem Hintergrund.
- Daraus die von Tauri benötigten PNG-, ICO- und ICNS-Größen erzeugen:
  `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.icns`.
- Web-/Favicon-Icon unter `apps/web/app/icon.png` angleichen.
- `src-tauri/tauri.conf.json` auf die finalen Icon-Dateien prüfen.
- Icon in Windows-Taskleiste, Startmenü, Installer, Desktop-Verknüpfung und
  Update-Installation visuell prüfen.
- Alte Icon-Dateien erst entfernen, wenn der Bundle-Build erfolgreich mit den
  neuen Dateien läuft.

**Ergebnis:** alle ausgelieferten Oberflächen zeigen dasselbe Audience-Live-Icon.

### Phase 4 – Release- und Updater-Vorbereitung

- `.github/workflows/release.yml` umbenennen und Texte aktualisieren:
  Workflowname, Release-Name und Release-Body.
- `tauri.conf.json`-Updater-Endpunkt prüfen; bei Repository-Umbenennung auf die
  neue kanonische URL umstellen.
- Release-Body mit Migrationshinweis versehen:
  „FlagCount heißt jetzt Audience Live. Einstellungen und Lizenz bleiben
  erhalten.“
- Bestehende `latest.json`-/Signatur-Erzeugung beibehalten.
- Versionsquellen mit `npm run version:check` synchron halten.
- Prüfen, dass die Sidecar-Datei trotz Produkt-Rename korrekt gebündelt wird.
- Optional zusätzlich eine kurze `RELEASE_NOTES_AUDIENCE_LIVE.md` für den
  manuellen GitHub-Release anlegen.

### Phase 5 – Qualitätssicherung

- Vor dem Commit ausführen:

  ```bash
  npm run typecheck
  npm test
  npm run check:rust
  npm run test:rust
  npm run version:check
  ```

- Produktions-/Installerprüfung ausführen:

  ```bash
  npm run build:sidecar
  npm run package:windows
  ```

- Manuell prüfen:
  - Upgrade von FlagCount auf Audience Live
  - neue Installation ohne vorhandene Daten
  - bestehende Lizenz und Profile
  - App-Icon in Installer und installierter App
  - Overlay und Web-Login
  - Update-Hinweis und Neustart nach Update
  - Rollback auf die vorherige Version bleibt möglich

## GitHub-Release-Ablauf

1. Rename- und Icon-Änderungen in kleinen, nachvollziehbaren Commits fertigstellen.
2. CI auf einem Pull Request vollständig grün laufen lassen.
3. Version auf `0.6.0` setzen und `npm run version:check` ausführen.
4. Changelog und Release Notes mit Rename-, Kompatibilitäts- und Icon-Hinweis
   aktualisieren.
5. Commit und Tag erstellen:

   ```bash
   git tag app-v0.6.0
   git push origin main --follow-tags
   ```

6. Die GitHub-Release-Action baut den signierten Windows-NSIS-Installer und
   `latest.json`.
7. Release-Assets kontrollieren: Installer, Signaturdatei und `latest.json`.
8. Installation auf einem Testrechner mit FlagCount `0.5.0` starten und das
   In-App-Update auf `0.6.0` auslösen.
9. Nach Update Daten, Lizenz, Icon, Produktname und Versionsanzeige prüfen.
10. Erst danach Release als öffentlich und stabil kommunizieren.

## Commit-Reihenfolge

Jeder Punkt bleibt ein eigener Commit:

1. `chore: define Audience Live product naming`
2. `refactor: rename visible product branding to Audience Live`
3. `test: update branding and migration coverage`
4. `feat: add Audience Live app icon`
5. `build: update Audience Live bundle metadata`
6. `ci: rename Audience Live release workflow`
7. `docs: add Audience Live release notes`
8. `chore: bump version to 0.6.0`

Nur zugehörige Dateien pro Commit stagen. Vor jedem Commit Typecheck, Tests und
gegebenenfalls den relevanten Build ausführen.

## Akzeptanzkriterien

- Keine sichtbare Produktstelle nennt nach dem Release noch `FlagCount`.
- Interne Kompatibilitätswerte bleiben unverändert oder werden migriert.
- Upgrade von `0.5.0` erhält Einstellungen, Profile, Lizenz und lokale Daten.
- Neue Installer und die laufende App zeigen Name und Icon `Audience Live`.
- GitHub-Release enthält signierte NSIS-Datei und funktionierende `latest.json`.
- In-App-Updater findet `0.6.0`, installiert sie und startet die App korrekt neu.
- CI, TypeScript-, Rust-, Integrations- und Produktions-Builds sind grün.
- Release Notes erklären den Rename verständlich und nennen die
  Rückwärtskompatibilität.

## Nicht Bestandteil dieses Releases

- Änderung des Tauri-Identifier (`com.jona1502.flagcount`)
- Änderung des lokalen Datenformats
- Umstellung des Sidecar-Protokolls
- Neue Audience-Live-Funktionen unabhängig vom Rebranding
- Erzwungene Domain- oder GitHub-Repository-Umbenennung ohne vorherige
  Kompatibilitätsprüfung
