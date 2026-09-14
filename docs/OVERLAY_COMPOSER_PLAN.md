# FlagCount Overlay Composer – Umsetzungsplan für Claude

## Ausgangslage

Die neue Overlay-Seite zeigt aktuell pro laufendem Zähler beziehungsweise pro Abstimmung eine automatisch erzeugte Overlay-Karte sowie eine Karte `Gesamtansicht`.

Im aktuellen Stand gilt:

- Ein Einzel-Overlay gehört fest zu genau einem Counter.
- `/overlay/all` zeigt automatisch alle laufenden Counter des aktiven Profils.
- Die Gesamtansicht verwendet ein festes vertikales Layout.
- Nutzer können nicht auswählen, welche Counter in der Gesamtansicht erscheinen.
- Nutzer können nicht mehrere unterschiedliche kombinierte Overlays anlegen.
- Reihenfolge, Layout, Sichtbarkeit und Größe der Elemente sind nicht konfigurierbar.
- In der Overlay-Galerie fehlt eine klare Aktion, um eine eigene Ansicht zusammenzustellen.

Das ist für einen Stream unzureichend. Ein Nutzer muss beispielsweise nur `Rote Flaggen`, nur eine Abstimmung, beide gemeinsam oder verschiedene Zusammenstellungen für unterschiedliche Szenen in OBS anzeigen können.

## Ziel

Erweitere die Overlay-Seite um einen verständlichen Overlay-Composer. Nutzer können Overlay-Ansichten anlegen und festlegen, welche Zähler oder Abstimmungen darin angezeigt werden.

Beispiele:

- `Rote Flaggen` – ein einzelner Zähler
- `Abstimmung` – eine einzelne Abstimmung
- `Hauptszene` – rote Flaggen und Abstimmung gemeinsam
- `Alle Elemente` – automatisch alle aktiven Elemente
- `Nur Ergebnisse` – ausgewählte Elemente in kompakter Darstellung

Jede gespeicherte Ansicht erhält eine eigene stabile lokale URL. Wenn das Online-Relay verfügbar und vom Tarif erlaubt ist, erhält sie zusätzlich eine eigene öffentliche URL.

## Begriffe

Zur Vermeidung von Missverständnissen gelten folgende Begriffe:

- **Element:** ein Zähler oder eine Abstimmung aus dem aktiven Profil.
- **Einzel-Overlay:** automatisch vorhandene Ansicht für genau ein Element.
- **Overlay-Ansicht:** gespeicherte Zusammenstellung aus einem oder mehreren Elementen.
- **Automatische Gesamtansicht:** bestehende `all`-Ansicht mit allen laufenden Elementen.
- **Overlay-Composer:** Oberfläche zum Erstellen und Bearbeiten einer Overlay-Ansicht.

Ein Overlay erstellt keinen neuen Zähler. Zähler und Abstimmungen werden weiterhin unter `Zähler & Abstimmungen` angelegt. Der Composer entscheidet nur, welche vorhandenen Elemente gemeinsam dargestellt werden.

## Analyse des aktuellen Codes

Relevante Stellen:

- `src/pages/OverlaysPage.tsx` erzeugt die Galerie aus `overlayTargets(...)`.
- `src/overlays/overlayTargets.ts` bildet jeden gespeicherten Counter und genau ein festes Ziel `all` ab.
- `src/overlays/OverlayTargetCard.tsx` bietet bei Countern `Design` und bei `all` nur `Ansehen`.
- `src/overlays/OverlayEditor.tsx` erklärt die Gesamtansicht als festes Raster.
- `shared/overlayBoard.ts` kennt nur Counter-IDs und den reservierten Scope `all`.
- `sidecar/src/server/overlayRoutes.ts` akzeptiert nur `/overlay/counter/:id` und `/overlay/all`.
- `sidecar/src/overlay/boardAssets.ts` rendert alle gelieferten Counter vertikal und übernimmt globale Position und Größe implizit vom ersten Counter.
- Das Board-Relay veröffentlicht Counter-Ansichten, aber keine gespeicherte Komposition.

