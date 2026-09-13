# FlagCount

FlagCount ist eine lokale Windows-App, die rote Flaggen (`🚩`) im Chat eines TikTok-Livestreams zählt. Jeder Zuschauer hat pro Runde genau eine Stimme; ein Reset startet eine neue Runde. Der Zählerstand erscheint im Dashboard und als transparentes Overlay für OBS.

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
npm test            # Unit- und Komponententests (Vitest)
npm run test:rust   # Rust-Tests
npm run build       # Produktions-Build des Dashboards
```

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

Ergebnis: `src-tauri/target/release/bundle/nsis/FlagCount_0.1.0_x64-setup.exe`

Beim ersten Build lädt `pkg` eine Node.js-Basisdatei und Tauri die NSIS-Werkzeuge herunter; dafür ist eine Internetverbindung nötig. Spätere Builds nutzen den Cache.

Der Installer installiert FlagCount für den aktuellen Benutzer, ohne Administratorrechte. Fehlt WebView2, lädt er es automatisch nach.

## Daten und Logs

| Was | Ort |
| --- | --- |
| Einstellungen (Benutzername, Stimmenziel, Overlay) | `%APPDATA%\com.jona1502.flagcount\settings.json` |
| Logdatei | `%LOCALAPPDATA%\com.jona1502.flagcount\logs\FlagCount.log` |

Stimmen werden nie gespeichert – nach einem Neustart beginnt eine neue Runde. Die Logdatei enthält keine Benutzernamen, Chatinhalte oder Zugangsdaten. FlagCount benötigt keine TikTok-Anmeldung.
