# FlagCount

FlagCount ist eine lokale Windows-App, die rote Flaggen (`🚩`) im Chat eines TikTok-Livestreams zählt. Jeder Zuschauer hat pro Runde genau eine Stimme und kann sie mit einer weißen Flagge (`🏳️`) wieder zurücknehmen; ein Reset startet eine neue Runde. Der Zählerstand erscheint im Dashboard und als transparentes Streaming-Overlay.

## Bedienung

1. FlagCount starten.
2. Im Feld **TikTok-Benutzername** den Namen des Streamers eingeben – `name`, `@name` oder die Profil-/Live-URL – und **Verbinden** klicken. Der Stream muss gerade live sein.
3. Zuschauer stimmen ab, indem sie eine Chatnachricht mit `🚩` schreiben. `🚩`, `🚩🚩` und `Bitte 🚩` zählen jeweils genau eine Stimme; jede Person zählt pro Runde nur einmal, egal wie viele Nachrichten sie schreibt. Mit `🏳️` nimmt sie ihre Stimme zurück und kann danach wieder neu abstimmen.
4. Falls eine Chat-Stimme nicht erkannt wurde, fügt **Flagge hinzufügen** genau eine Stimme hinzu. Mit **Flagge abziehen** korrigiert der Bediener den Zähler um eine Stimme nach unten. Beides funktioniert auch ohne aktive TikTok-Verbindung und aktualisiert Dashboard sowie Overlay sofort.
5. Unter **Stimmenziel** das Ziel eintragen und mit **Übernehmen** speichern. Ist das Ziel erreicht, wird der Fortschrittsbalken grün.
6. **Runde zurücksetzen** und anschließend **Ja, zurücksetzen** löscht alle automatischen und manuellen Stimmen der Runde; danach dürfen alle erneut abstimmen. Ohne Bestätigung bricht der Reset nach fünf Sekunden ab.
7. Reißt die Verbindung ab, verbindet FlagCount automatisch neu (bis zu acht Versuche mit wachsender Wartezeit). Die Stimmen der Runde bleiben dabei erhalten. **Trennen** beendet die Verbindung und alle weiteren Versuche.

Benutzername, Stimmenziel und die Darstellung des Overlays bleiben nach einem Neustart erhalten. Stimmen werden nie gespeichert – nach einem Neustart beginnt eine neue Runde.

## Datenschutzfreundliche Nutzungsdaten

Die Übertragung anonymer Nutzungsdaten ist standardmäßig ausgeschaltet und kann im Dashboard unter **Datenschutz** freiwillig aktiviert oder jederzeit wieder deaktiviert werden. Übertragen werden ausschließlich App-Version, Betriebssystem-Hauptversion und fest definierte Ereignisse wie App-Start, erfolgreiche Verbindung oder eine grobe Größenklasse abgeschlossener Runden. TikTok-Benutzernamen, Zuschaueridentitäten, Chattexte, eigene Bezeichnungen, URLs, Lizenzdaten und lokale Dateipfade werden weder erfasst noch übertragen.

## Streaming-Overlay einrichten

1. In FlagCount im Bereich **Streaming-Overlay** auf **URL kopieren** klicken. Standardmäßig lautet die Adresse `http://127.0.0.1:3847/overlay`.
2. In OBS unter **Quellen** auf **+** klicken, **Browser** wählen und einen Namen vergeben, z. B. „FlagCount“.
3. Die URL einfügen und die Größe festlegen, z. B. **Breite** `520` und **Höhe** `200`. Das benutzerdefinierte CSS von OBS kann unverändert bleiben – der Hintergrund des Overlays ist transparent.
4. **Quelle herunterfahren, wenn nicht sichtbar** deaktiviert lassen, damit das Overlay jederzeit aktuell ist.
5. Unter **Darstellung** in FlagCount lassen sich **Hintergrund anzeigen** und **Fortschrittsbalken anzeigen** umschalten; OBS übernimmt die Änderung sofort.

