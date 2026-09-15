# Audience Live – Live-Ansicht mit Szenen: Umsetzungsplan

## Auftrag

Streamer sollen in der App sehen, was am Ende im LIVE angezeigt wird, und ohne OBS anzufassen umschalten können. In einer Szene sollen beliebige Elemente gemeinsam erscheinen – eine Abstimmung und das Emoji-Ziel (🚩 37/50), mehrere Abstimmungen, dasselbe Element zweimal (zum Beispiel groß und klein) und ein Element in mehreren Szenen.

Entscheidungen des Nutzers:

- **Eine feste Live-URL.** OBS bzw. TikTok LIVE Studio bekommt einmal `/overlay/live`. Welche Szene dort läuft, wird in der App umgeschaltet.
- **Mehrfach anzeigen** in allen vier Varianten: mehrere Elemente, mehrere Abstimmungen, gleiches Element zweimal, Element in mehreren Szenen.
- **Anordnung über Layout-Vorlagen:** untereinander, nebeneinander, Raster; Position im 3 × 3-Raster; Größe. Keine freie Drag-&-Drop-Positionierung.
- **Neue Seite „Live-Ansicht“** in der Navigationsgruppe *Stream* direkt unter *Übersicht*.

## Analyse des Ist-Zustands

Vorhanden (aus `docs/OVERLAY_COMPOSER_PLAN.md` umgesetzt):

- `OverlayView` im Profil (`shared/profiles.ts`, `src-tauri/src/settings.rs`) mit `counterIds`, `layout`, `gap`, `horizontalAlign`, `verticalAlign`, `scale`; höchstens `MAX_OVERLAY_VIEWS = 4`.
- Tauri-Befehle `create/update/delete/duplicate_overlay_view` (`src-tauri/src/overlay_views.rs`).
- Sidecar liefert `/overlay/view/<id>`, `/overlay/all`, `/overlay/counter/<id>` (`sidecar/src/server/overlayRoutes.ts`, `SidecarApp.getBoard`), das Relay veröffentlicht jede erlaubte Scope automatisch (`sidecar/src/relay/boardRelay.ts` über `getBoardScopes`).
- UI: `OverlayComposer` als Formular-Dialog auf der Overlays-Seite.

Lücken:

1. **Keine Live-Vorschau.** Der Composer hat keine Vorschau; niemand sieht vor dem Speichern, wie die Szene auf 1280 × 720 aussieht.
2. **Umschalten nur in OBS.** Jede Ansicht hat eine eigene URL; ein Wechsel im Stream heißt Quelle in OBS tauschen.
3. **Gleiches Element zweimal ist verboten.** TS (`parseOverlayView`: `new Set(ids).size === ids.length`) und Rust (`OverlayView::validated`: `has_unique`) lehnen doppelte Counter-IDs ab. Das Board-Rendering ist nach `counterId` aufgebaut.
4. **Emoji-Ziel wird nicht korrekt gezeigt.** Das klassische Overlay (`overlayAssets.ts`) zeigt fest `🚩`, unabhängig vom Auslöser; die Board-Karten (`boardAssets.ts`) zeigen gar kein Emoji.
5. **Größe stimmt nicht mit der Erwartung überein.** `BOARD_SCRIPT.fit()` skaliert den Inhalt immer auf 92 % der Browser-Source. Ein einzelnes Element wird riesig, eine Szene mit „Größe 50 %“ füllt trotzdem das halbe Bild – Vorschau und Erwartung passen nicht zusammen.
6. **Verwirrende Bedienung.** Eine Ansichts-Karte öffnet sofort den Bearbeiten-Dialog; Ansehen, Bearbeiten und Live-Schalten sind nicht getrennt.
7. Das Web-Dashboard (`sidecar/src/web/settingsStore.ts`) kennt keine Ansichten – die Live-Ansicht ist zunächst Desktop-only.

## Begriffe

