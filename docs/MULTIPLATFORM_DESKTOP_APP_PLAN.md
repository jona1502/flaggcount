# Audience Live – Plan für eine echte Windows-, macOS- und Linux-App

## Ziel und Ergebnis

Audience Live (Repository-/Bundle-Identifier aktuell `flagcount`) soll als vollwertige Desktop-App für Windows, macOS und Linux ausgeliefert werden. Alle drei Plattformen sollen dieselben Kernfunktionen anbieten:

- TikTok- und Twitch-Live-Verbindung über den lokalen Sidecar
- Live-Zähler, Abstimmungen, Profile, Historie und Einstellungen
- lokale und öffentliche Streaming-Overlays
- Lizenz, Updates, sichere lokale Speicherung und Support

Das Ergebnis ist **eine gemeinsame React-/TypeScript-Oberfläche und eine gemeinsame Rust-/Tauri-Schicht**, ergänzt um einen je Plattform gebauten Sidecar und native Installer. Es gibt keine separate, funktional abweichende macOS- oder Linux-Web-App.

## Ausgangslage aus der Codeanalyse

Bereits vorhanden:

- React, TypeScript, Vite und gemeinsame Voting-/Profiltypen unter `shared/`
- Tauri 2 in `src-tauri/`
- Node.js-Sidecar mit `tiktok-live-connector`, Twitch-Adapter und Overlay-Server
- typisiertes Zeilenprotokoll zwischen Tauri und Sidecar
- Tauri-Store, Lizenzmodell, Updater und umfangreiche Unit-/Integrations-Tests
- `scripts/build-sidecar.mjs` kennt bereits `win32`, `darwin` und `linux` als pkg-Plattformen
- Tauri-Icon-Assets enthalten bereits `.ico`, `.icns` und PNG-Varianten

Windows-zentrierte oder plattformkritische Stellen:

- `src-tauri/tauri.conf.json` bündelt ausschließlich `nsis`; `package.json` bietet nur `package:windows`.
- README und Voraussetzungen beschreiben ausschließlich Windows und `.exe`/NSIS.
- `scripts/build-sidecar.mjs` baut standardmäßig für den Host und verwendet `rustc --print host-tuple`; Cross-Builds, Zielarchitektur und Artefaktprüfung fehlen.
- Der Sidecar-Name wird zwar mit Target-Triple erzeugt, aber die Release-Pipeline publiziert nur Windows-Artefakte.
- `SystemSecretStore` deaktiviert Pro-Lizenz-Geheimnisse auf Nicht-Windows (`#[cfg(not(windows))]`); das ist für macOS/Linux kein tragfähiges Produktverhalten.
- `TwitchVault` verwendet `keyring` ohne eigene Plattformabstraktion, während die Cargo-Abhängigkeit aktuell nur für Windows aktiviert ist. Ein Linux-/macOS-Build muss das vor dem ersten Port-Build beheben.
- Pfade werden an mehreren Stellen mit Windows-Backslashes zusammengesetzt (z. B. `FLAGCOUNT_DATA_DIR\\overlay-assets`, `round-history.json`).
- Updater-Konfiguration und Download-/Release-Logik filtern aktuell auf Windows-Installer (`*-setup.exe`).
- Tauri-Capabilities, externe URLs, Browser-Öffnung, Dateiauswahl und Tray-/Fensterverhalten wurden noch nicht auf alle drei Desktops geprüft.

## Zielplattformen und Supportversprechen

### Erste unterstützte Release-Matrix

| Plattform | Primäre Targets | Paketformat | Mindestversion (Entscheidung vor Implementierung festschreiben) |
| --- | --- | --- | --- |
| Windows | `x86_64-pc-windows-msvc`, optional `aarch64-pc-windows-msvc` | NSIS, optional MSI | Windows 10 22H2 x64 |
| macOS | `x86_64-apple-darwin`, `aarch64-apple-darwin` | signierte/notarisierte DMG + `.app` | macOS 12 Monterey |
| Linux | `x86_64-unknown-linux-gnu` zuerst, arm64 nach Messung | AppImage, `.deb`, optional `.rpm` | Ubuntu 22.04 / glibc-kompatible Distributionen |

Die erste Linux-Version wird als x64-AppImage und `.deb` priorisiert. ARM64 und RPM werden erst aktiviert, wenn Sidecar, native Abhängigkeiten und Supportaufwand auf CI reproduzierbar sind. Wayland und X11 werden beide getestet; ein funktionierender XWayland-Fallback ist akzeptabel, darf aber nicht stillschweigend vorausgesetzt werden.

## Architekturprinzipien

