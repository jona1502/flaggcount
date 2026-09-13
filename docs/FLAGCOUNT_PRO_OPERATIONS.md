# FlagCount Pro – Betrieb und Compliance

Dieses Runbook beschreibt die wiederholbaren Abläufe für Billing, Lizenzen und Support. Es enthält keine
Rechtsberatung; Impressum, Datenschutzerklärung, AGB und Widerrufstext müssen vor dem Launch rechtlich geprüft
und in die öffentliche Website eingebunden werden.

## Billing und Webhooks

- Paddle bleibt Merchant of Record und liefert Preise, Steuern und Checkout-URLs.
- `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET` und die Price IDs werden ausschließlich als Server-Secrets gesetzt.
- Webhooks werden über die Signatur geprüft, dedupliziert und erst danach auf den Lizenzbestand angewendet.
- Bei Provider-Ausfall bleibt der Kauf deaktiviert; niemals manuell eine Lizenz ohne bestätigten Webhook ausstellen.

## Refunds und Chargebacks

1. Vorgang im Paddle-Dashboard prüfen.
2. Refund/Chargeback nicht direkt in der Datenbank nachbauen; die Provider-Aktion auslösen.
3. Das resultierende Webhook-Ereignis abwarten und die Lizenzreferenz im Support-Ticket dokumentieren.

## Incident und Recovery

- Bei Billing-Fehlern zuerst `/api/v1/billing/prices` und die Server-Readiness prüfen.
- Secrets rotieren, wenn ein Schlüssel versehentlich offengelegt wurde; danach Webhook-Signatur testen.
- Datenbank-Backups verschlüsselt und regelmäßig wiederherstellbar testen. Aktivierungscodes und Secrets nie in Logs.

## Support und Datenschutz

- Support erhält nur die bereinigte Lizenzreferenz, Plan-/Statusangaben und die freiwillige Fehlerbeschreibung.
- Logs, IP-Adressen und Zahlungsdaten werden nicht automatisch an Support gesendet.
- Lösch- und Auskunftsanfragen nach dem geprüften Datenschutzprozess bearbeiten.

## Recht vor Launch

Vor Veröffentlichung müssen die zuständigen Betreiber die Rechtstexte prüfen lassen und verlinken: Impressum,
Datenschutzerklärung, AGB, Widerruf/Verbraucherinformationen, Preisangaben sowie Hinweise zur automatischen
Verlängerung und Kündigung.
