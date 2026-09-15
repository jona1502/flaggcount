# Audience Live

Audience Live ist eine lokale Windows-App, die rote Flaggen (`🚩`) im Chat eines TikTok-Livestreams zählt. Jeder Zuschauer hat pro Runde genau eine Stimme und kann sie mit einer weißen Flagge (`🏳️`) wieder zurücknehmen; ein Reset startet eine neue Runde. Der Zählerstand erscheint im Dashboard und als transparentes Streaming-Overlay.

## Bedienung

Alle Bereiche erreichst du über die Seitenleiste. Die Statusleiste am unteren Rand zeigt jederzeit Verbindung, laufendes Profil, Tarif und Version.

| Bereich | Wofür |
| --- | --- |
| Übersicht | Einrichtungs-Checkliste beim ersten Start, danach laufende Runden und Schnellaktionen |
| Live-Steuerung | Verbindung, aktives Profil und alle laufenden Zähler und Abstimmungen mit manuellen Korrekturen und Reset |
| Zähler & Abstimmungen | Elemente mit dem Assistenten **Neues Element** anlegen, bearbeiten, duplizieren, sortieren und löschen |
| Overlays | Ein Overlay pro Element und die Gesamtansicht: Design, lokale und Online-URL, Einrichtungsanleitung |
| Profile | Stream-Profile anlegen, wechseln, umbenennen, duplizieren und löschen |
| Historie | Abgeschlossene Runden mit Filter, Details und CSV-Export |
| Lizenz & Konto | Tarif, freigeschaltete Funktionen, Grenzen, Aktivierung und Abo |
| Einstellungen | Version, Updates und Support |

### Stream starten

1. Audience Live starten. Auf der **Übersicht** oder in der **Live-Steuerung** im Feld **TikTok-Benutzername** den Namen des Streamers eingeben – `name`, `@name` oder die Profil-/Live-URL – und **Verbinden** klicken. Der Stream muss gerade live sein.
2. Zuschauer stimmen ab, indem sie eine Chatnachricht mit `🚩` schreiben. `🚩`, `🚩🚩` und `Bitte 🚩` zählen jeweils genau eine Stimme; jede Person zählt pro Runde nur einmal, egal wie viele Nachrichten sie schreibt. Mit `🏳️` nimmt sie ihre Stimme zurück und kann danach wieder neu abstimmen.
3. Falls eine Chat-Stimme nicht erkannt wurde, fügt **Flagge hinzufügen** in der **Live-Steuerung** genau eine Stimme hinzu; **Flagge abziehen** korrigiert um eine Stimme nach unten. Laufen mehrere Elemente, heißen die Schaltflächen „Stimme für … hinzufügen“ bzw. „… abziehen“. Beides funktioniert auch ohne aktive TikTok-Verbindung und aktualisiert Dashboard sowie Overlay sofort.
4. Das **Stimmenziel** des ersten Elements trägst du direkt in der Live-Steuerung ein und speicherst es mit **Übernehmen**; die Ziele weiterer Elemente unter **Zähler & Abstimmungen**. Ist das Ziel erreicht, wird der Fortschrittsbalken grün.
5. **Runde zurücksetzen** öffnet eine Rückfrage; **Ja, zurücksetzen** löscht alle automatischen und manuellen Stimmen der Runde, danach dürfen alle erneut abstimmen. Laufen mehrere Elemente, setzt **Alle Runden zurücksetzen** alle gemeinsam zurück.
6. Reißt die Verbindung ab, verbindet Audience Live automatisch neu (bis zu acht Versuche mit wachsender Wartezeit). Die Stimmen der Runde bleiben dabei erhalten. **Trennen** beendet die Verbindung und alle weiteren Versuche. Ist der LIVE beendet, bietet die Live-Steuerung **Erneut verbinden** an.

### Zähler oder Abstimmung erstellen

1. **Zähler & Abstimmungen** öffnen und **Neues Element** wählen.
2. Den Typ wählen: **Einfacher Zähler** oder **Abstimmung**.
3. Name und optional ein Stimmenziel festlegen.
4. Bei einer Abstimmung zwei bis sechs Optionen benennen und einfärben.
5. Für jede Option Emoji- oder Text-Auslöser festlegen. Ein Auslöser darf pro Element nur einmal vorkommen, sonst wäre eine Stimme mehrdeutig.
6. Optional Auslöser zum Zurücknehmen festlegen, die Zusammenfassung prüfen und **Erstellen** klicken. Das Element ist sofort gespeichert und läuft in der Live-Steuerung.

