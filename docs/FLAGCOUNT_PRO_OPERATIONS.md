# FlagCount Pro – Betrieb und Compliance

Dieses Runbook beschreibt die wiederholbaren Abläufe für Billing, Lizenzen und Support. Es enthält keine
Rechtsberatung; Impressum, Datenschutzerklärung, AGB und Widerrufstext müssen vor dem Launch rechtlich geprüft
und in die öffentliche Website eingebunden werden. Die Einrichtung von Stripe steht in
`FLAGCOUNT_PRO_STRIPE.md`.

## Billing und Webhooks

- Zahlungsanbieter ist Stripe. Mit `STRIPE_MANAGED_PAYMENTS_ENABLED=true` ist Stripe Merchant of Record und
  übernimmt die Umsatzsteuer; ohne Managed Payments berechnet Stripe Tax die Steuer, Registrierung, Meldung und
  Abführung liegen dann beim Betreiber.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Price IDs und die Portal-Konfiguration werden ausschließlich als
  Server-Secrets gesetzt. Test- und Live-Keys nie mischen; der Server erkennt den Modus am Key.
- Webhooks werden über die `Stripe-Signature` geprüft, per Event-ID dedupliziert und erst danach verarbeitet.
  Abo-Ereignisse lösen einen Abgleich aus: Der Server liest das Abo aktuell bei Stripe, dadurch sind Reihenfolge
  und Verspätung der Ereignisse egal.
- Die Rückkehr aus dem Checkout aktiviert nichts. Lizenzen und Aktivierungscodes entstehen nur aus verifizierten
  Webhooks, und der erste Code wird erst verschickt, wenn das Abo aktiv ist.
- Pro gibt es bei `active` und `trialing`, bei `past_due` noch 14 Tage ab Beginn der unbezahlten Periode. Bei
  `incomplete`, `incomplete_expired`, `unpaid`, `paused`, beendeten Abos, vollständiger Erstattung, Chargeback und
  Support-Sperre gibt es kein Pro. Free bleibt immer nutzbar.
- Bei Provider-Ausfall bleibt der Kauf deaktiviert; niemals eine bezahlte Lizenz ohne bestätigten Webhook
  nachbauen. Für Ausnahmen gibt es manuelle Lizenzen.

## Admin-Bereich

- Erreichbar unter `/admin`, ausgeliefert vom Web-Container (Next.js). Für einen einzelnen Betreiber stehen
  `ADMIN_EMAIL`, `ADMIN_PASSWORT` (mindestens 12 Zeichen) und `ADMIN_ASSERTION_SECRET` in der Deployment-`.env`.
  Compose reicht E-Mail, Passwort und Assertion-Secret an den Web-Container; der Server verwendet E-Mail und
  dasselbe Assertion-Secret zur zusätzlichen Autorisierung. Das Dashboard-Passwort wird nicht wiederverwendet.
- Sitzungen liegen im Speicher des Web-Containers: 30 Minuten Leerlauf, höchstens 8 Stunden; ein Neustart meldet ab.
- Der Web-Container signiert jede Anfrage an die Admin-API des Servers mit einem kurzlebigen Nachweis. Wer den
  Server direkt erreicht, erhält ohne diesen Nachweis keine Admin-Rechte.
- Jede Änderung braucht ein CSRF-Token und landet im Audit-Protokoll (`admin_audit_log`) mit pseudonymer Admin-ID,
  Aktion und Zeitpunkt, ohne Codes, Hinweistexte oder Kundendaten.
- Admins dürfen: Installationen deaktivieren, Aktivierungscodes erneuern (anzeigen oder per E-Mail senden),
  Lizenzen sperren und entsperren, interne Hinweise pflegen, manuelle Lizenzen anlegen und verlängern.
- Admins dürfen nicht: bezahlt/unbezahlt, Abo-Laufzeit, Preis, Kündigung oder Erstattung einer Stripe-Lizenz
  ändern. Das passiert im Stripe-Dashboard; der Webhook übernimmt den neuen Stand.
- Interne Hinweise enthalten keine Namen, E-Mail-Adressen oder Zahlungsdaten; Tickets verweisen auf die
  Lizenzreferenz `FC-…`.
- Zugriff entziehen: `ADMIN_EMAIL` oder `ADMIN_PASSWORT` ändern und beide Container neu starten (beendet alle
  Sitzungen). Bei Verdacht zusätzlich `ADMIN_ASSERTION_SECRET` rotieren.

## Manuelle Lizenzen

