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

Umgesetzt in `deploy/Caddyfile` (Produktion) und `scripts/dev-proxy.mjs` (lokal); beide nutzen dieselbe
Routing-Tabelle aus `scripts/web-routes.mjs`, ein Test prüft, dass Caddyfile und Tabelle übereinstimmen.

- Zum Backend: `/api`, `/api/*`, `/overlay`, `/overlay/*`, `/o/*`, `/ob/*`, `/healthz`, `/readyz`, `/download`.
- Übergangsweise ebenfalls zum Backend, bis Dashboard und Admin-Bereich auf Next.js laufen: `/dashboard`,
  `/admin`, `/admin/*`, `/admin.html`, `/web.html`, `/assets/*` (Vite-Bundle).
- Alles andere geht an Next.js (`/`, `/pro`, `/_next/*`, `/health` …).
- SSE-Routen (`/api/events`, `/overlay/events`, `/overlay/*/events`, `/o/*/events`, `/ob/*/events`) werden sofort
  weitergereicht (`flush_interval -1`) und haben keine Antwort-Timeouts.
- Body-Limits: Webhooks 1 MB, übrige Backend-Routen 64 KB; das Backend prüft zusätzlich strenger.
- Timeouts: Verbindungsaufbau 5 s, Antwort-Header vom Backend 30 s, von Next.js 60 s.
- Das Backend glaubt `CF-Connecting-IP` und `X-Forwarded-For` nur, wenn die Verbindung aus Loopback oder einem
  privaten Netz kommt (Caddy, nginx). Aus `X-Forwarded-For` gilt die rechte Adresse, die kein Proxy ist.

## Sicherheitsheader

- **Website (Next.js)**: CSP mit `default-src 'self'`, `frame-ancestors 'none'`, `connect-src 'self'`; Skripte
  `'self' 'unsafe-inline'`, weil vorgerenderte Seiten keine Nonce tragen. Dazu `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy` und `Permissions-Policy` (`apps/web/next.config.mjs`).
- **Overlays (Backend)**: eigene CSP (`OVERLAY_CSP`), damit OBS und TikTok LIVE Studio sie einbetten können.
- **Admin-Bereich**: eigene, strengere Header; bis zur Migration setzt sie das Backend.
- **API**: `Cache-Control: no-store`, `nosniff`.

## Betrieb

```text
Host-nginx (TLS) -> 127.0.0.1:3016 -> proxy (Caddy :8080)
                                        |-> web    (Next.js :3000)
                                        `-> server (Backend :3010, PostgreSQL, Daten-Volume)
```

- `docker-compose.yml` startet `proxy`, `web` und `server`; nur `proxy` veröffentlicht einen Port.
- Secrets getrennt: `server` liest `.env`, `web` liest `.env.web` (optional, keine Backend-Secrets).
- Healthchecks: `server` über `/healthz`, `web` über `/health`, `proxy` startet erst, wenn beide gesund sind.
- Fällt `web` aus, antworten Overlays, Relay, SSE und Lizenz-API weiter, weil der Proxy sie direkt ans Backend gibt.

## Lokale Entwicklung

```text
npm run dev:next                          # Next.js auf http://127.0.0.1:3001
npm run build:server && PORT=3010 npm run start:web   # Backend auf 3010
npm run dev:proxy                         # alles unter http://localhost:3000
```

## API-Verträge, die während der Migration stabil bleiben

- **Dashboard-API** (`src/web/webApi.ts`, `src/web/webAuth.ts`): Cookie-Session, JSON-Befehle, SSE unter
  `/api/events`. Wird von der Tauri-freien Browser-Variante des Dashboards genutzt.
- **Lizenz-API** (`sidecar/src/web/licensing/licensingRoutes.ts`): von der Desktop-App aufgerufen; Pfade, Status-
  codes und Antwortformen dürfen sich nicht ändern, weil ausgelieferte App-Versionen sie verwenden.
- **Billing-API**: Checkout liefert `{ url }` mit einer Stripe-URL; Preise `{ prices: PriceQuote[] }`.
- **Admin-API** (`sidecar/src/web/admin/adminRoutes.ts`): Lizenzsuche, Details und Änderungen; jede Änderung wird
  im Audit-Protokoll festgehalten.
- **Relay und Overlays**: von ausgelieferten Desktop-Apps und OBS/TikTok LIVE Studio genutzt; unverändert.