1. **Plattformunabhängige Domäne:** Voting, Profile, Counter, Overlay-Modelle, Protokolltypen und Validierung bleiben in TypeScript/Rust ohne OS-Branches.
2. **Kleine Plattformadapter:** Dateipfade, Secret Store, Browser-/Dateiöffnung, Autostart, Tray und Update-Installation werden hinter Rust-Interfaces gekapselt.
3. **Ein Sidecar-Vertrag:** Tauri und Sidecar verhandeln Protokollversion und Target-Triple nicht implizit. `ready.protocolVersion` bleibt die Kompatibilitätsprüfung; inkompatible Versionen liefern eine verständliche Fehlermeldung.
4. **Native Datenverzeichnisse:** App-/Log-/Cache-Pfade kommen aus Tauri bzw. der Plattform, nie aus manuell zusammengesetzten Umgebungsvariablen mit `\\` oder `/`.
5. **Reproduzierbare Builds:** Jede Release-Datei wird auf der passenden Runner-Plattform gebaut, signiert, gehasht und als getestetes Artefakt veröffentlicht.
6. **Gleiche Produktfunktion, native Distribution:** UI und Verhalten bleiben gleich; Installer, Signaturen, Sandbox-/Entitlement-Regeln und Desktop-Integration dürfen pro OS verschieden sein.

## Umsetzungsphasen

### Phase 0 – Portierungsbaseline und Entscheidungen

- `npm run typecheck`, `npm test`, `npm run test:rust` und aktuelle Windows-Builds als Baseline dokumentieren.
- Namen und Versionen vereinheitlichen: sichtbarer Produktname `Audience Live`, Repository-/Binary-Namen nur dort abweichend, wo Tauri-Target-Triple es erfordert.
- Supportmatrix (OS-Versionen, x64/arm64, Wayland/X11), Updatekanal und Signaturverantwortung verbindlich festlegen.
- Alle direkten Plattformannahmen mit `rg` inventarisieren und in eine Portierungs-Checkliste überführen.
- Pro Plattform einen manuellen Smoke-Testkatalog definieren: Erststart, Datenmigration, Secret Store, Sidecar-Start, Overlay, OAuth/Browser, Update, Deinstallation.

**Abnahme:** Baseline ist reproduzierbar, die Zielmatrix ist in README und CI-Konfiguration festgeschrieben.

### Phase 1 – Portables Plattformfundament in Rust

- `AppPaths`/`PlatformServices` einführen; `app_data_dir`, `app_log_dir`, `cache_dir` und temporäre Verzeichnisse über Tauri `path` beziehen.
- Alle manuellen Pfadverkettungen ersetzen; insbesondere Sidecar-Assetverzeichnis und History-Store mit `PathBuf::join` erzeugen.
- `SecretStore` für Lizenz und Twitch vereinheitlichen und `keyring` plattformgerecht konfigurieren:
  - Windows Credential Manager
  - macOS Keychain
  - Linux Secret Service/libsecret, mit klarer Diagnose bei fehlendem DBus/Keyring
- Niemals auf Klartext-Fallback für Tokens wechseln. Wenn kein Secret Store verfügbar ist, bleibt die Funktion deaktiviert und erklärt die Reparaturmaßnahme.
- `TwitchVault` wie den Lizenz-Vault über ein Interface injizieren; `#[cfg]` nur in den konkreten Adaptermodulen verwenden.
- Plattformunabhängige Rust-Tests für Pfade, Secret-Store-Fehler und Migrationen ergänzen; OS-spezifische Tests auf nativen Runnern ausführen.
- Browser-, Datei- und Ordneröffnung über Tauri-/Shell-API kapseln und Capability-Allowlist für macOS/Linux prüfen.

**Abnahme:** Linux und macOS kompilieren ohne Windows-Stub; keine Backslashes in erzeugten Pfaden; Secrets landen ausschließlich im nativen Store.

### Phase 2 – Portabler Sidecar und Prozesslebenszyklus

- Build-Script auf explizite Parameter umstellen, z. B. `npm run build:sidecar -- --target <rust-target>`.
- Mapping für Rust-Target, pkg-Target, Architektur und Dateiendung zentral definieren und validieren.
- Für jedes Ziel exakt ein Artefakt erzeugen: `flagcount-sidecar-<target-triple>` bzw. `.exe` unter Windows.
- Tauri-`externalBin` und Runtime-Auflösung des Sidecars auf alle Target-Triples testen; keine Annahme einer `.exe` auf macOS/Linux.
- stdout/stderr, Beenden bei stdin-Schluss, Neustart-Backoff und Exit-Codes unter allen drei OS testen.
- Sidecar-Netzwerk weiterhin ausschließlich an Loopback binden; Portbelegung und IPv4/IPv6-Verhalten dokumentiert testen.
- Node-/pkg-Version pinnen und einen reproduzierbaren Smoke-Test des gebündelten Sidecars ausführen.