- **Element:** Zähler oder Abstimmung aus *Zähler & Abstimmungen*.
- **Szene:** gespeicherte Zusammenstellung (bisher „Overlay-Ansicht“). Enthält **Einträge**.
- **Eintrag:** ein Element in einer Szene mit eigener Größe. Dasselbe Element darf mehrfach als Eintrag vorkommen.
- **Live-Szene:** die Szene, die gerade unter `/overlay/live` läuft.
- **Automatisch:** eingebaute Szene mit allen laufenden Elementen (heutiges `all`).

Die UI spricht von „Szene“ (vertraut aus OBS). URLs (`/overlay/view/<id>`) und Datenfeldnamen bleiben kompatibel.

## Oberfläche: Seite „Live-Ansicht“

```text
┌ Live-Ansicht ─────────────────────────────────────────────────────────┐
│ Live-URL  [http://127.0.0.1:3847/overlay/live] [Kopieren]  Online: […] │
├───────────────────────────────────────────────┬───────────────────────┤
│ BÜHNE (16:9, echte Overlay-Darstellung)        │ SZENE BEARBEITEN      │
│ ┌───────────────────────────────────────────┐ │ Name [Hauptszene]     │
│ │         [Abstimmung]   [🚩 37 / 50]        │ │ Einträge              │
│ └───────────────────────────────────────────┘ │  Team-Wahl   ━●━ 100% ↑↓✕│
│ ● LIVE · Hauptszene     [Overlay ausblenden]   │  Rote Flaggen ━●━ 60% ↑↓✕│
│  – oder –                                      │  [+ Element hinzufügen ▾] │
│ ○ Vorschau · Nur Abstimmung   [Live schalten]  │ Layout [Unter|Neben|Raster]│
├───────────────────────────────────────────────┤ Position ↖ ↑ ↗ / ← ● → / ↙ ↓ ↘│
│ SZENEN                                         │ Größe ━━━●━━ 70 %      │
│ [Automatisch] [Hauptszene ●LIVE] [Nur Abst.]   │ Abstand ━●━━━          │
│ [Nur Flaggen] [+ Neue Szene]                   │ [Verwerfen] [Speichern]│
└───────────────────────────────────────────────┴───────────────────────┘
```

- **Bühne:** zeigt die ausgewählte Szene genau so, wie sie auf 1280 × 720 im Stream erscheint – mit derselben Rendering-Logik wie das Overlay, inklusive ungespeicherter Änderungen.
- **Status der Bühne:** Ist die ausgewählte Szene live, steht dort `● LIVE` (Cyan) und `Overlay ausblenden`/`einblenden`. Sonst `Vorschau` und die Primäraktion **Live schalten**.
- **Szenen-Leiste:** Karten für *Automatisch*, eigene Szenen und `+ Neue Szene`. Jede Karte: Name, Anzahl Einträge, Live-Markierung, Ein-Klick-Button **Live**. Auswahl (Bearbeiten/Vorschau) und Live-Schalten sind getrennte Aktionen.
- **Szenen-Editor:** Einträge hinzufügen über ein Menü mit allen Elementen des Profils – dasselbe Element darf erneut gewählt werden. Pro Eintrag Größe, Reihenfolge, Entfernen. Dazu Layout, Position (3 × 3), Gesamtgröße, Abstand. Explizites Speichern; ist die Szene live, warnt ein Hinweis „Änderungen erscheinen nach dem Speichern sofort im Stream“.
- **Einrichtung:** Kurzanleitung „Live-URL einmal in OBS/TikTok LIVE Studio als Browserquelle 1280 × 720 hinzufügen“ – wiederverwendet aus `OverlaySetupGuide`.
- **Übersicht:** kleine Karte „Im Live: Hauptszene“ mit Szenen-Auswahl und Ausblenden, damit man während des Streams nicht die Seite wechseln muss (Phase 6).
- **Overlays-Seite:** bleibt für Design je Element und Einzel-URLs. Der Bereich „Gemeinsame Ansichten“ wird zu einem Verweis „Szenen in der Live-Ansicht verwalten“; `OverlayComposer` entfällt.