Hinweise:

- FlagCount muss laufen, damit das Overlay Daten erhält. Wird die App neu gestartet, verbindet sich das Overlay von selbst wieder; solange keine Verbindung besteht, erscheint es abgeblendet.
- Ist Port `3847` bereits belegt, weicht FlagCount auf einen freien Port aus. In diesem Fall die URL erneut kopieren und in OBS eintragen.
- Das Overlay ist nur auf diesem Computer erreichbar und zeigt ausschließlich Zählerstand und Ziel – keine Chatnachrichten oder Zuschauernamen.

## Aufbau

| Teil | Technik | Aufgabe |
| --- | --- | --- |
| `src/` | React, TypeScript, Vite | Dashboard |
| `src-tauri/` | Tauri 2, Rust | Fenster, sichere Commands, Einstellungen, Start und Neustart des Sidecars |
| `sidecar/` | Node.js, `tiktok-live-connector` | TikTok-Verbindung, Voting, lokaler Overlay-Server |
| `shared/` | TypeScript | Plattformunabhängige Voting-Logik und gemeinsame Typen |

Der Sidecar wird beim Build mit esbuild gebündelt und mit `@yao-pkg/pkg` in eine eigenständige `.exe` übersetzt, die Tauri mit ausliefert.

## Voraussetzungen

- Windows 10 oder 11 (x64)
- [Node.js](https://nodejs.org/) 22 oder neuer
- [Rust](https://rustup.rs/) (stable, Toolchain `x86_64-pc-windows-msvc`)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) mit der Workload „Desktopentwicklung mit C++“
- Microsoft Edge WebView2 (unter Windows 11 vorinstalliert)

## Entwicklung

```bash
npm install
npm run tauri dev
```

`tauri dev` baut zuerst den Sidecar und startet dann Vite mit Hot Reload.

## Prüfen

```bash
npm run typecheck   # TypeScript für Dashboard, Sidecar und gemeinsame Module
npm test            # Unit-, Komponenten- und Integrationstests (Vitest)
npm run test:rust   # Rust-Tests, inklusive Tauri-Commands über die IPC-Schicht
npm run build       # Produktions-Build des Dashboards
```

Die Integrationstests decken den kompletten Datenfluss ab: Chat → Voting → Tauri-Protokoll und Overlay-Stream, Reset, automatischen Reconnect, den echten Sidecar-Prozess sowie das Dashboard gegen gemockte Tauri-Commands und -Events.

## Windows-Installer bauen

```bash
npm install
npm run package:windows
```

Der Befehl

1. bündelt den Sidecar und erzeugt `src-tauri/binaries/flagcount-sidecar-x86_64-pc-windows-msvc.exe`,
2. baut das Dashboard,
3. kompiliert die App im Release-Modus und
4. erstellt den NSIS-Installer.

Ergebnis: `src-tauri/target/release/bundle/nsis/FlagCount_<Version>_x64-setup.exe`

Beim ersten Build lädt `pkg` eine Node.js-Basisdatei und Tauri die NSIS-Werkzeuge herunter; dafür ist eine Internetverbindung nötig. Spätere Builds nutzen den Cache.

Der Installer installiert FlagCount für den aktuellen Benutzer, ohne Administratorrechte. Fehlt WebView2, lädt er es automatisch nach.

## Daten und Logs

| Was | Ort |
| --- | --- |
| Einstellungen (Benutzername, Stimmenziel, Overlay, Telemetrie-Einwilligung) | `%APPDATA%\com.jona1502.flagcount\settings.json` |
| Logdatei | `%LOCALAPPDATA%\com.jona1502.flagcount\logs\FlagCount.log` |

Die Logdatei enthält keine Benutzernamen, Chatinhalte oder Zugangsdaten. FlagCount benötigt keine TikTok-Anmeldung.
