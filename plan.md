# FlagCount – Umsetzungsplan für Claude

## Ziel

Baue eine lokale Windows-App, die rote Flaggen (`🚩`) in einem TikTok-Live-Chat zählt. Pro TikTok-Nutzer darf in jeder Runde nur eine Stimme zählen. Ein Reset startet eine neue Runde und erlaubt allen Nutzern erneut abzustimmen.

## Techstack

- Tauri 2
- React + TypeScript
- Vite
- `tiktok-live-connector`
- Lokaler Node.js-Sidecar für TikTok-Live und das OBS-Overlay
- Tauri Store für lokale Einstellungen

## Kernfunktionen

- Eingabefeld für den TikTok-Benutzernamen
- Livestream verbinden und trennen
- Chatnachrichten in Echtzeit empfangen
- Eine Nachricht zählt, wenn sie mindestens ein `🚩` enthält
- Mehrere Flaggen in einer Nachricht zählen nur einmal
- Pro TikTok-Nutzer zählt nur eine Stimme pro Runde
- Aktuellen Zähler und ein einstellbares Stimmenziel anzeigen
- Reset-Button löscht alle Stimmen der aktuellen Runde
- Automatischer Reconnect nach Verbindungsabbrüchen
- Lokale OBS-Overlay-URL, beispielsweise `http://localhost:3847/overlay`

## Datenmodell

```ts
type VoteState = {
  voters: Set<string>;
  count: number;
  target: number;
  roundId: string;
};
```

Für die Deduplizierung ist nach Möglichkeit die stabile TikTok-`userId` zu verwenden, nicht der Anzeigename.

## Architektur

```text
TikTok Live Connector (Node.js-Sidecar)
                 ↓
           Voting Service
              ↙      ↘
Tauri/React UI       OBS WebSocket/Overlay
```

Die TikTok-Verbindung läuft in einem lokalen Node.js-Sidecar, da `tiktok-live-connector` Node.js benötigt. Die Voting-Logik bleibt als eigenständiges TypeScript-Modul aufgebaut, damit sie später im Web wiederverwendet werden kann. Tauri startet und beendet den Sidecar kontrolliert. React erhält ausschließlich bereinigte Statusdaten über klar definierte Tauri-Commands und Events. Der Sidecar darf nur lokal erreichbar sein und benötigt eine zufällige Sitzungsauthentifizierung.

## Git- und Arbeitsregeln

- Jeder der folgenden Umsetzungspunkte wird als genau ein eigener Commit abgeschlossen.
- Die vorgegebene Reihenfolge und Commit-Nachricht verwenden.
- Keine unterschiedlichen Umsetzungspunkte in einem Commit kombinieren.
- Nur Dateien stagen, die zum jeweiligen Punkt gehören.
- Bereits vorhandene oder fremde Änderungen nicht verändern oder mitcommitten.
- Vor jedem Commit Typecheck, Tests und Build ausführen, soweit die Skripte zu diesem Zeitpunkt vorhanden sind.
- Bei Fehlern zuerst reparieren und erst danach committen.
- Nach jedem Commit prüfen, dass der Arbeitsbaum für die bearbeiteten Dateien sauber ist.

Empfohlener Ablauf je Punkt:

```bash
git status
npm run typecheck
npm test
npm run build
git add <nur relevante Dateien>
git commit -m "<vorgegebene Commit-Nachricht>"
```

## Umsetzungsschritte

### 1. Projekt initialisieren

- Tauri 2, React, TypeScript und Vite einrichten.
- Entwicklungs-, Test-, Typecheck- und Build-Skripte anlegen.
- Sichere Tauri-Capabilities mit minimalen Berechtigungen erstellen.
- Eine minimale Startansicht anzeigen.

Commit:

```text
chore: initialize Tauri React TypeScript project
```

### 2. TikTok-Live-Verbindung

- `tiktok-live-connector` integrieren.
- Service zum Verbinden und Trennen anhand eines TikTok-Benutzernamens erstellen.
- Chat-Events empfangen und in ein internes, stabiles Format überführen.
- Node.js-Sidecar für den Connector einrichten und über Tauri kontrolliert starten.
- Keine Zugangsdaten im Frontend offenlegen.

Commit:

```text
feat: add TikTok Live connection service
```

### 3. Voting-Logik