Der aktuelle `all`-Pfad muss aus Kompatibilitätsgründen bestehen bleiben. Eigene Ansichten werden ergänzend eingeführt.

## Gewünschte Oberfläche

### Overlay-Galerie

Ergänze oberhalb der Karten eine klare Primäraktion:

```text
+ Neue Overlay-Ansicht
```

Die Galerie wird in zwei Gruppen gegliedert:

1. `Einzel-Overlays`
2. `Eigene Ansichten`

Die automatische Gesamtansicht gehört zu `Eigene Ansichten`, wird aber als `Automatisch` gekennzeichnet und kann nicht gelöscht werden.

Jede eigene Ansicht zeigt:

- Name
- Anzahl enthaltener Elemente
- kleine Vorschau des gewählten Layouts
- Status `Bereit`, `Pausiert`, `Pro erforderlich` oder `Dienst startet`
- `Bearbeiten`
- lokale URL kopieren
- öffentliche URL kopieren, sofern vorhanden
- Kontextmenü für Duplizieren, Umbenennen und Löschen

### Composer-Dialog

`Neue Overlay-Ansicht` öffnet einen Wizard:

1. **Name** – beispielsweise `Hauptszene`.
2. **Elemente auswählen** – Checkbox-Karten aller Zähler und Abstimmungen des aktiven Profils.
3. **Reihenfolge festlegen** – per zugänglichen Hoch-/Runter-Aktionen; Drag-and-drop nur zusätzlich.
4. **Layout auswählen** – vertikal, horizontal, Raster 2×2 oder automatisch.
5. **Abstände und Ausrichtung** – kompakte, begrenzte Optionen.
6. **Vorschau** – echte lokale Board-Vorschau.
7. **Speichern** – danach URLs und OBS-Einrichtung anzeigen.

Mindestens ein Element muss ausgewählt sein. Maximal dürfen alle im Tarif laufenden Elemente gewählt werden.

### Bestehende Ansicht bearbeiten

Beim Klick auf `Bearbeiten` müssen folgende Dinge änderbar sein:

- Name
- enthaltene Elemente
- Reihenfolge
- Layout
- Abstand
- horizontale und vertikale Ausrichtung
- optional gemeinsame Skalierung

Das individuelle Design eines Counters bleibt weiterhin auf dessen Einzel-Overlay editierbar und wird auch in kombinierten Ansichten verwendet. Der Composer überschreibt nicht Farben, Logo oder Theme des Counters.

## Tarifentscheidung

Verbindlicher Vorschlag:

| Funktion | Free | Pro |
| --- | --- | --- |
| Einzel-Overlay des Free-Counters | ja | ja |
| Automatische Gesamtansicht | nein | ja |
| Eigene kombinierte Ansichten | nein | bis 4 |
| Elemente pro Ansicht | 1 | bis 4 |
| Eigene Layouts | nein | ja |
| Öffentliche URLs | bestehendes Free-Limit | entsprechend Pro-Limit |

Die Limits müssen zentral in `shared/entitlements.ts` modelliert werden. Keine Zahl direkt in React oder den Routen fest codieren. Prüfe, ob `overlayUrls` künftig URLs oder Ansichten meint. Falls diese Bedeutung zu unklar wird, ergänze getrennte Limits wie `overlayViews` und `overlayItemsPerView`, inklusive Tests.

Ein aktiver Pro-Plan ohne benötigte Features zeigt eine konkrete Lizenzdiagnose und eine Refresh-Aktion. Die Aktion zum Erstellen darf nicht kommentarlos verschwinden.

## Datenmodell

Erweitere das persistierte Profilmodell um gespeicherte Overlay-Ansichten. Beispiel:

```ts
type OverlayLayout = 'auto' | 'vertical' | 'horizontal' | 'grid';

type OverlayAlignment = 'start' | 'center' | 'end';

type OverlayView = {
  id: string;
  name: string;
  counterIds: string[];
  layout: OverlayLayout;
  gap: number;
  horizontalAlign: OverlayAlignment;
  verticalAlign: OverlayAlignment;
  scale: number;
  createdAt: string;
  updatedAt: string;
};
```

