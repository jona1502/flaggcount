# FlagCount Pro – Release-Checkliste

## Automatisiert

- [ ] `npm run typecheck`
- [ ] `npm test -- --run`, zusätzlich mit `TEST_DATABASE_URL` gegen eine Wegwerf-Datenbank
- [ ] `npm run test:rust`
- [ ] `npm run build` und `npm run build:web` (erzeugt `web.html` und `admin.html`)
- [ ] Migrations- und Backup-Wiederherstellungstest

## Stripe Test Mode (siehe `FLAGCOUNT_PRO_STRIPE.md`)

- [ ] Entscheidung Managed Payments oder Stripe Tax getroffen und `STRIPE_MANAGED_PAYMENTS_ENABLED` gesetzt.
- [ ] Produkt, Preise, Customer Portal, Branding, E-Mails und Retry-Regeln im Test Mode eingerichtet.
- [ ] `stripe listen --forward-to …/api/v1/billing/webhooks/stripe` lokal oder Webhook-Endpoint auf dem Testserver.
- [ ] Monatlichen und jährlichen Checkout abschließen; Aktivierungsmail und Aktivierung in der App prüfen.
- [ ] Rückkehr auf `/pro/erfolgreich` ohne Webhook aktiviert nichts.
- [ ] Zahlung mit 3D Secure und mit später scheiternder Karte; `past_due`-Frist und Ende nach Mahnlauf (Test Clock).
- [ ] Kündigung zum Periodenende im Kundenportal: Pro bleibt bis zum Ende, danach nicht mehr.
- [ ] Voll- und Teilerstattung, Anfechtung (verloren und gewonnen) und Entitlement-Reaktion prüfen.
- [ ] Ereignisse doppelt und in falscher Reihenfolge zustellen (`stripe events resend`); Stand bleibt korrekt.
- [ ] Gerätewechsel: drei Installationen, die vierte ersetzt eine; Deaktivierung im Admin-Bereich.
- [ ] Lizenzwiederherstellung über die E-Mail-Adresse, auch mit abweichender Groß- und Kleinschreibung.

## Admin-Bereich

- [ ] Anmeldung mit freigegebenem GitHub-Konto; fremdes Konto wird abgelehnt.
- [ ] Sitzung endet nach Leerlauf; Abmelden funktioniert.
- [ ] Suche nach Referenz, `cus_…` und `sub_…`; Stripe-Links öffnen den richtigen Datensatz.
- [ ] Manuelle Lizenz anlegen, Code einmal angezeigt, Aktivierung, Verlängerung, Sperre und Entsperrung.
- [ ] Audit-Protokoll enthält jede Änderung, aber keine Codes oder Hinweistexte.

## Manuell vor Produktion

- [ ] Windows-Installer installieren, aktualisieren und deinstallieren; Free-Modus ohne Netzwerk prüfen.
- [ ] Rechtlich geprüfte Texte (Impressum, Datenschutz mit Stripe, E-Mail-Anbieter und GitHub, AGB, Widerruf,
      Preisangaben) veröffentlichen.
- [ ] Paddle-Code, -Variablen, -Domains und -Dokumentation entfernt.
- [ ] Live Mode mit eigenen Keys, eigener Datenbank und eigenem Webhook-Endpoint; `MAIL_OUTBOX_FILE` nicht gesetzt.
- [ ] Kontrollierter Echtkauf mit kleinem Betrag und anschließender Rückerstattung.

## Rollback

Bei fehlerhaften Webhooks die Stripe-Variablen entfernen (Checkout antwortet dann mit 503), laufende Free-Nutzung
und bereits signierte Entitlements weiter erlauben, Secrets rotieren, fehlgeschlagene Ereignisse nach der
Korrektur im Stripe-Dashboard erneut senden und den Incident im Runbook dokumentieren.
