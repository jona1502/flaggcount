# FlagCount Pro – Release-Checkliste

## Automatisiert

- [ ] `npm run typecheck`
- [ ] `npm test -- --run`
- [ ] `npm run test:rust`
- [ ] `npm run build` und `npm run build:web`
- [ ] Migrations- und Backup-Wiederherstellungstest

## Manuell vor Produktion

- [ ] Windows-Installer installieren, aktualisieren und deinstallieren; Free-Modus ohne Netzwerk prüfen.
- [ ] Paddle-Sandbox: monatlichen und jährlichen Checkout abschließen, Webhook-Signatur und Aktivierungsmail prüfen.
- [ ] Refund/Chargeback in Sandbox auslösen und Entitlement-Reaktion prüfen.
- [ ] Kontrollierter Produktionskauf mit kleinem Betrag und anschließender Rückerstattung.
- [ ] Rechtlich geprüfte Texte (Impressum, Datenschutz, AGB, Widerruf, Preisangaben) veröffentlichen.

## Rollback

Bei fehlerhaften Webhooks Checkout über die Provider-Konfiguration deaktivieren, laufende Free-Nutzung
weiter erlauben, Secrets rotieren und den Incident im Runbook dokumentieren.
