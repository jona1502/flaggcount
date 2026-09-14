# FlagCount Web – Routing-Matrix und API-Verträge

Bestandsaufnahme vor der Next.js-Migration (`NEXTJS_PLAN.md`, Phase 0). Die Spalte **Ziel** legt fest, welcher
Dienst eine Route nach der Migration beantwortet. Alle Routen liegen unter derselben öffentlichen Origin; ein
Reverse Proxy verteilt sie anhand des Pfads.

Abweichend von der Skizze im Plan heißen die Overlay-Routen `/overlay/*`, `/o/*` und `/ob/*` (nicht `/board/*`).

## Seiten

| Pfad | Heute | Ziel | Hinweise |
| --- | --- | --- | --- |
| `/` | Backend liefert `web.html` (Vite, Landingpage) | Next.js | statisch |
| `/pro` | Backend liefert `web.html`, Client scrollt zu `#pro` | Next.js | eigene Pro-Seite; Checkout über Backend |
| `/pro/erfolgreich` | Backend liefert `web.html` | Next.js | Rückkehr von Stripe Checkout, schaltet nichts frei |
| `/herunterladen` | – | Next.js | neue Downloadseite mit Versionshinweis |
| `/lizenz-wiederherstellen` | – | Next.js | neutrale Antwort, ruft `/api/v1/licenses/recover` |
| `/abo-verwalten` | – | Next.js | Einstieg ins Stripe-Kundenportal |
| `/impressum`, `/datenschutz`, `/agb` | – | Next.js | statisch, Texte vor Launch rechtlich prüfen |
| `/dashboard` | Backend liefert `web.html` (Login + Dashboard) | Next.js | Client-Komponente, Session beim Backend |
| `/admin`, `/admin/*` | Backend liefert `admin.html` (Vite), nur wenn konfiguriert | Next.js | eigener Login, siehe unten |
| `/admin/auth/login`, `/admin/auth/callback` | Backend (GitHub OAuth) | Next.js | wandert in Phase 5 zu Next.js |
| `/sitemap.xml`, `/robots.txt` | – | Next.js | |

## Backend-Routen

| Pfad | Methode | Ziel | Auth | Hinweise |
| --- | --- | --- | --- | --- |
| `/healthz` | GET | Backend | – | Liveness |
| `/readyz` | GET | Backend | – | prüft Datenbank des Lizenzdienstes |
| `/download` | GET/HEAD | Backend | – | 302 auf den neuesten Installer; bestehender Link bleibt |
| `/overlay`, `/overlay/*` | GET | Backend | – | Overlay des Web-Controllers, `/overlay/events` ist SSE |
| `/o/:channel`, `/o/:channel/events` | GET | Backend | – | öffentliches Online-Overlay, SSE |
| `/ob/:channel`, `/ob/:channel/events` | GET | Backend | – | Pro-Zähler-Overlay, SSE |
| `/api/relay/:channel` | PUT | Backend | Relay-Key | Desktop-App veröffentlicht Zählerstand |
| `/api/relay/board/:channel` | PUT | Backend | Relay-Key + Entitlement | Pro-Zähler |
| `/api/release` | GET | Backend | – | neueste Desktop-Version |
| `/api/session` | GET | Backend | Cookie | `{ authenticated }` |
| `/api/login`, `/api/logout` | POST | Backend | Passwort / Cookie | Dashboard-Login, Cookie `flagcount_session` |
| `/api/state` | GET | Backend | Cookie | Dashboard-Zustand |
| `/api/events` | GET | Backend | Cookie | SSE, Zustand und Fehler |
| `/api/connect`, `/api/disconnect`, `/api/manual-vote`, `/api/manual-vote/remove`, `/api/reset`, `/api/target`, `/api/overlay` | POST | Backend | Cookie + Same-Origin-JSON | Dashboard-Befehle |
| `/api/v1/waitlist`, `/api/v1/waitlist/unsubscribe` | POST | Backend | – | Warteliste |
| `/api/v1/licenses/activate`, `refresh`, `deactivate`, `recover` | POST | Backend | Code / Installationsgeheimnis | Desktop-App, Recovery |
| `/api/v1/billing/checkout` | POST | Backend | – | erzeugt Stripe Checkout Session |
| `/api/v1/billing/portal` | POST | Backend | Installationsgeheimnis | erzeugt Stripe-Portal-Session |
| `/api/v1/billing/prices` | GET | Backend | – | Preise von Stripe |
| `/api/v1/billing/webhooks/stripe` | POST | Backend | Stripe-Signatur | Rohkörper bis 1 MB |
| `/api/v1/billing/webhooks/paddle` | POST | Backend | Paddle-Signatur | bis zur Entfernung von Paddle |
| `/api/admin/*` | GET/POST | Backend | Admin-Nachweis | Lizenzverwaltung, nie ohne serverseitigen Nachweis |

Nicht Teil des Webs: Der lokale Server der Desktop-App (`sidecar/src/server/localServer.ts`, Port 3847) liefert
`/overlay` für OBS auf demselben Rechner.

## Proxy-Regeln

- Präfixe zum Backend: `/api/`, `/overlay`, `/o/`, `/ob/`, `/healthz`, `/readyz`, `/download` (exakt).
- Alles andere geht an Next.js.
- SSE-Routen (`/api/events`, `/overlay/events`, `/o/*/events`, `/ob/*/events`, `/overlay/*/events`) ohne
  Response-Buffering und ohne Leerlauf-Timeout weiterleiten.
- Body-Limits: Webhooks 1 MB, übrige API-Routen wenige KB (das Backend prüft zusätzlich).
- `X-Forwarded-For` nur vom eigenen Proxy übernehmen.

## API-Verträge, die während der Migration stabil bleiben

- **Dashboard-API** (`src/web/webApi.ts`, `src/web/webAuth.ts`): Cookie-Session, JSON-Befehle, SSE unter
  `/api/events`. Wird von der Tauri-freien Browser-Variante des Dashboards genutzt.
- **Lizenz-API** (`sidecar/src/web/licensing/licensingRoutes.ts`): von der Desktop-App aufgerufen; Pfade, Status-
  codes und Antwortformen dürfen sich nicht ändern, weil ausgelieferte App-Versionen sie verwenden.
- **Billing-API**: Checkout liefert `{ url }` mit einer Stripe-URL; Preise `{ prices: PriceQuote[] }`.
- **Admin-API** (`sidecar/src/web/admin/adminRoutes.ts`): Lizenzsuche, Details und Änderungen; jede Änderung wird
  im Audit-Protokoll festgehalten.
- **Relay und Overlays**: von ausgelieferten Desktop-Apps und OBS/TikTok LIVE Studio genutzt; unverändert.
