# FlagCount-Updater

## Signierschlüssel

Der öffentliche Tauri-Updater-Schlüssel steht in `src-tauri/tauri.conf.json`. Der zugehörige private Schlüssel wurde bewusst außerhalb des Repositories erzeugt:

```text
C:\Users\muhr9\.tauri\flagcount.key
```

Der private Schlüssel hat kein Passwort. Er muss an einem zweiten sicheren Ort gesichert werden. Geht er verloren, können bereits installierte Versionen keine neuen Updates mehr verifizieren.

Für lokale signierte Builds:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = 'C:\Users\muhr9\.tauri\flagcount.key'
npm run package:windows
```

Für GitHub Actions muss der vollständige Inhalt der privaten Schlüsseldatei als Repository-Secret `TAURI_SIGNING_PRIVATE_KEY` hinterlegt werden. Ein Passwort-Secret ist für diesen Schlüssel nicht erforderlich.

Private Schlüssel und öffentliche Schlüsseldateien sind über `.gitignore` vor versehentlichem Einchecken geschützt. Der bereits konfigurierte öffentliche Schlüssel in `tauri.conf.json` darf veröffentlicht werden.
