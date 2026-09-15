# Audience Live Desktop – Abläufe, Zustände und Abnahme

Dieses Dokument beschreibt die neu gestaltete Desktop-App unter `src/`: wo welche Funktion liegt, wie Free, Pro und Lizenzprobleme dargestellt werden und welche Abläufe vor einem Release manuell geprüft werden. Die Bedienung für Streamer steht im [README](../README.md).

## Navigation

| Bereich | Inhalt | Primäraktion |
| --- | --- | --- |
| Übersicht | Einrichtungs-Checkliste (TikTok verbunden, Profil, Element, Overlay, Lizenzstatus); für wiederkehrende Streamer laufende Runden und Schnellaktionen | Verbinden |
| Live-Steuerung | Verbindung, aktives Profil mit Wechsel, alle laufenden Elemente, manuelle Stimmen, Ziele, Reset je Element und für alle | Live-Aktion |
| Zähler & Abstimmungen | Liste und Detailansicht der Elemente des laufenden Profils, Assistent „Neues Element“ | Neues Element |
| Overlays | Overlay je Element und Gesamtansicht, Design, URLs, Einrichtungsanleitung | Overlay einrichten |
| Profile | Profile anlegen, wechseln, umbenennen, duplizieren, löschen | Neues Profil |
| Historie | Kennzahlen, Filter, Details, CSV-Export, Löschen | Exportieren |
| Lizenz & Konto | Status, freigeschaltete Funktionen, Grenzen, Aktivierung, Abo, Support | Lizenz verwalten |
| Einstellungen | Version, Updateprüfung, Support | Nach Updates suchen |

Callouts führen direkt an die passende Stelle, zum Beispiel „Abstimmung erstellen“ in den Assistenten oder „Overlay öffnen“ zum Overlay eines Elements. Das Browser-Dashboard zeigt bewusst nur Live-Steuerung, Overlays und Einstellungen und gestaltet nur das Overlay des ersten Elements.

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

Designs werden mit `set_counter_overlay_settings(counterId, overlay)` genau für das gewählte Element gespeichert. Der Befehl prüft Premium-Vorlagen und Branding wie `set_overlay_settings`, das für das Browser-Dashboard und ältere Aufrufer bestehen bleibt. Das gespeicherte Schema ändert sich nicht, eine Migration ist nicht nötig.

## Automatisierte Abdeckung

- `src/components/ui/ui.test.tsx` – Tastatur, Fokus und Rollen der UI-Primitives
- `src/app-shell/AppShell.test.tsx`, `src/pages/setupSteps.test.ts` – Navigation, Statusleiste, Einrichtung
- `src/dashboard/proDiscovery.test.tsx` – gemeldetes Auffindbarkeitsproblem und Lizenzdiagnose
- `src/counters/CreateCounterWizard.test.tsx`, `src/pages/CountersPage.test.tsx` – Assistent, Validierung, Speichern, Sortieren, Downgrade
- `src/live/liveCounters.test.ts`, `src/pages/LivePage.test.tsx` – bis zu vier Elemente, Führung, Resets, Profilwechsel
- `src/overlays/overlayTargets.test.ts`, `src/pages/OverlaysPage.test.tsx`, `src-tauri/tests/ipc_commands.rs` – URLs und Design je Element
- `src/pages/ProfilesPage.test.tsx`, `src/pages/HistoryPage.test.tsx`, `src/pages/LicensePage.test.tsx`
- `src/app-shell/accessibility.test.tsx` – Seitentitel, benannte Bedienelemente, eindeutige IDs und gültige ARIA-Verweise auf allen Seiten
- `src/workflows.test.tsx` – Free-Stream, Pro-Aktivierung bis zum eigenen Overlay, Downgrade, Profile, Historie gegen die Tauri-Mocks

## Manuelle Abnahme vor einem Release

Diese Schritte brauchen die echte App, einen TikTok-LIVE bzw. Testevents und eine echte oder lokal signierte Pro-Testlizenz. Sie sind vor dem Erhöhen der Version und dem Tag durchzuführen.

- [ ] App ohne Lizenz frisch starten; die Übersicht zeigt die Einrichtungs-Checkliste.
- [ ] Free-Zähler verbinden, Overlay-URL kopieren, in OBS einbinden und eine Runde durchführen.
- [ ] Pro-Lizenz aktivieren; Navigation und Aktionen sind ohne Neustart freigeschaltet.
- [ ] Profil „A/B Test“ erstellen und dorthin wechseln.
- [ ] Abstimmung „Welches Team?“ mit zwei Optionen und eigenen Auslösern erstellen.
- [ ] Einen zweiten parallelen Zähler erstellen.
- [ ] Für beide unterschiedliche Farben, Vorlagen und URLs konfigurieren.
- [ ] Beide Einzel-Overlays und die Gesamtansicht im Browser und in OBS prüfen.
- [ ] Stimmen manuell und über Chat bzw. Testevents auslösen.
- [ ] Einzelne und alle Runden zurücksetzen.
- [ ] Historie prüfen und CSV exportieren; die Datei enthält keine Zuschauer- oder Chatdaten.
- [ ] App neu starten; Profile, Elemente und Designs sind erhalten.
- [ ] Lizenzstatus aktualisieren und die Offline-Gnadenfrist simulieren.
- [ ] Update von der letzten stabilen Version installieren; vorhandene Profile, Overlays und Overlay-URLs funktionieren weiter.
- [ ] Fenstergrößen 1280 × 800, 1024 × 700 und 800 × 600 sowie 200 % Zoom prüfen.
