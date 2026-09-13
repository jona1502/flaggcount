# FlagCount-Updater

## Signierschlüssel

Der öffentliche Tauri-Updater-Schlüssel steht in `src-tauri/tauri.conf.json`. Der zugehörige private Schlüssel wurde bewusst außerhalb des Repositories erzeugt:

```text
C:\Users\muhr9\.tauri\flagcount.key
```

Der private Schlüssel ist mit einem Passwort geschützt. Schlüsseldatei und Passwort müssen getrennt an einem zweiten sicheren Ort gesichert werden (Passwort z. B. im Passwortmanager, nicht als Textdatei neben dem Schlüssel). Geht eines von beiden verloren, können bereits installierte Versionen keine neuen Updates mehr verifizieren.

Für lokale signierte Builds:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = 'C:\Users\muhr9\.tauri\flagcount.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = Read-Host 'Signierpasswort' -MaskInput
npm run package:windows
```

Für GitHub Actions muss der vollständige Inhalt der privaten Schlüsseldatei als Repository-Secret `TAURI_SIGNING_PRIVATE_KEY` und das Passwort als Repository-Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` hinterlegt werden.

Private Schlüssel und öffentliche Schlüsseldateien sind über `.gitignore` vor versehentlichem Einchecken geschützt. Der bereits konfigurierte öffentliche Schlüssel in `tauri.conf.json` darf veröffentlicht werden.

## Updatequelle

Die Anwendung liest das Manifest des neuesten GitHub Release von:

```text
https://github.com/jona1502/flaggcount/releases/latest/download/latest.json
```

Dieses Manifest und die darin verlinkten Update-Artefakte müssen ohne GitHub-Anmeldung erreichbar sein. Bei einem privaten Repository muss dafür entweder das Repository öffentlich werden oder ein separates öffentliches Downloadziel konfiguriert werden. Ein GitHub-Token darf nicht in die Desktop-App eingebaut werden.

## GitHub Actions einrichten

1. Den Inhalt von `C:\Users\muhr9\.tauri\flagcount.key` kopieren.
2. Im Repository unter **Settings → Secrets and variables → Actions** ein Repository-Secret namens `TAURI_SIGNING_PRIVATE_KEY` anlegen.
3. Ein weiteres Repository-Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` mit dem Schlüsselpasswort anlegen.
4. Sicherstellen, dass GitHub Actions Releases schreiben darf. Der Workflow fordert dafür ausschließlich `contents: write` an.

Der Workflow `.github/workflows/release.yml` läuft bei Tags mit dem Präfix `app-v` sowie manuell. Er führt Typecheck und Tests aus, baut den Windows-NSIS-Installer, signiert das Update und veröffentlicht `latest.json`, Installer und Signatur als GitHub Release.

## Version veröffentlichen

Alle Versionsangaben werden gemeinsam aktualisiert:

```powershell
npm run version:set -- 0.2.0
npm run version:check
```

Danach Änderungen und Release Notes committen und einen exakt passenden Tag pushen:

```powershell
git tag app-v0.2.0
git push origin main app-v0.2.0
```

Der Workflow bricht ab, wenn Tag und App-Version voneinander abweichen.

## Erster Rollout

`0.2.0` ist die erste Version mit Updater. Bestehende `0.1.0`-Installationen können sie noch nicht automatisch finden und müssen den neuen Installer einmal manuell ausführen.

Vor der ersten Veröffentlichung müssen das GitHub-Secret gesetzt und die Update-Dateien öffentlich erreichbar sein. Danach:

1. `0.2.0` veröffentlichen und manuell installieren.
2. Mit `npm run version:set -- 0.2.1` eine Testversion vorbereiten.
3. Release Notes ergänzen, committen und `app-v0.2.1` pushen.
4. In der installierten `0.2.0` sowohl die automatische Prüfung beim Start als auch **Nach Updates suchen** testen.
5. Downloadfortschritt, Signaturprüfung, passive NSIS-Installation und Neustart als `0.2.1` kontrollieren.

Ein fehlgeschlagener oder nicht signierter Download darf niemals installiert werden. Die bisherige Installation muss in diesem Fall weiter funktionieren.