Free: Live-Ansicht sichtbar, Live-URL zeigt das Free-Element; Szenen, mehrere Einträge und Umschalten mit `ProHint` erklärt.

## Datenmodell (Schema 5)

```ts
export const MAX_SCENE_ITEMS = 6;
export const MIN_SCENE_ITEM_SCALE = 40;
export const MAX_SCENE_ITEM_SCALE = 160;

type OverlaySceneItem = {
  id: string;          // stabil, URL-sicher; unterscheidet doppelte Elemente
  counterId: string;   // darf innerhalb einer Szene mehrfach vorkommen
  scale: number;       // Größe dieses Eintrags in %
};

type OverlayView = {   // UI-Name: Szene
  id: string;
  name: string;
  items: OverlaySceneItem[];   // ersetzt counterIds
  layout: OverlayLayout;
  gap: number;
  horizontalAlign: OverlayAlignment;
  verticalAlign: OverlayAlignment;
  scale: number;       // Gesamtgröße relativ zu 1280 × 720
  createdAt: string;
  updatedAt: string;
};

type StreamProfile = {
  // …
  overlayViews: OverlayView[];
  /** Szene unter /overlay/live: 'all' (Automatisch) oder eine View-ID. */
  liveSceneId: string;
  /** Blendet das Live-Overlay aus, ohne die Szene zu vergessen. */
  liveHidden: boolean;
};
```

Regeln:

- Migration 4 → 5 in TS **und** Rust: `counterIds` → `items` mit IDs `<viewId>-<index>` und `scale: 100`; `liveSceneId: 'all'`, `liveHidden: false`. Backup `settings.v4.backup.json` wie bei früheren Migrationen.
- `items`: 1 bis `MAX_SCENE_ITEMS`, eindeutige Item-IDs, jede `counterId` existiert im Profil; doppelte `counterId` erlaubt.
- Löschen eines Elements entfernt seine Einträge aus allen Szenen; eine leere Szene wird gelöscht, und zeigt `liveSceneId` darauf, fällt sie auf `'all'` zurück (Tests).
- `MAX_OVERLAY_VIEWS` wird auf 8 angehoben und als Tariflimit `scenes` in `shared/entitlements.ts` (Free 0, Pro 8) geführt; zusätzlich `sceneItems` (Free 1, Pro 6). Keine Zahlen in React oder Routen.
- Downgrade löscht nichts; Szenen sind pausiert, `/overlay/live` zeigt das Free-Element.

## Backend

### Rust (`src-tauri`)

- `settings.rs`: Structs, Validierung und Migration auf Schema 5 spiegeln.
- `overlay_views.rs`: Create/Update/Duplicate mit `items`; Limits über Entitlements.
- Neue Befehle `set_live_scene(scene_id)` und `set_live_hidden(hidden)` in `commands.rs`, `lib.rs` (`generate_handler!`), `permissions/autogenerated/*.toml` und `capabilities/default.json` (fehlende Freigaben waren bereits Ursache von 0.7.1 – Test in `tests/ipc_commands.rs`).
- `sidecar.rs`: `ConfigureCounters` sendet `liveSceneId` und `liveHidden` (optional für Abwärtskompatibilität).

### Sidecar

- `protocol.ts`: `configureCounters` akzeptiert `liveSceneId`/`liveHidden`; unbekannte Szene → `'all'`.
- `SidecarApp.getBoard`:
  - Scope `live` löst auf die Live-Szene auf; `liveHidden` liefert `{ status: 'ok', counters: [] }` (transparent, SSE bleibt offen).
  - Szenen liefern Einträge statt eindeutiger Counter: `CounterView` erhält `itemId` und `itemScale`.
  - Free: `live` zeigt das erste erlaubte Element.
