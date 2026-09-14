# FlagCount Next.js-Migrationsplan

## Umsetzungsstand (14. September 2026)

Die Phasen 0 bis 8 sind umgesetzt. Die öffentliche Website, das Admin-Dashboard und das Browser-Dashboard laufen unter Next.js; der alte Vite-Webclient und die statische Website-Auslieferung des Backends sind entfernt. Die Desktop-App verwendet weiterhin Vite.

Phase 9 bleibt bewusst zurückgestellt: Das Verschieben von `src/`, `sidecar/` und `shared/` bringt aktuell keinen funktionalen Vorteil und würde nur Importpfade sowie Build-Konfigurationen verändern.

## Ziel

Die öffentliche FlagCount-Website, das künftige Admin-Dashboard und das Browser-Dashboard werden auf Next.js mit App Router umgestellt. Die Tauri-Desktop-App bleibt eine React-/Vite-Anwendung. Der bestehende Node.js-Server bleibt für Stripe, Lizenzen, PostgreSQL, TikTok-Verbindung, öffentliche Overlays und Server-Sent Events verantwortlich.

Der Wechsel soll echtes Routing, serverseitig erzeugte öffentliche Seiten, Metadaten, eine belastbare Admin-Authentifizierung und eine klare Trennung zwischen Weboberfläche und Backend schaffen, ohne den funktionierenden Desktop- und Echtzeitkern neu zu schreiben.

## Verbindliche Architekturentscheidung

| Bereich | Technik | Verantwortung |
| --- | --- | --- |
| Windows-App | Tauri, React, Vite | lokale Bedienung, Profile, Stimmen, lokale Overlays |
| Öffentliche Website | Next.js App Router | Landingpage, Pro, Download, Rechtstexte |
| Admin-Dashboard | Next.js App Router | geschützte Lizenzverwaltung |
| Browser-Dashboard | Next.js Client-Komponenten | bestehende Dashboard-Oberfläche im Browser |
| Backend | bestehender Node.js-Service | Stripe, Lizenzen, Admin-API, Relay, SSE |
| Datenbank | PostgreSQL | Lizenzen, Installationen, Webhooks, Admin-Audit |
| Gemeinsame Modelle | `shared/` bzw. später `packages/shared/` | Typen, Validierung, Entitlements |

Next.js ersetzt weder den Tauri-Frontend-Build noch den spezialisierten Backendprozess.

## Nicht-Ziele

- Die Desktop-App wird nicht auf Next.js umgestellt.
- Stripe-Secrets oder Lizenzsignierschlüssel gelangen nicht in den Next.js-Client.
- Stripe-Webhooks werden nicht von Browsercode verarbeitet.
- Relay, TikTok-Verbindung und Overlay-SSE werden nicht neu implementiert.
- Es wird kein zusätzliches Astro-Projekt eingeführt.
- Für Version 1 wird kein allgemeines FlagCount-Kundenkonto gebaut.
- Bestehende Free-Funktionen werden nicht verändert oder gesperrt.

## Zielrouting