Empfehlung:

- `StreamProfile` erhält `overlayViews: OverlayView[]`.
- `all` bleibt reserviert und wird nicht als normale View gespeichert.
- IDs müssen URL-sicher, zufällig und unabhängig vom Namen sein.
- Counter-IDs innerhalb einer View müssen eindeutig sein.
- Gelöschte Counter werden atomar aus allen Views entfernt.
- Eine danach leere View wird entweder gelöscht oder als reparaturbedürftig markiert; dieses Verhalten verbindlich testen.
- Beim Profilwechsel gelten nur Views des aktiven Profils.
- Das Schema erhält eine saubere Migration mit `overlayViews: []` für bestehende Profile.

Keine View darf Zuschauer-, Chat- oder Lizenzdaten enthalten.

## URLs und Routing

Bestehende Pfade bleiben unverändert:

```text
/overlay
/overlay/counter/:counterId
/overlay/all
```

Neue lokale Pfade:

```text
/overlay/view/:viewId
/overlay/view/:viewId/events
```

Für öffentliche Relays erhält jede View einen nicht erratbaren Kanal beziehungsweise eine serverseitig abgeleitete Zuordnung. Die öffentliche URL darf weder Profil-ID noch View-ID als einziges Zugriffsgeheimnis verwenden.

Anforderungen:

- Eine gespeicherte View behält ihre URL bei Umbenennung und Layoutänderung.
- Gelöschte Views liefern `404`, nicht die Daten einer anderen View.
- Unbekannte, manipulierte oder fremde IDs liefern `404`.
- Tarifprüfung erfolgt serverseitig beziehungsweise im Sidecar, nicht nur in React.
- SSE-Verbindungen werden beim Ändern einer View sauber mit der neuen Konfiguration aktualisiert oder kontrolliert neu verbunden.

## Rendering

Erweitere `boardAssets` um explizite Layoutdaten. Das Layout darf nicht länger globale Position und Größe stillschweigend vom ersten Counter übernehmen.

Das Board-Update sollte ungefähr diese Struktur erhalten:

```ts
type OverlayBoardView = {
  id: string;
  layout: OverlayLayout;
  gap: number;
  horizontalAlign: OverlayAlignment;
  verticalAlign: OverlayAlignment;
  scale: number;
  counters: CounterView[];
};
```

Rendering-Regeln:

- `vertical`: Elemente untereinander.
- `horizontal`: Elemente nebeneinander.
- `grid`: bei zwei Elementen 2×1, bei drei oder vier Elementen 2×2.
- `auto`: anhand Anzahl und Browser-Source-Seitenverhältnis sinnvoll wählen.
- Jedes Element behält sein individuelles Counter-Design.
- Das Gesamtboard besitzt eigene Layout-Einstellungen, aber kein fingiertes Counter-Theme.
- Lange Namen, sechs Poll-Optionen und vier Elemente dürfen nicht abgeschnitten werden.
- Transparenter Hintergrund bleibt Standard.
- `prefers-reduced-motion` bleibt unterstützt.

## App- und API-Aktionen

Ergänze klar benannte Aktionen:

```ts
createOverlayView(input): Promise<void>
updateOverlayView(viewId, input): Promise<void>
deleteOverlayView(viewId): Promise<void>
duplicateOverlayView(viewId): Promise<void>
```

Führe sie durch alle notwendigen Schichten:

- React Controller und `FlagCountActions`
- `FlagCountApi`
- Tauri Commands
- Sidecar-Protokoll
- App-Service
- Settings Store
- Zustandsereignisse
- lokale Overlay-Routen
- Online-Relay, falls öffentliche View-URLs im selben Release enthalten sind

Alle Eingaben werden im Shared-Code validiert. UI-Validierung allein genügt nicht.

## Abwärtskompatibilität