- Der Lizenzdienst kann vor der Stripe-Einrichtung im Modus `manual licenses only` starten. Dafür genügen
  PostgreSQL, Signierschlüssel, Code-Pepper, Supportadresse und SMTP/Resend. Checkout und Webhooks bleiben bis
  zur vollständigen Stripe-Konfiguration deaktiviert.
- Nur für Support, Creator-Kooperationen, Tests oder Aktionen; der Grund ist Pflicht.
- Möglichst mit Ablaufdatum (höchstens fünf Jahre). Keine erfundenen Stripe-Kunden oder -Abos.
- Der Aktivierungscode wird beim Anlegen einmal angezeigt und nur als Hash gespeichert. Geht er verloren, im
  Admin-Bereich einen neuen Code anzeigen lassen.

## Refunds, Kündigungen und Chargebacks

1. Vorgang im Stripe-Dashboard prüfen und dort auslösen (Erstattung, Kündigung, Beleg).
2. Nichts davon in der Datenbank oder im Admin-Bereich nachbauen.
3. Das Webhook-Ereignis abwarten: Eine vollständige Erstattung oder ein Chargeback beendet Pro sofort, eine
   gewonnene Anfechtung stellt es wieder her, Teilerstattungen und Anfragen (Inquiries) ändern nichts.
4. Lizenzreferenz im Support-Ticket dokumentieren.

## Incident und Recovery

- Bei Billing-Fehlern zuerst `/readyz`, `/api/v1/billing/prices` und im Stripe-Dashboard die Zustellungen des
  Webhook-Endpoints prüfen. Fehlgeschlagene Ereignisse erneut senden; der Server verarbeitet sie idempotent.
- Secrets rotieren, wenn ein Schlüssel versehentlich offengelegt wurde (Stripe-Key, Webhook-Secret, GitHub-Client-
  Secret, `LICENSE_CODE_PEPPER` nur im äußersten Notfall, weil alle Codes ungültig werden); danach einen Testkauf
  im Test Mode und die Webhook-Signatur prüfen.
- Datenbank-Backups verschlüsselt und regelmäßig wiederherstellbar testen. Aktivierungscodes und Secrets nie in Logs.
- Kunden ohne Code: Wiederherstellung über die App (E-Mail-Adresse des Kaufs) oder im Admin-Bereich
  „Neuen Code per E-Mail“.

## Datenschutz

Gespeichert werden für FlagCount Pro:

- interne Lizenz-ID, Stripe-Kunden- und Abo-Kennung, Abo-Status, bezahltes Periodenende, geplante Kündigung;
- Hash des Aktivierungscodes und Zeitpunkt der Ausstellung;
- pseudonyme Installationskennungen der App mit Aktivierung und letztem Kontakt (höchstens drei aktive);
- Webhook-Ereignis-IDs zur Deduplizierung;
- Support-Sperre, interne Hinweise und das Admin-Audit-Protokoll mit der pseudonymen Admin-ID.

Nicht gespeichert werden E-Mail-Adressen, Namen, Adressen und Zahlungsdaten der Kunden. Die E-Mail-Adresse wird
nur zum Versand eines Codes bei Stripe abgefragt. Logs enthalten weder Codes, Secrets, E-Mail-Adressen noch
IP-Adressen.

Beteiligte Dienste für die Datenschutzerklärung und Verträge zur Auftragsverarbeitung:

- **Stripe**: Checkout, Zahlungen, Belege, Kundenportal, Steuer (bei Managed Payments als Merchant of Record);
- **E-Mail-Anbieter** (SMTP): Versand der Aktivierungscodes;
- **GitHub**: nur Anmeldung der Admins, keine Kundendaten;
- **Hosting** der Website, des Lizenzdienstes und der Datenbank.

Lösch- und Auskunftsanfragen nach dem geprüften Datenschutzprozess bearbeiten: Die Lizenz über die Stripe-Kunden-ID
im Admin-Bereich finden; Kundendaten selbst liegen bei Stripe.

## Recht vor Launch

Vor Veröffentlichung müssen die zuständigen Betreiber die Rechtstexte prüfen lassen und verlinken: Impressum,
Datenschutzerklärung (mit den oben genannten Diensten), AGB, Widerruf/Verbraucherinformationen inklusive der
Zustimmung zur sofortigen Bereitstellung digitaler Inhalte, Preisangaben sowie Hinweise zur automatischen
Verlängerung und Kündigung. Ohne Managed Payments zusätzlich die steuerlichen Pflichten (z. B. OSS) klären.