```text
Browser
  |
  |-- /                         -> Next.js
  |-- /pro                      -> Next.js
  |-- /pro/erfolgreich          -> Next.js
  |-- /download                 -> Next.js oder kontrollierter Backend-Redirect
  |-- /lizenz-wiederherstellen  -> Next.js
  |-- /dashboard                -> Next.js
  |-- /admin/*                  -> Next.js
  |-- /datenschutz              -> Next.js
  |-- /impressum                -> Next.js
  |-- /agb                      -> Next.js
  |
  |-- /api/v1/billing/*         -> Backend
  |-- /api/v1/licenses/*        -> Backend
  |-- /api/admin/*              -> Backend
  |-- /api/events               -> Backend
  |-- /api/relay/*              -> Backend
  |-- /o/*                      -> Backend
  `-- /board/*                  -> Backend
```

Ein Reverse Proxy routet anhand des Pfads zu Next.js oder zum Backend. SSE-Routen müssen ohne Response-Buffering weitergeleitet werden.

## Vorgesehene Projektstruktur

Die Struktur wird schrittweise eingeführt. Ein großer einmaliger Dateiumzug ist nicht erforderlich.

```text
apps/
  desktop/
    src/
    src-tauri/
    vite.config.ts

  web/
    app/
      layout.tsx
      page.tsx
      pro/page.tsx
      pro/erfolgreich/page.tsx
      lizenz-wiederherstellen/page.tsx
      dashboard/page.tsx
      admin/
        layout.tsx
        page.tsx
        licenses/page.tsx
        licenses/[id]/page.tsx
      datenschutz/page.tsx
      impressum/page.tsx
      agb/page.tsx
    components/
    lib/
    public/

services/
  server/
    licensing/
    stripe/
    admin/
    relay/
    overlay/

packages/
  shared/
```

Bis diese Struktur einen konkreten Vorteil bringt, dürfen `src/`, `sidecar/`, `shared/` und `src-tauri/` an ihren heutigen Orten bleiben. Funktionale Migration hat Vorrang vor kosmetischem Verschieben.

## Sicherheitsgrenzen

### Öffentlicher Next.js-Client

Der Browser darf ausschließlich öffentliche Konfiguration erhalten. Variablen mit `NEXT_PUBLIC_` dürfen niemals Stripe-Secrets, Datenbankzugänge, Admin-Schlüssel, Lizenzcodes oder Signierschlüssel enthalten.

### Backend

Folgende Aufgaben bleiben ausschließlich serverseitig:

- Stripe Checkout Sessions erzeugen;
- Stripe Customer Portal Sessions erzeugen;
- Stripe-Webhook-Signaturen prüfen;
- Lizenzcodes erzeugen und hashen;
- Installationsgeheimnisse prüfen;
- Entitlements signieren;
- manuelle Lizenzen vergeben, verlängern oder sperren;
- Admin-Aktionen protokollieren.

### Admin-Authentifizierung

Das Admin-Dashboard erhält ein separates Login. Das bestehende Streaming-Dashboard-Passwort darf dafür nicht verwendet werden.

Vorgaben:

- Anmeldung über OIDC oder einen vorgeschalteten Access-Provider;
- Zugriff nur für erlaubte, stabile Account-IDs;
- serverseitige Session;
- Cookies mit `HttpOnly`, `Secure` und `SameSite=Strict`;
- CSRF-Schutz für verändernde Aktionen;
- kurze Sitzungsdauer und kontrolliertes Logout;
- Rate-Limiting für Login und Admin-API;
- Audit-Eintrag für jede Lizenzänderung;
- keine Aktivierungscodes, E-Mail-Adressen oder Secrets in Logs.

Next.js authentifiziert den Administrator. Der Lizenzserver autorisiert Admin-Anfragen zusätzlich über einen kurzlebigen, signierten internen Nachweis. Die bloße Erreichbarkeit eines Backend-Endpunkts darf niemals Admin-Rechte verleihen.

## Kunden- und Lizenzfluss

Ein allgemeines FlagCount-Konto bleibt für den ersten kommerziellen Release unnötig.

```text
Stripe Checkout
  -> verifizierter Stripe-Webhook
  -> interne FlagCount-Lizenz
  -> Aktivierungscode per E-Mail
  -> Aktivierung in der Desktop-App
  -> gerätegebundenes Installationsgeheimnis
  -> signiertes Offline-Entitlement
```

Das Stripe Customer Portal übernimmt Rechnungen, Zahlungsmethoden und Kündigungen. Next.js stellt nur den Einstieg und die Rückkehrseiten bereit. Billing-Status wird ausschließlich durch verifizierte Stripe-Ereignisse und serverseitige Stripe-Abfragen geändert.

## Deployment

Empfohlen werden mindestens zwei getrennte Container:

```text
flagcount-web
  Next.js
  interner Port 3000

flagcount-server
  Stripe, Lizenzen, PostgreSQL-Zugriff, Relay und SSE
  interner Port 3010
```

Davor läuft Caddy, nginx oder ein vergleichbarer Reverse Proxy. Nur der Proxy ist öffentlich erreichbar. PostgreSQL bleibt ausschließlich im privaten Netz.

Anforderungen:

- getrennte Healthchecks für Web und Backend;
- Backend-Readiness prüft notwendige Abhängigkeiten;
- `X-Forwarded-*`-Header nur von vertrauenswürdigem Proxy akzeptieren;
- SSE-Buffering deaktivieren;
- Request-Größen und Timeouts pro Routengruppe begrenzen;
- Next.js- und Backend-Secrets getrennt konfigurieren;
- ein Ausfall von Next.js darf aktive Overlays und Lizenz-Refresh nicht unnötig beeinträchtigen.

## Migrationsphasen

### Phase 0 – Bestand stabilisieren

- Laufende Stripe- und Admin-Service-Arbeiten abschließen oder sauber abgrenzen.
- Aktuelle Tests und Builds vollständig grün halten.
- Bestehende Browserrouten und API-Verträge dokumentieren.
- Für jede Route festlegen, ob Next.js oder das Backend verantwortlich ist.
- Keine gleichzeitige fachliche Neuentwicklung und Frameworkmigration in derselben Änderung vermischen.

Abnahme:

- sauberer oder nachvollziehbar aufgeteilter Arbeitsbaum;
- dokumentierte Routing-Matrix;
- bestehende Desktop-, Web-, Server- und Rust-Tests grün.

### Phase 1 – Next.js-Grundgerüst

- Next.js mit App Router und TypeScript unter `apps/web` anlegen.
- React-Version und gemeinsame TypeScript-Einstellungen abstimmen.
- Produktionsausgabe für selbst gehosteten Node-Betrieb konfigurieren.
- bestehende Farben, Schriften und Basisstyles übernehmen;
- API-Basis-URL nur serverseitig bzw. als relative Same-Origin-URL verwenden;
- ESLint, Typecheck, Tests und Build in die bestehenden Skripte integrieren;
- separaten Docker-Build für `flagcount-web` ergänzen.

Abnahme:

- `/` liefert eine minimale Next.js-Seite;
- Produktions-Build läuft reproduzierbar im Container;
- keine geheimen Umgebungsvariablen erscheinen im Client-Bundle;
- Desktop-Build bleibt unverändert funktionsfähig.

### Phase 2 – Öffentliche Seiten migrieren

Migration in dieser Reihenfolge:

1. Landingpage;
2. Pro- und Preisseite;
3. Checkout-Erfolgsseite;
4. Downloadseite;
5. Lizenzwiederherstellung;
6. Impressum, Datenschutz und AGB;
7. Fehler- und 404-Seiten.

Zusätzlich:

- pro Route Titel und Beschreibung setzen;
- Canonical URLs definieren;
- Open-Graph-Daten ergänzen;
- `sitemap.xml` und `robots.txt` erzeugen;
- öffentliche Seiten standardmäßig statisch rendern;
- interaktive Checkout-Formulare als kleine Client-Komponenten kapseln;
- keine abrechnungsrelevanten Preise als alleinige Wahrheit fest codieren.

Abnahme:

- direkte Seitenaufrufe funktionieren ohne Client-Router-Fallback;
- öffentliche Inhalte stehen bereits im ausgelieferten HTML;
- Checkout öffnet ausschließlich eine vom Backend erzeugte Stripe-URL;
- alle bisherigen öffentlichen Links funktionieren weiter.

### Phase 3 – Reverse Proxy und Same-Origin-Betrieb

- lokale Entwicklungsroute für Next.js und Backend einrichten;
- Produktions-Proxy anhand der Zielrouting-Tabelle konfigurieren;
- API, Cookies und SSE unter derselben öffentlichen Origin testen;
- Weiterleitungen von bisherigen URLs ergänzen;
- Sicherheitsheader für beide Dienste definieren;
- CSP getrennt für Website, Admin und Overlays behandeln.

Abnahme:

- keine unnötige CORS-Freigabe erforderlich;
- SSE bleibt dauerhaft verbunden;
- Stripe-Webhooks erreichen unverändert den Backenddienst;
- Overlay-Routen liefern keine Next.js-Fehlerseite.

### Phase 4 – Stripe-Flows integrieren

- Checkout-Aufruf in die Next.js-Pro-Seite integrieren;
- Erfolgsseite gegen manipulierte oder fehlende Session-IDs absichern;
- Lizenzwiederherstellung mit neutraler Antwort umsetzen;
- Einstieg in das Stripe Customer Portal anbinden;
- Lade-, Wiederholungs- und Fehlerzustände gestalten;
- Sandbox-/Test-Mode vollständig durchspielen.

Die Erfolgsseite darf keine Lizenz allein aufgrund eines Query-Parameters freischalten. Aktivierung erfolgt ausschließlich nach serverseitig bestätigtem Stripe-Status.

Abnahme:

- monatlicher und jährlicher Testkauf funktionieren;
- doppelte oder verspätete Webhooks bleiben idempotent;
- abgebrochener Checkout erzeugt keine Lizenz;
- Portal-URLs sind kurzlebig und werden nicht gespeichert;
- Recovery verrät nicht, ob eine E-Mail bekannt ist.

### Phase 5 – Admin-Login

- Auth-Provider auswählen und dokumentieren;
- `/admin/login`, Callback und Logout implementieren;
- geschütztes Admin-Layout anlegen;
- Admin-Allowlist anhand stabiler Provider-IDs umsetzen;
- interne Autorisierung zwischen Next.js und Backend implementieren;
- Sessionablauf und entzogenes Admin-Recht testen.

Abnahme:

- nicht angemeldete Nutzer erhalten keinen Admin-Inhalt;
- normale Dashboard-Sessions verleihen keine Admin-Rechte;
- direkte Admin-API-Aufrufe ohne Nachweis werden abgelehnt;
- Login, Logout und Sessionablauf sind getestet.

### Phase 6 – Admin-Dashboard

Mindestumfang:

- Lizenzübersicht mit Filter und Pagination;
- Lizenzdetailseite;
- Stripe-Status und interne Lizenzquelle sichtbar machen;
- aktive und deaktivierte Installationen anzeigen;
- einzelne Installation deaktivieren;
- Aktivierungscode neu ausstellen und optional versenden;
- manuelle Test-, Support- oder Creator-Lizenz mit Ablaufdatum vergeben;
- manuelle Lizenz verlängern, sperren oder wiederherstellen;
- Audit-Protokoll anzeigen;
- Stripe-Datensatz über sicheren externen Link öffnen.

Grenzen:

- bezahlte Laufzeit, Preis und Zahlungsstatus werden nicht lokal überschrieben;
- Refunds, Kündigungen und Zahlungsänderungen erfolgen über Stripe;
- Codes werden nur einmal im Klartext angezeigt;
- Freitextnotizen erscheinen niemals in Telemetrie oder allgemeinen Logs.

Abnahme:

- alle verändernden Aktionen benötigen Bestätigung;
- alle Aktionen erzeugen einen Audit-Eintrag;
- parallele Geräteaktivierungen können das Limit nicht überschreiten;
- manuelle und Stripe-Lizenzen sind eindeutig unterscheidbar.

### Phase 7 – Browser-Dashboard migrieren

- bestehendes `WebApp` zunächst als Client-Komponente einbinden;
- bestehende Dashboard-Komponenten mit der Tauri-App teilen;
- Sessionprüfung in die Next.js-Routengrenze integrieren;
- EventSource/SSE ausschließlich im Client öffnen;
- Abmelden und Sessionablauf erhalten;
- bestehende Bedien- und Barrierefreiheitstests übernehmen.

Das Dashboard wird nicht unnötig in Server Components zerlegt. Zustandsreiche Streamsteuerung bleibt Clientcode.

Abnahme:

- Live-Zähler und Overlay aktualisieren ohne Seitenreload;
- abgelaufene Session trennt geschützte Datenströme;
- OBS-Overlays funktionieren unabhängig vom Dashboard;
- Desktop- und Browser-Dashboard verwenden weiterhin dieselben fachlichen Komponenten.

### Phase 8 – Alte Vite-Webauslieferung entfernen

Erst nach vollständiger Migration:

- manuelle Pfadumschaltung in `src/web/main.tsx` entfernen;
- `APP_ROUTES`-Fallback aus dem Backend entfernen;
- `vite.web.config.ts` und `web.html` entfernen, sofern nicht mehr verwendet;
- statische Website-Auslieferung aus dem Backend entfernen;
- alten Web-Build aus Dockerfile und Skripten entfernen;
- Weiterleitungen für alte URLs beibehalten;
- nicht mehr benötigte Abhängigkeiten entfernen.

Abnahme:

- Repository enthält nur einen produktiven Browser-Frontend-Build;
- Backend bedient ausschließlich API-, Overlay-, Relay- und Betriebsrouten;
- keine alte Route liefert versehentlich das frühere SPA-Dokument.

### Phase 9 – Struktur optional konsolidieren

Erst nach der funktionalen Migration dürfen Verzeichnisse zu `apps/`, `services/` und `packages/` verschoben werden. Dieser Schritt erfolgt mechanisch und ohne fachliche Änderungen.

Abnahme:

- Importgrenzen sind nachvollziehbar;
- gemeinsame Pakete haben keine Abhängigkeit auf Next.js oder Tauri;
- Build- und Testzeiten verschlechtern sich nicht wesentlich.

## Teststrategie

### Unit- und Komponententests

- öffentliche Seiten und Metadaten;
- Checkout-, Recovery- und Portalzustände;
- Admin-Guards und Sessionablauf;
- Lizenzliste, Detailansicht und Bestätigungsdialoge;
- Client-Komponenten ohne Zugriff auf Server-Secrets;
- bestehende Dashboard-Komponenten unverändert weiterverwenden.

### Integrationstests

- Next.js zu Backend über Same-Origin-Proxy;
- Stripe Checkout zu Webhook zu Aktivierungsmail;
- Admin-Aktion zu Datenbank zu Audit-Log;
- Browser-Dashboard zu SSE;
- Overlay-SSE durch den Reverse Proxy;
- nicht autorisierte Zugriffe auf Admin-API;
- Verhalten bei nicht verfügbarem Next.js-Frontend oder Backend.

### Releaseprüfung

Mindestens:

```powershell
npm run version:check
npm run typecheck
npm test
npm run test:rust
npm run build
npm run build:web
npm run build:server
```

Während der Übergangszeit kommt der Next.js-Produktions-Build hinzu. Nach Entfernung des alten Vite-Webclients wird `build:web` auf den Next.js-Build umgestellt.

Zusätzlich müssen ein echter Stripe-Testkauf, Kündigung zum Periodenende, fehlgeschlagene Zahlung, Refund, Dispute, Lizenzwiederherstellung und Gerätewechsel geprüft werden.

## Rollback

Während der Migration wurde routeweise ausgeliefert. Seit Abschluss von Phase 8 existiert die alte Vite-Webanwendung nicht mehr; ein Rollback erfolgt deshalb auf den vorherigen gemeinsam getesteten Container-Stand.

Regeln:

- Web- und Backend-Container immer mit demselben getesteten Release-Tag ausliefern;
- Datenbankmigrationen ausschließlich vorwärtskompatibel gestalten;
- Next.js darf keine alleinige Billing- oder Lizenzwahrheit speichern;
- Backend-APIs während der Migration kompatibel halten;
- jeder Migrationsschritt erhält einen eigenständigen Commit;
- bei Problemen werden Web- und Backend-Container gemeinsam auf den vorherigen Release-Tag zurückgesetzt, nicht die Lizenzdatenbank.

## Hauptrisiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
| --- | --- |
| Frameworkwechsel kollidiert mit Stripe-/Admin-Arbeit | Bestand zuerst stabilisieren, kleine getrennte Commits |
| Server-Secrets landen im Browser | klare Module, Bundle-Prüfung, keine geheimen `NEXT_PUBLIC_`-Variablen |
| SSE wird gepuffert oder getrennt | Proxy-Buffering deaktivieren, Langzeittest |
| Admin-UI schützt nur optisch | Backend autorisiert jede Admin-Anfrage separat |
| zwei Frontends driften auseinander | gemeinsame Komponenten und Typen weiterverwenden |
| SEO-Migration ändert URLs | Canonicals und dauerhafte Redirects |
| Next.js-Ausfall beeinträchtigt Overlays | getrennte Prozesse und Proxy-Routen |
| einmaliger Big-Bang-Umbau | routeweise Migration mit Rollback |

## Definition of Done

Die Next.js-Migration ist abgeschlossen, wenn:

- alle öffentlichen Website-Routen von Next.js ausgeliefert werden;
- das Admin-Dashboard separat und sicher authentifiziert ist;
- der vollständige Lizenzverwaltungsfluss über die Admin-API funktioniert;
- das Browser-Dashboard unter Next.js läuft;
- Stripe Checkout, Webhooks und Customer Portal weiterhin ausschließlich über den Backenddienst abgesichert sind;
- Overlay- und SSE-Routen unverändert stabil funktionieren;
- die Tauri-App weiterhin mit Vite gebaut wird;
- der alte Vite-Webclient und seine manuelle Routenumschaltung entfernt sind;
- Desktop-, Web-, Backend-, Stripe-, Lizenz- und Rust-Tests grün sind;
- Deployment, Monitoring, Backup und Rollback dokumentiert und getestet sind.

## Empfohlene Commitfolge

```text
chore(web): scaffold nextjs application
feat(web): migrate public pages to nextjs
chore(hosting): route nextjs and backend through reverse proxy
feat(web): integrate stripe customer flows
feat(admin): add secure administrator authentication
feat(admin): add license management dashboard
feat(web): migrate browser dashboard to nextjs
refactor(web): remove legacy vite web application
chore(repo): consolidate application packages
```

Jeder Commit muss einzeln baubar und testbar bleiben. Bereits vorhandene, nicht zugehörige Änderungen dürfen nicht mit aufgenommen werden.