- Das bestehende Basis-Overlay `/overlay` bleibt für alte OBS-Quellen unverändert.
- `/overlay/counter/:id` und `/overlay/all` bleiben stabil.
- Bestehende Counter-Designs bleiben erhalten.
- Nach dem Update existieren weiterhin alle automatisch erzeugten Einzelkarten.
- Bestehende Nutzer müssen keine View anlegen, um ihre bisherige Gesamtansicht weiterzuverwenden.
- Ein Downgrade löscht gespeicherte Pro-Views nicht. Sie werden pausiert und nach erneuter Pro-Aktivierung wieder nutzbar.

## Umsetzungsphasen

### Phase 0 – Verhalten festlegen und Tests vorbereiten

- Aktuelles `all`-Verhalten mit Tests absichern.
- Free-/Pro-Limits festlegen.
- Datenmodell und Routen schriftlich finalisieren.
- Tests für Migration, Validierung und Downgrade zuerst fehlschlagend hinzufügen.

### Phase 1 – Shared-Modell und Migration

- `OverlayView` und Parser implementieren.
- Profil-Schema migrieren.
- Entitlements und Limits ergänzen.
- Löschen eines Counters mit View-Bereinigung implementieren.

### Phase 2 – App-Service und Protokoll

- CRUD-Aktionen durch alle lokalen Schichten führen.
- Zustandsupdates nach jeder Änderung senden.
- Manipulierte IDs und tarifwidrige Änderungen ablehnen.

### Phase 3 – Lokale View-Routen und Rendering

- `/overlay/view/:viewId` und Eventroute implementieren.
- Nur ausgewählte Counter in gespeicherter Reihenfolge liefern.
- Layoutdaten explizit rendern.
- Bestehende Routen regressionssicher halten.

### Phase 4 – Overlay-Galerie und Composer

- Galerie gruppieren.
- `Neue Overlay-Ansicht` ergänzen.
- Wizard für Auswahl, Reihenfolge, Layout und Vorschau bauen.
- Bearbeiten, Duplizieren, Umbenennen und Löschen anbieten.
- Leere, gesperrte und inkonsistente Lizenzzustände erklären.

### Phase 5 – Öffentliche View-URLs

- Eigene sichere Relay-Kanäle pro View erzeugen.
- Relay-Lebenszyklus bei Erstellen, Ändern, Löschen und Profilwechsel testen.
- Nginx-/SSE-Kompatibilität dokumentieren.
- Lokale Funktion darf nicht vom Online-Relay abhängen.

### Phase 6 – Politur und Release

- OBS- und TikTok-LIVE-Studio-Anleitung pro View ergänzen.
- Responsive Verhalten und Tastaturbedienung prüfen.
- Vollständige Tests, Typechecks und Release-Build ausführen.
- Upgrade, Downgrade und Persistenz manuell testen.

## Verbindliche Tests

### Modell

- Bestehende Profile migrieren mit leerer View-Liste.
- Eine View benötigt mindestens einen gültigen Counter.
- Doppelte Counter-IDs werden abgelehnt.
- Ungültige Layouts, IDs, Abstände und Skalierungen werden abgelehnt.
- Counter-Löschung bereinigt Views sicher.

### UI

- `Neue Overlay-Ansicht` ist für Pro sichtbar und nutzbar.
- Free sieht die Funktion mit verständlichem Pro-Hinweis.
- Zwei Elemente können ausgewählt, sortiert und gemeinsam gespeichert werden.
- Die Galerie zeigt danach eine zusätzliche Karte.
- Bearbeiten lädt die gespeicherte Auswahl und Reihenfolge.
- Löschen verlangt Bestätigung.
- Erfolg und Fehler werden als zugängliche Rückmeldung gezeigt.

### Routing und Sicherheit

- View-Route liefert nur ausgewählte Counter.
- Reihenfolge entspricht der gespeicherten View.
- Unbekannte View liefert `404`.
- Pausierte View liefert einen ruhigen Hinweis statt Datenleck oder Crash.
- Free kann Pro-View nicht durch direkten URL-Aufruf umgehen.
- Öffentliche URLs sind nicht aus View- oder Profilnamen erratbar.

### Rendering