- Separaten, UI-unabhängigen Voting-Service implementieren.
- Kommentare auf das Zeichen `🚩` prüfen.
- Pro `userId` nur eine Stimme je Runde akzeptieren.
- Mehrere Flaggen desselben Kommentars nur einmal zählen.
- Reset und einstellbaren Zielwert unterstützen.
- Unit-Tests für die Kernlogik hinzufügen.

Commit:

```text
feat: implement tested voting logic
```

### 4. Sichere Tauri-Kommunikation

- Kleine, typisierte Tauri-Command- und Event-API erstellen.
- Aktionen für Verbinden, Trennen, Reset und Einstellungen bereitstellen.
- Status- und Voting-Updates sicher zwischen Sidecar, Tauri und React übertragen.
- Sidecar ausschließlich an `127.0.0.1` binden und Zugriffe pro App-Start authentifizieren.
- Tauri-Capabilities auf die tatsächlich benötigten Rechte beschränken.

Commit:

```text
feat: add secure Tauri communication
```

### 5. Dashboard

- Eingabe des TikTok-Benutzernamens umsetzen.
- Verbinden-/Trennen-Schaltfläche und Verbindungsstatus anzeigen.
- Stimmenzahl, Zielwert und Fortschritt darstellen.
- Reset mit Schutz vor versehentlicher Betätigung ergänzen.
- Verständliche deutsche Fehlermeldungen anzeigen.

Commit:

```text
feat: build voting dashboard
```

### 6. OBS-Overlay

- Lokalen HTTP-Server mit einer Overlay-Seite bereitstellen.
- Voting-Updates per WebSocket oder Server-Sent Events übertragen.
- Transparente, für OBS geeignete Darstellung bauen.
- Overlay-URL im Dashboard anzeigen und kopierbar machen.

Commit:

```text
feat: add OBS overlay server
```

### 7. Reconnect und Fehlerbehandlung

- Automatischen Reconnect mit begrenztem Backoff implementieren.
- Manuelles Trennen von automatischem Verbindungsverlust unterscheiden.
- Fehler protokollieren, ohne sensible Daten zu speichern.
- App und Overlay müssen bei temporären Fehlern weiterlaufen.

Commit:

```text
feat: implement reconnect and error handling
```

### 8. Einstellungen speichern

- TikTok-Benutzername, Stimmenziel und Overlay-Einstellungen mit Tauri Store lokal speichern.
- Sinnvolle Standardwerte und Validierung ergänzen.
- Aktive Stimmen nicht dauerhaft speichern; nach einem Neustart beginnt eine neue Runde.

Commit:

```text
feat: persist application settings
```

### 9. Windows-Installer

- Tauri-Bundling für Windows inklusive Node.js-Sidecar konfigurieren.
- Installierbare `.exe` und sinnvolle App-Metadaten erzeugen.
- Prüfen, dass App, TikTok-Verbindung und Overlay in der gepackten Version starten.
- Build-Anleitung in der README dokumentieren.

Commit:

```text
build: add Windows installer configuration
```

### 10. Testabdeckung vervollständigen

- Fehlende Unit- und Integrationstests ergänzen.
- Tauri-Command-, Reset-, Reconnect- und Overlay-Datenfluss testen.
- Abschließenden Typecheck, alle Tests und Produktions-Build ausführen.
- README um Bedienung und OBS-Einrichtung ergänzen.

Commit:

```text
test: complete voting and integration test coverage
```

## Akzeptanzkriterien

- `🚩`, `🚩🚩` und `Bitte 🚩` ergeben jeweils genau eine Stimme.
- Weitere Flaggen desselben Nutzers werden in derselben Runde ignoriert.
- Nach einem Reset darf derselbe Nutzer erneut abstimmen.
- Nachrichten ohne rote Flagge verändern den Zähler nicht.
- Dashboard und OBS-Overlay aktualisieren sich unmittelbar.
- Zielwert kann geändert werden.
- Verbindungsabbrüche bringen die App nicht zum Absturz.
- Nach einem unerwarteten Abbruch wird die Verbindung automatisch wiederhergestellt.
- Die Anwendung lässt sich als Windows-Installer bauen und starten.
- Es werden keine TikTok-Zugangsdaten benötigt oder unsicher gespeichert.

## Nicht Bestandteil des MVP

- Automatisches Entfernen, Stummschalten oder Blockieren von TikTok-Nutzern
- Cloud-Hosting und Benutzerkonten
- Abstimmungen über andere Plattformen
- Langfristige Speicherung oder Auswertung einzelner Zuschauer
