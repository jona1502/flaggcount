# Audience Live Desktop – Abläufe, Zustände und Abnahme

Dieses Dokument beschreibt die neu gestaltete Desktop-App unter `src/`: wo welche Funktion liegt, wie Free, Pro und Lizenzprobleme dargestellt werden und welche Abläufe vor einem Release manuell geprüft werden. Die Bedienung für Streamer steht im [README](../README.md).

## Navigation

| Bereich | Inhalt | Primäraktion |
| --- | --- | --- |
| Übersicht | Startseite: LIVE-Verbindung solange getrennt, offene Einrichtungsschritte (Element, Overlay, Lizenzstatus), alle laufenden Elemente, manuelle Stimmen, Ziele, Reset je Element und für alle | Verbinden, Live-Aktion |
| Live-Ansicht | Live-URL, Bühne mit echter Overlay-Darstellung, Szenen erstellen, bearbeiten, duplizieren, löschen und live schalten, Live-Overlay ausblenden | Live schalten |
| Zähler & Abstimmungen | Liste und Detailansicht der Elemente des laufenden Profils, Assistent „Neues Element“ | Neues Element |
| Overlays | Overlay je Element und Gesamtansicht, Design, URLs, Einrichtungsanleitung | Overlay einrichten |
| Profile | Profile anlegen, wechseln, umbenennen, duplizieren, löschen | Neues Profil |
| Historie | Kennzahlen, Filter, Details, CSV-Export, Löschen | Exportieren |
| Pro & Lizenz | Status, freigeschaltete Funktionen, Grenzen, Aktivierung, Abo, Support | Lizenz verwalten |
| Einstellungen | Version, Updateprüfung, Support | Nach Updates suchen |

Die Seitenleiste gruppiert die Bereiche in Stream, Einrichten und Konto. Die Kopfleiste zeigt auf jeder Seite den Verbindungsstatus mit einem Verbindungs-Drawer, das laufende Profil mit Wechsel und den Tarif.

Callouts führen direkt an die passende Stelle, zum Beispiel „Abstimmung erstellen“ in den Assistenten oder „Overlay öffnen“ zum Overlay eines Elements. Das Browser-Dashboard zeigt bewusst nur Übersicht, Overlays und Einstellungen und gestaltet nur das Overlay des ersten Elements.

## Design

Farben, Abstände und Radien kommen ausschließlich aus den Tokens in `src/components/ui/ui.css` (App und Web-Dashboard) und `src/styles.css` (Website, Web-Login, Admin). Die Markenfarben stammen aus dem Logo `assets/branding/audience-live-icon-master.png`: Indigo `#6246ea` für Primäraktionen und aktive Navigation, der Verlauf Cyan → Indigo → Violett für Logo, Fortschritt und Pro. Rot ist Fehlern und destruktiven Aktionen vorbehalten. Die Standardfarbe neuer Overlays bleibt unverändert.

## Lizenzzustände

Grundlage sind ausschließlich `entitlementsFor`, `canUse`, `limitFor`, `effectiveProfile`, `effectiveCounters` und `missingProFeatures` aus `shared/entitlements.ts`.

| Zustand | Erkennung | Darstellung | Was weiter funktioniert |
| --- | --- | --- | --- |
| Free | `plan: 'free'`, `status: 'none'` | Pro-Funktionen sichtbar mit „Pro erforderlich“ und Nutzen | Roter Flaggenzähler, lokales und Online-Overlay, Designer |
| Pro aktiv | `plan: 'pro'`, `status: 'active'` | Alle Funktionen „aktiv“, keine Kaufwerbung | Alles |
| Zahlung offen | `status: 'grace'` | „Zahlung offen“ mit Verweis auf „Abo verwalten“ | Alles |
| Offline / Aktualisierung nötig | `needsRefresh: true`, ggf. `lastError: 'network'` | „Aktualisierung nötig“, Datum „Offline gültig bis“ | Alles bis zum Ablauf der Gnadenfrist |
| Abgelaufen / nicht bestätigt | `status: 'expired'` oder `'invalid'` | Free-Modus mit Hinweis, gespeicherte Pro-Elemente „Pausiert“ | Free-Funktionen; nichts wird gelöscht |
| Gesperrt | `lastError: 'license-inactive'` | „Gesperrt“ mit Erklärung | Free-Funktionen |
| Pro ohne erwartete Funktionen | `plan: 'pro'`, `missingProFeatures(...)` nicht leer | Diagnose „Pro-Funktionen fehlen“ mit „Lizenzstatus aktualisieren“ und Support, kein Upgrade-Angebot | Alle freigegebenen Funktionen |
| Downgrade | Pro endet mit gespeicherten Pro-Profilen und -Elementen | Profile und Elemente „Pausiert“, Live-Hinweis „… läuft gerade nicht“ | Der erste Free-taugliche Zähler läuft weiter |

Nach Aktivieren oder Aktualisieren sendet das Backend den neuen Zustand; die Oberfläche schaltet ohne Neustart frei und bestätigt das mit „Pro ist freigeschaltet“.

## Overlays

