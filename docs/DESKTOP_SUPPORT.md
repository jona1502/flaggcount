# Desktop-Supportmatrix

| System | Architektur | Mindestversion | Pakete | Status |
| --- | --- | --- | --- | --- |
| Windows | x86_64 | Windows 10 22H2 | NSIS | unterstützt |
| macOS | x86_64, Apple Silicon | macOS 12 | DMG, App | Release-Kandidat auf nativer CI |
| Linux | x86_64 | Ubuntu 22.04 / glibc-kompatibel | AppImage, deb | Release-Kandidat auf nativer CI |

Die Oberfläche, Sidecar-Protokollversion 7, TikTok-/Twitch-Verbindungen, Zähler, Profile, Historie, Lizenz und Overlays sind auf allen freigegebenen Systemen identisch. Linux ARM64 und RPM sind zunächst nicht Teil des Supportversprechens.

## Native Smoke-Tests

Jeder Release-Runner prüft Typecheck, Unit-/Integrationstests, Rust-Tests, Sidecar-Build und Tauri-Paket. Vor Veröffentlichung werden zusätzlich Erststart, Secret Store, OAuth-Browseröffnung, TikTok/Twitch, lokales Overlay, Suspend/Resume, Upgrade und Deinstallation auf einem sauberen Benutzerkonto geprüft.

## Release und Signatur

Artefakte entstehen ausschließlich auf nativen GitHub-Runnern. Windows-Code-Signing, Apple Developer ID/Notarisierung und Tauri-Updater-Schlüssel werden über Repository-Secrets eingespeist. Ein fehlendes Signatur-Secret erzeugt höchstens ein internes CI-Artefakt und darf keinen Stable-Release veröffentlichen.