- Zwei Counter erscheinen vertikal, horizontal und im Raster korrekt.
- Eine Abstimmung und ein einfacher Counter können gemeinsam angezeigt werden.
- Vier Elemente passen in die empfohlene 1280×720 Browser Source.
- Einzelne Counter behalten ihr jeweiliges Design.
- Änderung an Counter B verändert Counter A nicht.
- `all` zeigt weiterhin alle laufenden Elemente.

### Lebenszyklus

- Profilwechsel tauscht verfügbare Views korrekt aus.
- App-Neustart erhält Views und stabile URLs.
- Downgrade pausiert Views, löscht sie aber nicht.
- Erneute Pro-Aktivierung stellt Views wieder her.
- Entfernen eines enthaltenen Counters erzeugt keine kaputte SSE-Schleife.

## Manuelle Abnahme

1. Zwei Elemente anlegen: `Rote Flaggen` und eine A/B-Abstimmung.
2. Prüfen, dass beide Einzel-Overlays automatisch vorhanden sind.
3. `Neue Overlay-Ansicht` wählen.
4. Beide Elemente auswählen.
5. Ansicht `Hauptszene` nennen und Layout `horizontal` wählen.
6. Speichern und neue Karte in der Galerie prüfen.
7. Lokale URL in einem Browser öffnen: beide Elemente müssen erscheinen.
8. Reihenfolge tauschen und Live-Aktualisierung prüfen.
9. Auf Raster wechseln und Vorschau prüfen.
10. Öffentliche URL in einem zweiten Browser beziehungsweise Gerät testen.
11. Einen Counter aus der View entfernen; nur der andere bleibt sichtbar.
12. App neu starten; View und URLs bleiben erhalten.
13. Pro deaktivieren; View bleibt gespeichert, ist aber pausiert.
14. Pro erneut aktivieren; View funktioniert wieder.

## Arbeitsregeln für Claude

1. Vor Beginn den aktuellen Worktree prüfen. Das App-Redesign kann seit Erstellung dieses Plans bereits weiterentwickelt worden sein.
2. Nicht den gesamten Composer in einem Commit bauen.
3. Shared-Modell, Migration, Protokoll, Rendering, UI und Online-Relay in getrennten Commits umsetzen.
4. Keine bestehenden URLs entfernen oder umdeuten.
5. Keine Entitlement-Prüfung nur in der UI implementieren.
6. Keine geheimen Relay-Schlüssel oder Lizenzdaten in `AppState` oder URLs der Oberfläche offenlegen.
7. Kein Drag-and-drop als einzige Sortiermethode verwenden.
8. Nach jeder Phase relevante Tests ausführen; vor Release vollständige Suite und Windows-Build.
9. Bestehende `.claude/`- und nutzereigene Dateien nicht verändern.
10. Bei einer notwendigen Protokolländerung Abwärtskompatibilität zuerst definieren und testen.

## Empfohlene Commits

```text
test(overlays): capture combined overlay behavior
feat(overlays): add persisted overlay view model
feat(sidecar): manage custom overlay views
feat(overlays): serve configurable local views
feat(app): add overlay composer workflow
feat(relay): publish custom overlay views securely
test(overlays): cover composer lifecycle and entitlements
docs(overlays): document custom views for streaming tools
```

## Definition of Done

Die Erweiterung ist abgeschlossen, wenn:

- der Nutzer klar zwischen Einzel-Overlay und kombinierter Ansicht unterscheiden kann;
- mindestens zwei vorhandene Elemente in einer eigenen Ansicht gemeinsam angezeigt werden können;
- Auswahl, Reihenfolge und Layout gespeichert werden;
- jede View eine stabile lokale URL besitzt;
- Pro-Views eine sichere öffentliche URL besitzen, sofern der Online-Dienst verfügbar ist;
- bestehende `/overlay`, Counter- und `all`-URLs kompatibel bleiben;
- Free-/Pro-Grenzen serverseitig und lokal durchgesetzt werden;
- Downgrade keine Konfiguration löscht;
- Tests, Typechecks und Windows-Release-Build erfolgreich sind.