| Ziel | Lokale URL | Online-URL | Design |
| --- | --- | --- | --- |
| Erstes Element, einfacher Zähler | `/overlay` (unverändert seit 0.2) | bisherige öffentliche URL | eigenes |
| Weitere Elemente und Abstimmungen | `/overlay/counter/<id>` | `counterOverlayUrls[<id>]` | eigenes |
| Gesamtansicht (Pro) | `/overlay/all` | `counterOverlayUrls.all` | festes Raster aus den Designs der Elemente |
| Live-Overlay | `/overlay/live` | `counterOverlayUrls.live` | die Szene aus `liveSceneId`, leer bei `liveHidden`, sonst die automatische Szene |
| Szene (Pro) | `/overlay/view/<id>` | `counterOverlayUrls[<id>]` | Einträge mit eigener Größe, Layout, Position; Größe bezogen auf 1280 × 720 |
| Vorschau der App | `/overlay/preview` | – | leer; die App schickt ungespeicherte Szenen per `postMessage` |

Designs werden mit `set_counter_overlay_settings(counterId, overlay)` genau für das gewählte Element gespeichert. Der Befehl prüft Premium-Vorlagen und Branding wie `set_overlay_settings`, das für das Browser-Dashboard und ältere Aufrufer bestehen bleibt. Szenen speichern seit Schema 5 Einträge (`items`) mit eigener ID und Größe, sodass dasselbe Element mehrfach vorkommen darf. Ansichten aus Schema 4 werden beim Laden zu `i-1`, `i-2`, … migriert (Backup `settings.v4.backup.json`). `set_live_scene(sceneId)` und `set_live_hidden(hidden)` steuern das Live-Overlay unter `/overlay/live`, ohne dass OBS die Quelle wechselt. Die Online-Live-URL setzt einen Web-Server voraus, der den Relay-Scope `live` kennt.

## Automatisierte Abdeckung

- `src/components/ui/ui.test.tsx` – Tastatur, Fokus und Rollen der UI-Primitives
- `src/app-shell/AppShell.test.tsx`, `src/pages/setupSteps.test.ts` – Navigation, Kopfleiste, Einrichtung in der Übersicht
- `src/dashboard/proDiscovery.test.tsx` – gemeldetes Auffindbarkeitsproblem und Lizenzdiagnose
- `src/counters/CreateCounterWizard.test.tsx`, `src/pages/CountersPage.test.tsx` – Assistent, Validierung, Speichern, Sortieren, Downgrade
- `src/live/liveCounters.test.ts`, `src/pages/LivePage.test.tsx` – bis zu vier Elemente, Führung, Resets, Profilwechsel
- `src/overlays/overlayTargets.test.ts`, `src/pages/OverlaysPage.test.tsx`, `src-tauri/tests/ipc_commands.rs` – URLs und Design je Element
- `src/pages/ProfilesPage.test.tsx`, `src/pages/HistoryPage.test.tsx`, `src/pages/LicensePage.test.tsx`
- `src/app-shell/accessibility.test.tsx` – Seitentitel, benannte Bedienelemente, eindeutige IDs und gültige ARIA-Verweise auf allen Seiten
- `src/pages/LiveViewPage.test.tsx`, `sidecar/src/app.test.ts`, `sidecar/src/overlay/boardAssets.test.ts`, `src-tauri/src/overlay_views.rs` – Szenen, Live-Umschaltung, Vorschau und Rendering
- `src/workflows.test.tsx` – Free-Stream, Pro-Aktivierung bis zum eigenen Overlay, Downgrade, Profile, Historie gegen die Tauri-Mocks

## Manuelle Abnahme vor einem Release

Diese Schritte brauchen die echte App, einen TikTok-LIVE bzw. Testevents und eine echte oder lokal signierte Pro-Testlizenz. Sie sind vor dem Erhöhen der Version und dem Tag durchzuführen.

- [ ] App ohne Lizenz frisch starten; die Übersicht zeigt die Verbindung und die offenen Einrichtungsschritte.
- [ ] Free-Zähler verbinden, Overlay-URL kopieren, in OBS einbinden und eine Runde durchführen.
- [ ] Pro-Lizenz aktivieren; Navigation und Aktionen sind ohne Neustart freigeschaltet.
- [ ] Profil „A/B Test“ erstellen und dorthin wechseln.
- [ ] Abstimmung „Welches Team?“ mit zwei Optionen und eigenen Auslösern erstellen.
- [ ] Einen zweiten parallelen Zähler erstellen.
- [ ] Für beide unterschiedliche Farben, Vorlagen und URLs konfigurieren.
- [ ] Beide Einzel-Overlays und die Gesamtansicht im Browser und in OBS prüfen.
- [ ] Live-URL einmal in OBS einrichten, Szenen „Abstimmung + Emoji-Ziel“ und „gleiches Element zweimal“ erstellen und live umschalten, ohne die OBS-Quelle zu ändern; Overlay aus- und einblenden.
- [ ] Stimmen manuell und über Chat bzw. Testevents auslösen.
- [ ] Einzelne und alle Runden zurücksetzen.
- [ ] Historie prüfen und CSV exportieren; die Datei enthält keine Zuschauer- oder Chatdaten.
- [ ] App neu starten; Profile, Elemente und Designs sind erhalten.
- [ ] Lizenzstatus aktualisieren und die Offline-Gnadenfrist simulieren.
- [ ] Update von der letzten stabilen Version installieren; vorhandene Profile, Overlays und Overlay-URLs funktionieren weiter.
- [ ] Fenstergrößen 1280 × 800, 1024 × 700 und 800 × 600 sowie 200 % Zoom prüfen.
