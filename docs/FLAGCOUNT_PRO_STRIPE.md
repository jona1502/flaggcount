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

## 6. Admin-Bereich

1. Auf GitHub unter Settings → Developer settings → OAuth Apps eine App anlegen:
   - Homepage URL: `https://<domain>`
   - Authorization callback URL: `https://<domain>/admin/auth/callback`
   - Für lokale Tests eine eigene App mit `http://localhost:3000/admin/auth/callback`.
2. Client ID und ein neues Client Secret als `ADMIN_GITHUB_CLIENT_ID` und `ADMIN_GITHUB_CLIENT_SECRET` setzen.
3. Die eigene numerische GitHub-ID (`https://api.github.com/users/<name>` → `id`) in `ADMIN_GITHUB_USER_IDS`
   eintragen; mehrere IDs mit Komma trennen.
4. Server neu starten und `/admin` öffnen. Der Admin-Bereich braucht den laufenden Lizenzdienst.

## 7. Umstellung abschließen und Live Mode

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
