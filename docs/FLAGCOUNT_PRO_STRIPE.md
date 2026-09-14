# FlagCount Pro – Stripe einrichten

Diese Anleitung beschreibt die Einrichtung von Stripe im **Test Mode** (Sandbox). Der Live Mode wird erst
eingerichtet, wenn der vollständige Testkauf, Kündigung, fehlgeschlagene Zahlung, Rückerstattung und
Gerätewechsel erfolgreich geprüft wurden (siehe `FLAGCOUNT_PRO_RELEASE_CHECKLIST.md`).

Test und Live bleiben strikt getrennt: eigene API-Keys, eigene Webhook-Endpoints, eigene Preise und eine eigene
Datenbank. Der Server erkennt den Modus am Präfix des Secret Keys (`sk_test_`/`rk_test_` bzw.
`sk_live_`/`rk_live_`).

## 1. Entscheidung: Managed Payments oder Stripe Tax

| | Managed Payments | Normales Stripe + Stripe Tax |
| --- | --- | --- |
| Verkäufer gegenüber Kunden | Stripe (Merchant of Record) | du selbst |
| Umsatzsteuer berechnen | Stripe | Stripe Tax |
| Steuer registrieren, melden, abführen | Stripe | du selbst (z. B. OSS, US Sales Tax) |
| Voraussetzungen | Produkt mit zugelassenem Steuercode, AGB von Managed Payments im Dashboard akzeptiert | Stripe Tax aktiviert, Registrierungen hinterlegt |
| Umgebungsvariable | `STRIPE_MANAGED_PAYMENTS_ENABLED=true` | `STRIPE_MANAGED_PAYMENTS_ENABLED=false` |

Mit Managed Payments setzt der Checkout `managed_payments[enabled]=true`, sonst `automatic_tax[enabled]=true`.
Die Entscheidung ist steuerlich und rechtlich; sie gehört vor dem Live Mode zum Steuerberater.

## 2. Dashboard im Test Mode

1. **Produkt** „FlagCount Pro“ anlegen, Steuercode für Software/SaaS wählen (bei Managed Payments einen als
   „Für Managed Payments zugelassen“ markierten Code).
2. **Preise** am Produkt anlegen: monatlich, jährlich und optional ein zeitlich begrenzter Founding-Preis. Für
   Endkunden in der EU das Steuerverhalten „inklusive“ wählen, damit der angezeigte Preis der Endpreis ist.
3. **Customer Portal** konfigurieren (Einstellungen → Billing → Kundenportal):
   - Rechnungen anzeigen, Zahlungsmethode ändern: an
   - Kündigen: an, **zum Ende des Abrechnungszeitraums**
   - Tarifwechsel: nur zwischen den FlagCount-Preisen
   - Branding (Logo, Farben) und Links zu AGB und Datenschutzerklärung
   - Die ID der Konfiguration (`bpc_…`) optional als `STRIPE_PORTAL_CONFIGURATION_ID` setzen.
4. **E-Mails** (Einstellungen → Billing → Abonnements und E-Mails): Zahlungsbelege, fehlgeschlagene Zahlungen
   und Hinweise vor Verlängerung aktivieren.
5. **Retry-/Dunning-Regeln** (Smart Retries): mehrere Versuche über rund zwei Wochen, danach das Abo kündigen.
   FlagCount gewährt bei `past_due` eine Frist von 14 Tagen; die Regeln sollten dazu passen.
6. **Branding** (Einstellungen → Branding) für Checkout, Portal und Belege.

## 3. Webhook-Endpoint

Endpoint-URL: `https://<domain>/api/v1/billing/webhooks/stripe`

