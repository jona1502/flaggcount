# Twitch-Release-Abnahme

## Automatisiert (2026-09-15)

- [x] TypeScript-Typecheck für Desktop, Sidecar, Shared und Web
- [x] 89 Vitest-Dateien mit 813 Tests
- [x] 66 Rust- und IPC-Tests
- [x] Vite-Produktionsbuild
- [x] Next.js-Produktionsbuild und Secret-Scan des Client-Bundles
- [x] Gebündelter Windows-Sidecar startet mit Protokollversion 7
- [x] Lokale EventSub-Fakes prüfen LIVE-Status, Subscriptions, Chatnormalisierung und doppelte Message-IDs

## Vor dem öffentlichen Release mit echten Anbieterzugängen

- [ ] Produktive Twitch-App als Public Client registrieren und `TWITCH_CLIENT_ID` im nativen Build setzen
- [ ] Device-Code-Anmeldung mit einem Twitch-Testkonto durchführen; angeforderte Berechtigung ist ausschließlich `user:read:chat`
- [ ] Eigenen Testkanal live schalten und Vote, Rücknahme, freie Trigger und Poll-Optionen prüfen
- [ ] Netzwerk kurz trennen; Reconnect zählt neue Events und verwirft erneut zugestellte Message-IDs
- [ ] Stream beenden; UI meldet `stream-ended`, laufende Rundenergebnisse bleiben erhalten
- [ ] Twitch-Konto trennen; lokaler Secret-Store-Eintrag ist entfernt und das Token widerrufen
- [ ] Prüfen, dass Logs, History, Relay und Overlays weder Tokens noch Chattexte oder Zuschauer-IDs enthalten

Die Version wird erst nach den manuellen Punkten veröffentlicht und getaggt.