**Abnahme:** Gebündelter Sidecar startet auf jedem Ziel, sendet `ready` mit Version 6, beantwortet Overlay-/State-Anfragen und beendet sich sauber.

### Phase 3 – Tauri-Konfiguration und Desktop-Integration

- `tauri.conf.json` auf gemeinsame Defaults plus plattformspezifische Bundle-Konfiguration umstellen.
- Targets aktivieren: Windows NSIS, macOS DMG, Linux AppImage und `.deb`; nur tatsächlich getestete Formate veröffentlichen.
- Fensterverhalten prüfen: Mindestgröße, native Titelbar, HiDPI/Retina, Dark Mode, Fokus, Minimieren/Schließen und Wiederherstellen.
- Icons für `.icns`, `.ico`, Linux PNG sowie DMG-/Desktop-Metadaten aus den vorhandenen Assets ableiten und bei Bedarf neu exportieren.
- MIME-/Desktop-Datei für Linux ergänzen; App-ID und URL-Schemes auf allen OS konsistent halten.
- macOS-spezifische Berechtigungen, Hardened Runtime, Entitlements und ggf. App Sandbox dokumentieren; nur benötigte Rechte anfordern.
- Linux-Desktopintegration (Desktop Entry, Kategorien, Icon-Cache, Wayland/X11) testen.
- Close-to-tray, Autostart und globale Shortcuts nur implementieren, wenn sie auf allen Zielsystemen zuverlässig oder klar plattformabhängig dargestellt werden.

**Abnahme:** Installierte Pakete starten die gleiche App, zeigen den richtigen Produktnamen/Icon und behalten Einstellungen bei Upgrade und Deinstallation gemäß Supportversprechen.

### Phase 4 – Updater, Lizenz und Releasekanäle

- Update-Metadaten von Windows-only auf eine Assetmatrix pro Version erweitern (Windows, macOS Intel/ARM, Linux je Format).
- Signatur- und Schlüsselrotation dokumentieren; private Schlüssel ausschließlich in CI-Secrets bzw. lokalem sicheren Keychain verwenden.
- macOS Developer ID signieren und notarizieren; Gatekeeper-Erststart auf einem sauberen Gerät testen.
- Windows-Code-Signing und SmartScreen-Verhalten prüfen; NSIS-Upgrade/Deinstallation testen.
- Linux-Update-Strategie festlegen: Tauri-Updater für AppImage, Paketmanager-Hinweise für `.deb`/`.rpm`, klare UI-Texte je Kanal.
- Web-Downloadseite, `latestRelease`-Logik und README so ändern, dass nicht mehr nur `*-setup.exe` angeboten wird.
- Lizenz-/Twitch-Secret-Store-Migration testen; Installation-ID muss bei Updates erhalten bleiben und bei Deinstallation nach Datenschutzentscheidung behandelt werden.

**Abnahme:** Ein Release kann pro Plattform sicher installiert, aktualisiert, verifiziert und zurückgerollt werden; inkompatible Pakete werden nicht angeboten.

### Phase 5 – CI/CD und Artefakte

- GitHub Actions (oder gleichwertig) mit nativen Runnern einrichten:
  - Windows: `windows-latest`, MSVC/Rust target
  - macOS: `macos-13` Intel und `macos-14` arm64 bzw. Universal-Strategie
  - Linux: `ubuntu-22.04`, x64; ARM64 zunächst als separater Build
- Gemeinsame Jobs: Installieren, Typecheck, Vitest, Rust-Tests, Web-Build, Sidecar-Build und Artefakt-Manifest.
- Native Jobs: Tauri-Paket bauen, Signatur anwenden, Installations-/Launch-Smoke-Test, SHA-256-Hash veröffentlichen.
- Keine Cross-Compilation als einzige Releasequelle; sie darf nur für Vorabtests oder nicht-native Artefakte dienen.
- Build-Caches für Cargo, npm und pkg sicher verwenden; Node-, Rust- und Tauri-Versionen pinnen.
- Release-Workflow erst nach erfolgreichem Matrix-Test taggen bzw. veröffentlichen; Nightly/Preview und Stable trennen.

**Abnahme:** Ein Tag erzeugt nachvollziehbar benannte Artefakte für alle freigegebenen Targets und eine maschinenlesbare Update-Metadatei.

### Phase 6 – Dokumentation und Support