- `overlayRoutes.ts`: `BOARD_PATH` um `live` erweitern; `boardOverlayPath('live')` → `/overlay/live`.
- `getBoardScopes` enthält `live` → das Relay erzeugt automatisch eine stabile Online-Live-URL (`boardChannelKey(masterKey, 'live')`).
- `shared/overlayBoard.ts`: `parseCounterViews` akzeptiert bis `MAX_SCENE_ITEMS` Einträge und doppelte `counterId`.

### Rendering (`sidecar/src/overlay/boardAssets.ts`)

- **Größe relativ zu 1280 × 720 statt „auf 92 % aufblasen“:** Die Referenzfläche ist 1280 × 720; `scale` und `itemScale` beziehen sich darauf; nur wenn der Inhalt nicht passt, wird verkleinert. Die Vorschau entspricht damit dem Stream.
- **Emoji-Ziel:** Einfache Zähler zeigen das erste Emoji ihrer Auslöser (Fallback ohne Emoji: kein Icon) vor der Zahl, inklusive der bestehenden `flagAnimation` des Designs. Der Emoji-Text kommt aus `CounterView` (neues Feld `icon`), wird nur per `textContent` geschrieben.
- Szenenwechsel blendet weich über (200 ms, `prefers-reduced-motion` ohne Animation).
- **Vorschaumodus für ungespeicherte Änderungen:** Route `/overlay/preview` rendert dieselbe Board-Logik ohne eigene Daten und nimmt Szenen per `postMessage` nur vom App-Ursprung (`tauri://localhost`, `http://tauri.localhost`) entgegen. CSP bleibt ohne Inline-Skripte. So nutzt die Bühne exakt den Overlay-Renderer.

## Frontend

- `navigation.ts`: `PageId` `stage`, Label „Live-Ansicht“, Gruppe *Stream* nach `live`. `WEB_PAGES` unverändert.
- Neue Seite `src/pages/LiveViewPage.tsx` mit Komponenten in `src/live-view/`:
  - `LiveStage.tsx` – 16:9-iframe auf `/overlay/preview`, sendet Szene + aktuelle Zählerstände per `postMessage`; Status LIVE/Vorschau, Live schalten, Ausblenden.
  - `SceneStrip.tsx` – Szenen-Karten mit Live-Markierung und Ein-Klick-Live.
  - `SceneEditor.tsx` – Einträge (Hinzufügen-Menü, Größe, ↑↓, Entfernen), Layout, 3 × 3-Position, Größe, Abstand; Draft/Dirty/Speichern mit `onUnsavedChanges`.
  - `LiveUrlField.tsx` – nutzt `OverlayUrlField`.
- `overlayTargets.ts`: Ziel `live` ergänzen (lokale und Online-URL).
- API durch alle Schichten: `setLiveScene`, `setLiveHidden` in `FlagCountApi`, `flagcount.ts`, `useFlagCount`, `createActions`-Fixture.
- `OverlaysPage.tsx`: Gemeinsame Ansichten durch Verweis ersetzen, `OverlayComposer` entfernen.
- `LivePage.tsx` (Übersicht): Karte „Im Live“ mit Szenen-Select und Ausblenden (Phase 6).

## Umsetzungsphasen und Commits

| Phase | Inhalt | Commit |
| --- | --- | --- |
| 0 | Tests für heutiges `view`/`all`-Verhalten und Migration 4 → 5 (zuerst rot) | `test(scenes): capture view behavior and schema 5 migration` |
| 1 | Shared-Modell: `items`, `liveSceneId`, `liveHidden`, Limits `scenes`/`sceneItems`, Migration TS | `feat(scenes): scene items, live scene and schema 5 in shared model` |
| 2 | Rust: Settings, Migration, View-CRUD mit Items, `set_live_scene`/`set_live_hidden` inkl. Permissions | `feat(tauri): persist scenes and switch the live scene` |
| 3 | Sidecar: Protokoll, `getBoard('live')`, Einträge, Route `/overlay/live`, Relay-Scope | `feat(sidecar): serve the live scene at /overlay/live` |
| 4 | Rendering: Referenzgröße 1280 × 720, Emoji-Icon, Item-Größe, Überblendung, `/overlay/preview` | `feat(overlay): render scenes at stream size with emoji goals` |
| 5 | Seite „Live-Ansicht“: Bühne, Szenen, Editor, Live-URL; Overlays-Seite aufräumen | `feat(app): live view page with stage and scene switching` |
| 6 | Übersicht-Karte „Im Live“, Doku (README, APP_WORKFLOWS, CHANGELOG) | `feat(app): switch the live scene from the overview` · `docs: document the live view` |