Ereignisse:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`

Als API-Version des Endpoints `2025-03-31.basil` oder neuer wählen. Den Signing Secret (`whsec_…`) als
`STRIPE_WEBHOOK_SECRET` setzen.

## 4. Umgebungsvariablen

Siehe `.env.example`. Für Stripe werden gesetzt:

```
PUBLIC_BASE_URL=https://<domain>
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_MONTHLY=price_…
STRIPE_PRICE_YEARLY=price_…
STRIPE_PRICE_FOUNDING=
STRIPE_PORTAL_CONFIGURATION_ID=
STRIPE_MANAGED_PAYMENTS_ENABLED=false
```

Statt des vollen Secret Keys wird ein **Restricted Key** empfohlen, mit Schreibrechten für Checkout Sessions und
Customer Portal sowie Leserechten für Customers, Subscriptions, Prices, Invoices und Invoice Payments.

Kein Stripe-Secret gehört in die Desktop-App, das Web-Bundle, GitHub Actions oder Logs. Stripe- und
Paddle-Variablen dürfen nicht gleichzeitig gesetzt sein.

## 5. Lokal testen mit der Stripe CLI

```
docker compose -f docker-compose.dev.yml up -d
stripe login
stripe listen --forward-to http://localhost:3000/api/v1/billing/webhooks/stripe
```

`stripe listen` gibt einen eigenen `whsec_…` aus, der lokal als `STRIPE_WEBHOOK_SECRET` gesetzt wird. Mit
`PUBLIC_BASE_URL=http://localhost:3000` und `MAIL_OUTBOX_FILE=data/mail-outbox.jsonl` landen Aktivierungscodes in
einer lokalen Datei statt im Postfach (nur mit Test-Keys erlaubt).

Testkarten: `4242 4242 4242 4242` (erfolgreich), `4000 0000 0000 0341` (Karte wird gespeichert, spätere
Zahlungen scheitern), `4000 0025 0000 3155` (3D Secure). Einzelne Ereignisse lassen sich mit
`stripe trigger <event>` auslösen; Verlängerungen und Mahnläufe mit Test Clocks.

## 6. Website: Rückkehr, Wiederherstellung und Kundenportal

- Stripe leitet nach dem Checkout auf `/pro/erfolgreich?session_id=cs_…` zurück. Die Seite fragt über
  `GET /api/v1/billing/checkout-status` nur den Status der Session ab (abgeschlossen, bezahlt, offen, abgelaufen);
  fehlende oder manipulierte IDs zeigen eine neutrale Seite. Freigeschaltet wird dort nichts.
- `/lizenz-wiederherstellen` antwortet für jede Adresse gleich.
- `/abo-verwalten` erklärt den Weg über die App und zeigt optional den Anmeldelink des Kundenportals. Dazu im
  Stripe-Dashboard unter Kundenportal den „Link zum Kundenportal“ aktivieren und ihn als `STRIPE_PORTAL_LOGIN_URL`
  in `.env.web` des Web-Containers setzen (siehe `.env.web.example`).
- Im Test Mode durchspielen: Kauf monatlich und jährlich, Rückkehrseite mit gültiger, abgelaufener und
  erfundener Session-ID, abgebrochener Checkout (Rückkehr auf `/pro`, keine Lizenz), Wiederherstellung und
  Portal-Anmeldelink.

## 7. Admin-Bereich

1. `ADMIN_EMAIL` und ein starkes `ADMIN_PASSWORT` mit mindestens 12 Zeichen in die Deployment-`.env` eintragen.
2. Ein internes Geheimnis erzeugen (`openssl rand -hex 32`) und als `ADMIN_ASSERTION_SECRET` ergänzen.
3. Beide Container neu starten und `/admin` öffnen. Die Lizenzverwaltung braucht den laufenden Lizenzdienst.

## 8. Umstellung abschließen und Live Mode

Die Paddle-Integration bleibt im Code, bis Stripe vollständig getestet ist. Reihenfolge:

1. Vollständigen Testkauf im Test Mode durchführen (monatlich und jährlich), Aktivierungsmail und Aktivierung in
   der App prüfen.
2. Kündigung zum Periodenende, fehlgeschlagene Verlängerung (Test Clock), Voll- und Teilerstattung, Anfechtung
   und Gerätewechsel (drei Installationen, vierte ersetzt eine) testen.
3. Admin-Bereich prüfen: Suche, Sperre, manuelle Lizenz, neuer Code per E-Mail.
4. Datenschutzerklärung und Rechtstexte aktualisieren (siehe `FLAGCOUNT_PRO_OPERATIONS.md`).
5. Erst danach den Paddle-Code, die Paddle-Variablen, die Paddle-Domains in der Desktop-Allowlist und die
   Paddle-Dokumentation entfernen.
6. Live Mode: Produkt, Preise, Portal und Webhook-Endpoint im Live-Modus neu anlegen, Live-Keys und eigene
   Live-Datenbank setzen, `MAIL_OUTBOX_FILE` entfernen, kontrollierten Echtkauf mit Rückerstattung durchführen.