- README von „lokale Windows-App“ auf die echte Plattformmatrix umstellen.
- Installations-, Update-, Datenpfad-, Log- und Deinstallationshinweise je OS dokumentieren.
- Troubleshooting für Gatekeeper/SmartScreen, fehlendes Linux-Keyring, Wayland/X11 und blockierte Overlay-Ports ergänzen.
- Datenschutztext an Secret Store, Logs, Twitch OAuth und plattformspezifische Diagnose anpassen.
- Supportformular/Fehlerberichte müssen OS, Architektur, App-Version und Sidecar-Version enthalten, aber keine Tokens, Chatinhalte oder Zuschauernamen.
- Changelog und Release Notes pro Plattform mit bekannten Einschränkungen führen.

**Abnahme:** Eine neue Person kann die passende Version installieren, ein Overlay einrichten, Updates durchführen und bei Problemen sichere Diagnoseinformationen liefern.

## Teststrategie

### Automatisierte Tests

- Bestehende TypeScript-, Sidecar-, Tauri- und Web-Tests unverändert auf allen CI-Runners ausführen.
- Plattformunabhängige Tests für Pfadbereinigung, Protokollversion, Sidecar-Exit, Overlay und Datenmigration erweitern.
- Rust-Tests mit `cfg`-Abdeckung für Windows/macOS/Linux; Secret-Store-Adapter mit Testdouble testen.
- Build-Test stellt sicher, dass jede Tauri-Bundle-Konfiguration nur vorhandene Sidecar-Dateien referenziert.
- Artefakte nach dem Build mit einem kleinen Launch-Test öffnen, `ready` abwarten, State abfragen und sauber beenden.

### Manuelle Abnahme je Plattform

1. Neuinstallation auf sauberem Benutzerkonto.
2. Erststart ohne vorhandenes Keyring/DBus (Linux) bzw. ohne Internet.
3. TikTok-Verbindung, Twitch OAuth, Reconnect und manuelle Stimmen.
4. OBS-Browserquelle mit lokalem Overlay und öffentlichem Overlay.
5. Suspend/Resume, Netzwerkwechsel, Port `3847` bereits belegt.
6. Upgrade aus der vorherigen Version inklusive Settings-, Lizenz- und History-Migration.
7. Signatur-/Gatekeeper-/SmartScreen-Prüfung und Deinstallation.

## Nicht-Ziele der ersten Multiplattform-Version

- Native Neuimplementierung der UI je Betriebssystem
- Unterstützung beliebiger Linux-Distributionen ohne definierte glibc-/Desktop-Basis
- Vollständige ARM64-Unterstützung, bevor x64 stabil veröffentlicht ist
- Klartextspeicherung von OAuth- oder Lizenz-Secrets als Fallback
- Plattformabhängige Funktionskürzungen ohne sichtbare Produktkommunikation

## Abschlusskriterien

- Windows, macOS und Linux kompilieren und paketieren aus der CI-Matrix.
- Jede freigegebene Plattform startet die gebündelte App samt passendem Sidecar.
- Kernfunktionen und Overlay verhalten sich auf allen Plattformen gleich.
- Pfade, Logs, Updates, Browseröffnung und Secret Store sind nativ korrekt.
- Installations-, Upgrade- und Deinstallations-Smoke-Tests sind grün.
- Signierte Artefakte, Checksums, Update-Metadaten und Release Notes sind veröffentlicht.
- README und Supportdokumentation nennen keine Windows-only-Annahmen mehr.

## Empfohlene Reihenfolge und Commits

Jeder nummerierte Umsetzungspunkt entspricht **genau einem Commit**. Ein Punkt darf weder auf mehrere Commits verteilt noch mit einem anderen Punkt kombiniert werden. Die Phasen dienen nur der fachlichen Orientierung; die Commit-Grenzen unten sind verbindlich. Vor jedem Commit müssen die Änderungen dieses einen Punkts vollständig umgesetzt, geprüft und reviewbar sein. Keine kosmetische Dokumentationsänderung als Ersatz für den nativen Build verwenden.

1. `docs: define desktop platform support matrix`
2. `refactor: add portable platform services and paths`
3. `fix: support native secret stores on macos and linux`
4. `build: make sidecar targets explicit and reproducible`
5. `build: add macos and linux tauri bundles`
6. `feat: complete cross-platform desktop integration`
7. `ci: build and test native desktop release matrix`
8. `release: publish signed multiplatform artifacts`
9. `docs: document windows macos and linux installation`

Für jeden Punkt gilt außerdem:

- zuerst `git status` prüfen und fremde bzw. bereits vorhandene Änderungen nicht mitnehmen;
- `npm run typecheck`, `npm test`, `npm run test:rust` und die jeweils betroffene native Build-/Smoke-Prüfung ausführen;
- ausschließlich Dateien dieses Punkts stagen;
- genau den angegebenen Commit-Titel verwenden;
- nach dem Commit prüfen, dass der Punkt abgeschlossen und der Arbeitsbaum für die bearbeiteten Dateien sauber ist.