Nach jedem Commit `npm run typecheck`, betroffene Tests; nach Phase 2 zusätzlich `npm run test:rust`.

## Tests

**Modell / Migration**
- Schema 4 wird zu 5: `counterIds` → `items` mit Scale 100, `liveSceneId: 'all'`, `liveHidden: false` – TS und Rust mit identischem Fixture.
- Doppelte `counterId` in einer Szene erlaubt; doppelte Item-IDs, unbekannte Counter, > 6 Einträge, ungültige Größen abgelehnt.
- Element löschen entfernt Einträge; leere Live-Szene fällt auf `'all'` zurück.

**Sidecar / Routen**
- `/overlay/live` zeigt die Live-Szene; `set_live_scene` pusht per SSE die neue Szene ohne neue Verbindung.
- `liveHidden` liefert leeres, transparentes Board.
- Gleiches Element zweimal erscheint zweimal mit unterschiedlicher Größe und gleichem Zählerstand.
- Free: `/overlay/live` zeigt nur das Free-Element; Szenen per URL nicht umgehbar.
- Relay veröffentlicht `live`; URL bleibt beim Umschalten gleich.

**Rendering**
- Ein Element mit Größe 50 % belegt etwa die Hälfte der Referenzbreite, nicht das ganze Bild.
- Einfacher Zähler zeigt sein Emoji (z. B. 🔥 statt fest 🚩).
- Abstimmung + Emoji-Ziel, zwei Abstimmungen, vier Einträge im Raster passen in 1280 × 720.
- `/overlay/preview` ignoriert `postMessage` fremder Ursprünge.

**UI**
- Szene anlegen, Element zweimal hinzufügen, Größe ändern, speichern.
- „Live schalten“ ruft `set_live_scene`; Karte zeigt `LIVE`.
- Ungespeicherte Änderungen: Bühne zeigt Draft, Verlassen fragt nach.
- Barrierefreiheit: `accessibility.test.tsx` um Live-Ansicht erweitern; Szenen-Karten per Tastatur schaltbar.

## Manuelle Abnahme

1. Elemente „Rote Flaggen“ (Ziel 50) und „Team-Wahl“ anlegen.
2. Live-Ansicht öffnen, Live-URL in OBS als Browserquelle 1280 × 720 einfügen.
3. Szene „Hauptszene“: Team-Wahl + Rote Flaggen nebeneinander, unten zentriert, 70 %.
4. Bühne mit OBS-Bild vergleichen – identisch.
5. Szene „Doppelt“: Rote Flaggen groß und klein; beide zählen gleichzeitig.
6. Zwischen Szenen umschalten – OBS wechselt ohne Neuladen der Quelle.
7. Overlay ausblenden und wieder einblenden.
8. Online-Live-URL in TikTok LIVE Studio prüfen.
9. App neu starten – Szenen und Live-Szene bleiben erhalten.
10. Pro deaktivieren – Szenen pausiert, Live-URL zeigt Free-Element; Pro aktivieren – alles wieder da.

## Offene Punkte

- Mehrere Abstimmungen mit gleichen Chat-Auslösern zählen dieselbe Nachricht in beiden Abstimmungen. Das ist technisch korrekt; der Editor sollte beim Hinzufügen darauf hinweisen.
- Tastenkürzel für Szenenwechsel (z. B. `Strg+1…8`) sind sinnvoll, aber nicht Teil dieses Plans.