Änderungen an bestehenden Elementen übernimmt Audience Live erst mit **Änderungen speichern**; wer die Seite vorher verlässt, wird gefragt. Abstimmungen, eigene Auslöser und mehrere gleichzeitige Elemente gehören zu Audience Live Pro. In Audience Live Free bleiben sie sichtbar und sind als „Pro erforderlich“ markiert. Meldet eine Pro-Lizenz eine erwartete Funktion nicht, erklärt Audience Live das und bietet **Lizenzstatus aktualisieren** an.

Benutzername, Profile, Zähler, Ziele und Overlay-Designs bleiben nach einem Neustart erhalten. Stimmen werden nie gespeichert – nach einem Neustart beginnt eine neue Runde.

Weitere Abläufe, Lizenzzustände und die Abnahme-Checkliste beschreibt [docs/APP_WORKFLOWS.md](docs/APP_WORKFLOWS.md).

## Streaming-Overlay einrichten

1. **Overlays** öffnen und das Element wählen. Jedes Element hat ein eigenes Overlay; mit Pro gibt es zusätzlich die **Gesamtansicht** aller Elemente.
2. **Lokale URL kopieren** (für OBS auf diesem PC) oder **Online-URL kopieren** (für TikTok LIVE Studio und andere Geräte) klicken. Das erste Element behält die bekannte Adresse `http://127.0.0.1:3847/overlay`; weitere Elemente nutzen `…/overlay/counter/<id>`, die Gesamtansicht `…/overlay/all`.
3. In OBS unter **Quellen** auf **+** klicken, **Browser** wählen und einen Namen vergeben, z. B. „Audience Live“.
4. Die URL einfügen und die Größe festlegen: einfacher Zähler **520 × 200**, Abstimmung **600 × 400**, Gesamtansicht **1280 × 720**. Der Reiter **Einrichtung** nennt die passende Größe. Das benutzerdefinierte CSS von OBS kann unverändert bleiben – der Hintergrund des Overlays ist transparent.
5. **Quelle herunterfahren, wenn nicht sichtbar** deaktiviert lassen, damit das Overlay jederzeit aktuell ist.
6. Im Reiter **Design** gestaltest du genau das gewählte Element, zum Beispiel **Hintergrund anzeigen** und **Fortschrittsbalken anzeigen**. Vorschau und OBS übernehmen Änderungen sofort; andere Elemente bleiben unverändert.

Hinweise:

- Audience Live muss laufen, damit das Overlay Daten erhält. Wird die App neu gestartet, verbindet sich das Overlay von selbst wieder; solange keine Verbindung besteht, erscheint es abgeblendet.
- Ist Port `3847` bereits belegt, weicht FlagCount auf einen freien Port aus. In diesem Fall die URL erneut kopieren und in OBS eintragen.
- Die lokale URL ist nur auf diesem Computer erreichbar. Beide Overlays zeigen ausschließlich Zählerstände, Ziele und das Design – keine Chatnachrichten oder Zuschauernamen.

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

Ergebnis: `src-tauri/target/release/bundle/nsis/Audience_Live_<Version>_x64-setup.exe`

Beim ersten Build lädt `pkg` eine Node.js-Basisdatei und Tauri die NSIS-Werkzeuge herunter; dafür ist eine Internetverbindung nötig. Spätere Builds nutzen den Cache.

Der Installer installiert Audience Live für den aktuellen Benutzer, ohne Administratorrechte. Fehlt WebView2, lädt er es automatisch nach.

## Daten und Logs

| Was | Ort |
| --- | --- |
| Einstellungen (Benutzername, Stimmenziel, Overlay) | `%APPDATA%\com.jona1502.flagcount\settings.json` |
| Logdatei | `%LOCALAPPDATA%\com.jona1502.flagcount\logs\FlagCount.log` |

Die Logdatei enthält keine Benutzernamen, Chatinhalte oder Zugangsdaten. Audience Live benötigt keine TikTok-Anmeldung.
