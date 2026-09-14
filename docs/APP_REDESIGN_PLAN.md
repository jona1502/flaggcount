# FlagCount App Redesign – Umsetzungsplan für Claude

## Auftrag

Überarbeite die FlagCount-Desktop-App vollständig zu einer klaren, professionellen Streaming-Anwendung. Alle bereits implementierten Free- und Pro-Funktionen müssen über eine verständliche Benutzeroberfläche auffindbar, konfigurierbar und während eines Streams bedienbar sein. Insbesondere müssen Pro-Nutzer Abstimmungen ohne Vorwissen erstellen können und für jeden Zähler beziehungsweise jede Abstimmung ein eigenes Overlay konfigurieren und kopieren können.

Dieser Plan betrifft primär die Tauri-Desktop-App unter `src/`. Die öffentliche Next.js-Website und das Admin-Dashboard unter `apps/web/` werden nicht neu gestaltet, außer eine gemeinsam genutzte Schnittstelle muss kompatibel angepasst werden. Der bestehende Sidecar-, Lizenz-, Voting- und Overlay-Kern wird weiterverwendet.

Vor der Umsetzung vollständig lesen:

- `README.md`
- `docs/FLAGCOUNT_PRO_PLAN.md`
- `docs/FLAGCOUNT_PRO_OPERATIONS.md`
- `docs/UPDATER.md`
- `shared/entitlements.ts`
- `shared/profiles.ts`
- `shared/appState.ts`
- `src/dashboard/Dashboard.tsx`
- `src/profiles/CounterEditor.tsx`
- `src/dashboard/OverlayPanel.tsx`
- `src/dashboard/OverlayDesigner.tsx`
- bestehende Tests der jeweils bearbeiteten Komponenten

Vorhandene Änderungen des Nutzers nicht überschreiben. Keine Secrets, Lizenzcodes, Zuschaueridentitäten oder Chattexte loggen oder in Screenshots/Test-Fixtures aufnehmen.

## Analyse des Ist-Zustands

Die technischen Pro-Funktionen sind größtenteils vorhanden, aber die Oberfläche bildet kein verständliches Produktmodell daraus:

1. Die Hauptnavigation besteht nur aus `Live`, `Profile`, `Historie` und `Pro`.
2. Abstimmungen sind im Bereich `Profile` innerhalb des umfangreichen `CounterEditor` versteckt. Es gibt keinen sichtbaren Einstieg namens „Abstimmung erstellen“ in der Hauptnavigation oder im leeren Live-Zustand.
3. Der Button `Abstimmung hinzufügen` erscheint nur, wenn das aktuelle Counter-Limit noch nicht erreicht ist. Ein Pro-Status ohne die erwarteten Feature-Entitlements ist für Nutzer nicht nachvollziehbar.
4. Einzelne Zähler und Abstimmungen werden gemeinsam in einem langen Formular bearbeitet. Erstellen, Konfigurieren, Live-Bedienung und Overlay-Gestaltung sind nicht sauber getrennt.
5. Im Live-Bereich entscheidet eine interne Bedingung zwischen `VotesPanel` und `CountersBoard`. Der Nutzer sieht nicht deutlich, welches Profil und welche Elemente gerade aktiv sind.
6. Der Overlay-Designer erhält aktuell die Einstellungen des ersten beziehungsweise primären Zählers. Weitere Counter-Overlay-URLs werden zwar angeboten, aber pro Element fehlt ein klarer vollständiger Bearbeitungsworkflow.
7. Lokale URL, öffentliche URL, Gesamtübersicht und einzelne Counter-URLs stehen zu technisch und ohne geführte OBS-/LIVE-Studio-Einrichtung nebeneinander.
8. Pro wird hauptsächlich als Lizenzseite und als kleine Kennzeichnung behandelt. Ein aktiver Tarif zeigt nicht übersichtlich, welche Funktionen tatsächlich freigeschaltet sind.
9. Sehr viele Einstellungen stehen gleichzeitig auf einer Seite. Progressive Offenlegung, klare Primäraktionen, leere Zustände und verständliche Rückmeldungen fehlen.
10. Die derzeitige Tab- und Panel-Struktur skaliert schlecht für vier parallele Abstimmungen, zehn Profile und mehrere Overlays.

### Wahrscheinliche Erklärung für „Pro aktiv, aber keine Abstimmungen sichtbar“

Eine Abstimmung wird nicht automatisch durch die Aktivierung von Pro angelegt. Sie muss aktuell unter `Profile` über `Abstimmung hinzufügen` erstellt und anschließend mit `Zähler speichern` gespeichert werden. Danach erscheint sie unter `Live`. Dieser Ablauf ist zu versteckt.

Zusätzlich muss die neue Oberfläche unterscheiden zwischen:

- `license.plan === 'pro'`
- den tatsächlich gelieferten `license.features`
- den daraus berechneten Limits
- dem aktiven und dem effektiv ausgeführten Profil

Wenn `plan` Pro meldet, aber `multi-option-polls`, `custom-triggers` oder `parallel-counters` fehlen, muss die Oberfläche eine konkrete Diagnose und eine Aktion `Lizenzstatus aktualisieren` zeigen. Sie darf nicht einfach den Erstellen-Button verschwinden lassen.

## Produktziel

Ein neuer Nutzer soll ohne Anleitung diesen Ablauf schaffen:

1. TikTok-Namen eingeben und Verbindung testen.
2. Ein Format auswählen oder ein neues erstellen.
3. Einen Zähler oder eine Abstimmung über einen sichtbaren Assistenten anlegen.
4. Optionen, Chat-Auslöser und Ziel verständlich konfigurieren.
5. Für jedes Element ein eigenes Overlay gestalten.
6. Die richtige lokale oder öffentliche URL mit einem Klick kopieren.
7. Während des Streams Stimmen, Status und Ergebnisse auf einer fokussierten Live-Seite kontrollieren.

Die Oberfläche muss für Free weiterhin sofort nutzbar sein. Pro-Funktionen bleiben sichtbar, werden im Free-Tarif aber mit Nutzen, Limit und Upgrade-Aktion erklärt. Keine Funktion darf kommentarlos fehlen.

## Verbindliche Informationsarchitektur

Ersetze die horizontale Tab-Leiste durch eine Desktop-App-Shell mit Seitenleiste und Inhaltskopf.

| Bereich | Zweck | Primäraktion |
| --- | --- | --- |
| Übersicht | Einrichtungsstatus, aktives Profil, TikTok-Verbindung, aktive Elemente und Overlay-Bereitschaft | Stream starten/verbinden |
| Live-Steuerung | Laufende Zähler und Abstimmungen, manuelle Stimmen, Reset, Zielstatus | Live-Aktion ausführen |
| Zähler & Abstimmungen | Elemente erstellen, bearbeiten, duplizieren, sortieren und löschen | Neues Element |
| Overlays | Overlay-Galerie, Designer und URLs pro Element sowie Gesamtansicht | Overlay einrichten |
| Profile | Stream-Profile erstellen, wechseln, duplizieren, umbenennen und löschen | Neues Profil |
| Historie | Runden, Filter, Detailansicht und CSV-Export | Exportieren |
| Lizenz & Konto | Tarifstatus, Aktivierung, Aktualisierung, Geräte und Portal | Lizenz verwalten |
| Einstellungen | Updates, App-Version, Verhalten und Support | Einstellungen speichern |

Auf kleinen Fenstern darf die Seitenleiste einklappen. Die Desktop-App muss bei einer sinnvollen Mindestbreite nutzbar bleiben; horizontales Scrollen in normalen Formularen ist zu vermeiden.

## Visuelles System

Das Redesign soll eigenständig und professionell wirken, nicht wie eine Sammlung generischer HTML-Panels.

- Dunkles, für Streaming-Tools geeignetes Grunddesign mit klarer Hell-Dunkel-Hierarchie.
- Rot nur als FlagCount-Akzent, Status- und Primäraktionsfarbe verwenden; Fehler und Gefahrenaktionen visuell unterscheidbar halten.
- Einheitliche Design-Tokens für Farbe, Abstand, Radius, Schatten, Typografie, Fokus und Animation in CSS Custom Properties.
- Eine gut lesbare UI-Schrift mit System-Fallback; keine externe Schrift zur Laufzeit laden.
- Wiederverwendbare primitives: `Button`, `IconButton`, `Card`, `Badge`, `StatusDot`, `EmptyState`, `Callout`, `Dialog`, `Drawer`, `Tabs`, `Field`, `Select`, `Switch`, `Tooltip`, `Toast` und `Skeleton`.
- Icons als lokale, zugängliche SVG-Komponenten. Emojis nicht als primäre Navigationsicons verwenden.
- Klare Zustände für Hover, Fokus, Aktiv, Disabled, Loading, Erfolg und Fehler.
- Animationen kurz und funktional; `prefers-reduced-motion` respektieren.
- WCAG-kontrastfähige Texte und Controls, vollständige Tastaturbedienung und sichtbare Fokusrahmen.

Keine UI-Bibliothek ohne vorherige Prüfung einführen. Bestehende React-/CSS-Lösung bevorzugen, wenn die benötigten Primitives klein und kontrollierbar bleiben.

## Zentrale UX-Flows

### 1. Erststart und Übersicht

Die Übersicht zeigt eine Setup-Checkliste:

- TikTok-Konto verbunden
- aktives Profil gewählt
- mindestens ein Zähler oder eine Abstimmung vorhanden
- Overlay für das aktive Element verfügbar
- Lizenzstatus aktuell

Jeder unvollständige Punkt führt direkt zur richtigen Oberfläche. Ein bestehender Nutzer sieht statt eines Onboardings kompakte Live-Kennzahlen und Schnellaktionen.

### 2. Zähler oder Abstimmung erstellen

`Neues Element` öffnet einen geführten Dialog beziehungsweise Wizard:

1. Typ auswählen: `Einfacher Zähler` oder `Abstimmung`.
2. Namen und optionales Stimmenziel festlegen.
3. Bei Abstimmungen zwei bis sechs Optionen definieren.
4. Pro Option Emoji- oder Text-Auslöser konfigurieren.
5. Optional Rücknahme-Auslöser festlegen.
6. Zusammenfassung prüfen und erstellen.

Für Pro muss `Abstimmung` direkt auswählbar sein. Für Free bleibt die Karte sichtbar, zeigt aber verständlich `Pro erforderlich`. Nach erfolgreicher Lizenzaktivierung muss sie ohne App-Neustart freigeschaltet werden.

Der bestehende `CounterEditor` darf nicht einfach optisch vergrößert werden. Teile seine Logik in kleine, testbare Komponenten und einen klaren Listen-/Detail-Workflow auf.

### 3. Elemente verwalten

Die Seite `Zähler & Abstimmungen` zeigt Karten oder eine Master-Detail-Liste mit:

- Typ, Name und Ziel
- Anzahl Optionen und konfigurierte Auslöser
- Live-/Bereitschaftsstatus
- Overlay-Status
- Aktionen: Bearbeiten, Duplizieren, Overlay öffnen, Zurücksetzen, Löschen

Bis zu vier Elemente müssen sortierbar und auf einen Blick erfassbar sein. Änderungen werden explizit gespeichert; ungespeicherte Änderungen werden beim Verlassen abgefangen.

### 4. Live-Steuerung

Die Live-Seite ist auf Bedienung während eines Streams optimiert:

- Verbindungsstatus dauerhaft sichtbar
- aktives Profil und Wechselmöglichkeit sichtbar
- alle laufenden Zähler und Abstimmungen gleichzeitig
- große, sichere manuelle Plus-/Minus-Aktionen
- Fortschritt, führende Option und Gesamtstimmen
- Reset je Element sowie optional `Alle Runden zurücksetzen`
- Bestätigungsdialog für destruktive Aktionen
- verständliche leere Zustände mit `Abstimmung erstellen`

Ein Lizenzproblem darf einen laufenden Free-Zähler nicht blockieren. Nicht verfügbare Pro-Elemente werden erklärt und nicht stillschweigend ausgeblendet.

### 5. Overlay-Zentrale

Jeder Counter und jede Abstimmung erhält eine eigene Overlay-Karte. Zusätzlich kann Pro eine kombinierte Gesamtansicht besitzen.

Die Oberfläche muss pro Ziel anbieten:

- Live-Vorschau
- eigenes Design bearbeiten
- lokale Overlay-URL kopieren
- öffentliche Overlay-URL kopieren, wenn verfügbar
- URL-Zustand und Online-Relay-Status
- Anleitung für OBS Browser Source
- Anleitung für TikTok LIVE Studio
- empfohlene Breite, Höhe und transparenter Hintergrund
- Öffnen/Testen in einem separaten Fenster, soweit Tauri dies sicher unterstützt

Der Designer bearbeitet ausdrücklich das ausgewählte Element, nicht implizit immer den ersten Counter. Name und Typ des bearbeiteten Ziels stehen permanent im Kopf. Änderungen müssen die zum Counter gehörenden `CounterDefinition.overlay`-Daten aktualisieren.

Für `all` ist zu klären und zu testen, ob es eine eigene Layoutkonfiguration oder nur eine aus den Einzelkarten zusammengesetzte Ansicht ist. Für die erste Iteration darf die Gesamtansicht ein festes responsives Board-Layout verwenden; sie darf jedoch nicht die Einstellungen eines beliebigen primären Counters vortäuschen.

### 6. Lizenztransparenz

Die Lizenzseite zeigt:

- Free oder Pro deutlich im Seitenkopf
- Status: aktiv, Grace Period, abgelaufen, gesperrt oder Aktualisierung nötig
- letzte erfolgreiche Prüfung und nächster Prüfzeitpunkt, soweit das bestehende Modell diese Daten sicher liefert
- alle bekannten Pro-Features mit Status `aktiv` oder `nicht freigegeben`
- effektive Limits: Profile, parallele Elemente, Optionen und Overlay-URLs
- `Lizenzstatus aktualisieren`
- Aktivieren, deaktivieren und Kundenportal

Wenn `plan === 'pro'`, aber erwartete Features fehlen, zeige einen diagnostischen Callout. Das ist kein Upgrade-Zustand. Biete Aktualisieren und Support an und nenne keine internen Schlüssel oder Signaturdetails.

## Daten- und API-Anpassungen

Die bestehende Domänenlogik bleibt Quelle der Wahrheit. Keine Tariflimits in UI-Komponenten duplizieren.

1. Prüfe, ob `setOverlaySettings` nur den primären Counter verändert. Erweitere die Aktion bei Bedarf zu `setCounterOverlaySettings(counterId, overlay)`.
2. Ergänze passende Methoden durchgängig in `FlagCountApi`, Tauri Commands, Sidecar-Protokoll, App-Service und Tests.
3. Stelle lokale und öffentliche Overlay-URLs als explizite Ziele bereit, idealerweise strukturiert statt als lose Felder:

   ```ts
   type OverlayTarget = {
     id: string;
     kind: 'counter' | 'board';
     label: string;
     localUrl: string | null;
     publicUrl: string | null;
     available: boolean;
   };
   ```

4. Eine Migration des gespeicherten Schemas ist nur nötig, wenn wirklich neue persistente Felder hinzukommen. Bestehende Profile, Counter, Abstimmungen und Overlay-Einstellungen müssen unverändert erhalten bleiben.
5. `entitlementsFor`, `canUse`, `limitFor`, `effectiveProfile` und `effectiveCounters` bleiben die einzigen Grundlagen für Berechtigungen.
6. Nach Aktivieren oder Aktualisieren einer Lizenz muss der neue Zustand unmittelbar an React gesendet werden.
7. Ergänze bei Bedarf einen sicheren, nicht sensitiven Diagnosezustand, damit die UI `Pro ohne erwartete Features` erklären kann.

## Vorgesehene Komponentenstruktur

Die exakten Namen dürfen angepasst werden, die Verantwortungsgrenzen nicht.

```text
src/
  app-shell/
    AppShell.tsx
    Sidebar.tsx
    PageHeader.tsx
    StatusBar.tsx
  components/
    ui/
      Button.tsx
      Card.tsx
      Badge.tsx
      Dialog.tsx
      EmptyState.tsx
      Field.tsx
      Toast.tsx
  pages/
    OverviewPage.tsx
    LivePage.tsx
    CountersPage.tsx
    OverlaysPage.tsx
    ProfilesPage.tsx
    HistoryPage.tsx
    LicensePage.tsx
    SettingsPage.tsx
  counters/
    CounterList.tsx
    CounterDetails.tsx
    CreateCounterWizard.tsx
    PollOptionsEditor.tsx
    TriggerEditor.tsx
  overlays/
    OverlayGallery.tsx
    OverlayTargetCard.tsx
    OverlayEditor.tsx
    OverlayPreview.tsx
    OverlaySetupGuide.tsx
```

Bestehende fachliche Komponenten dürfen schrittweise extrahiert werden. Vermeide einen Big-Bang-Rewrite, bei dem funktionierende Logik gleichzeitig neu erfunden wird.

## Umsetzungsphasen

### Phase 0 – Reproduzieren und absichern

- Test-Fixture mit vollständig aktiver Pro-Lizenz und allen `FEATURES` anlegen.
- Integrationstest schreiben: Pro aktiv → Navigation zu `Zähler & Abstimmungen` → `Neues Element` → Abstimmung auswählbar.
- Test für inkonsistenten Zustand schreiben: Pro-Plan, aber fehlendes `multi-option-polls` → sichtbare Diagnose statt verschwundener Aktion.
- Aktuelle Free-, Pro-, Offline- und Downgrade-Zustände dokumentieren.
- Bestehende UI-Screens beziehungsweise Screenshots als Vergleich erfassen, falls die Testumgebung dies erlaubt.

Abnahme: Das gemeldete Auffindbarkeitsproblem ist als fehlschlagender Test reproduziert, bevor die neue UI implementiert wird.

### Phase 1 – Design-Tokens und UI-Primitives

- Tokens und globale Basisstile einführen.
- Buttons, Karten, Badges, Dialoge, Felder, Empty States, Toasts und Ladezustände bauen.
- Komponenten mit Keyboard-, Fokus- und Accessibility-Tests absichern.
- Bestehende Seiten noch nicht fachlich umbauen.

Abnahme: Primitives decken alle benötigten Zustände ab und funktionieren bei 200 % Zoom ohne abgeschnittene Kernaktionen.

### Phase 2 – App-Shell und Navigation

- Neue Seitenleiste, Kopfzeile und Statusleiste implementieren.
- Lokales Routing als klar typisierten React-Zustand oder leichtgewichtige Router-Lösung aufbauen; keine Next.js-Abhängigkeit in Tauri einführen.
- Deep Links innerhalb der App ermöglichen, damit Callouts direkt zu Erstellung, Overlay oder Lizenz führen.
- Version und Updatefunktion in `Einstellungen` verschieben; kritische Updatehinweise global sichtbar halten.

Abnahme: Alle Bereiche sind per Maus und Tastatur erreichbar, aktive Navigation ist eindeutig und der Browser-Webmodus bleibt kompatibel oder erhält bewusst eine reduzierte Navigation.

### Phase 3 – Zähler- und Abstimmungsworkflow

- Bestehenden `CounterEditor` in Liste, Wizard und Detaileditor zerlegen.
- `Neues Element` als dominante Aktion hinzufügen.
- Abstimmungsoptionen und Trigger verständlich bearbeiten.
- Save-, Dirty-, Validation- und Entitlement-Zustände sichtbar machen.
- Duplizieren und Sortieren nur implementieren, wenn die vorhandene Domain/API sicher erweitert ist; andernfalls als gesonderten kleinen Commit ergänzen.

Abnahme: Ein Pro-Nutzer kann eine A/B-Abstimmung in höchstens sechs verständlichen Schritten erstellen, speichern und anschließend auf der Live-Seite sehen. Ein Free-Nutzer versteht, warum diese Funktion Pro benötigt.

### Phase 4 – Live-Steuerung

- `VotesPanel` und `CountersBoard` in eine gemeinsame skalierbare Live-Oberfläche überführen.
- Verbindung, Profil, Rundenstatus und manuelle Steuerung priorisieren.
- Leere, ladende, getrennte, reconnecting und stream-ended Zustände gestalten.
- Reset- und Profilwechsel-Dialoge vereinheitlichen.

Abnahme: Ein bis vier aktive Elemente sind ohne Scroll-Chaos bedienbar; Abstimmungen zeigen Optionen, Stimmen, Führung und Zielstatus eindeutig.

### Phase 5 – Overlay pro Element

- Overlay-Ziele als Galerie darstellen.
- Counter-ID bei Auswahl, Vorschau, Speichern und URL-Kopieren konsequent führen.
- Falls nötig `setCounterOverlaySettings` durch alle Schichten implementieren.
- Lokale und öffentliche URL pro Counter verifizieren.
- Kombinierte `all`-Ansicht explizit behandeln.
- Setup-Anleitungen und Kopierfeedback hinzufügen.

Abnahme: Für jeden der bis zu vier Pro-Counter kann ein unterschiedliches Design gespeichert werden. Jede Einzel-URL zeigt den richtigen Counter; die Gesamt-URL zeigt alle vorgesehenen Elemente.

### Phase 6 – Profile, Historie, Lizenz und Einstellungen

- Profilverwaltung als eigene fokussierte Seite neu gestalten.
- Historie mit guten leeren Zuständen, Rundenübersicht und Exportfeedback versehen.
- Lizenzstatus und effektive Features transparent machen.
- Update, Version und Support in Einstellungen bündeln.
- Upgrade-Callouts kontextbezogen halten; bei aktivem Pro keine Kaufwerbung zeigen.

Abnahme: Alle bestehenden Pro-Funktionen sind über mindestens einen klar beschrifteten Navigationseintrag oder eine direkte kontextbezogene Aktion erreichbar.

### Phase 7 – Responsive, Accessibility und Politur

- Fenstergrößen mindestens bei 1280×800, 1024×700 und sinnvoller Mindestgröße prüfen.
- Tastaturnavigation, Fokusreihenfolge, Dialog-Fokusfalle, Labels und Live Regions testen.
- Farbkontrast und `prefers-reduced-motion` prüfen.
- Lange Profil-/Counter-Namen, vier Counter, sechs Optionen und große Zahlen testen.
- Lade- und Fehlerzustände visuell konsistent machen.

Abnahme: Keine Hauptaktion ist abgeschnitten oder nur über Hover verständlich. Es gibt keine kritischen Accessibility-Verstöße in den eingesetzten Tests.

### Phase 8 – Release-Absicherung

- Vollständige Typechecks und Tests ausführen.
- Sidecar und Tauri Release-Build ausführen.
- Manuelle Smoke-Tests mit Free und echter beziehungsweise lokal signierter Pro-Testlizenz durchführen.
- Upgrade von der vorherigen Version testen; Profile und Overlays müssen erhalten bleiben.
- Changelog und Nutzerdokumentation aktualisieren.
- Erst nach erfolgreichen Checks Version erhöhen, committen, Tag erstellen und Release-Workflow beobachten.

## Verbindliche Testszenarien

### Lizenz und Entitlements

- Free zeigt Pro-Funktionen sichtbar, aber korrekt gesperrt.
- Pro mit allen Features zeigt Abstimmungen, parallele Counter, Premium-Themes, Branding, Historie und Export.
- Pro mit unvollständiger Feature-Liste zeigt Diagnose und Refresh-Aktion.
- Lizenzaktivierung schaltet UI ohne Neustart frei.
- Offline-Grace und abgelaufene Lizenz haben verständliche Zustände.
- Downgrade löscht keine Profile, Counter oder Overlay-Einstellungen.

### Abstimmungen

- A/B-Abstimmung erstellen, speichern und live anzeigen.
- Zwei bis sechs Optionen validieren.
- Emoji- und Text-Auslöser hinzufügen und entfernen.
- Doppelte oder ungültige Trigger verständlich melden.
- Manuelle Stimme hinzufügen, abziehen und Runde zurücksetzen.
- TikTok-Stimmen aktualisieren Live-Karte und Overlay.

### Overlays

- Lokale URL jedes Counters liefert nur das gewählte Element.
- Öffentliche URL jedes Counters liefert nur das gewählte Element.
- `all` liefert die kombinierte Ansicht.
- Änderungen an Counter B verändern Counter A nicht.
- Vorschau folgt Änderungen und verliert beim Seitenwechsel keine letzte Eingabe.
- Free kann sein einzelnes Basis-Overlay vollständig verwenden.
- Pro kann bis zu vier Overlay-Ziele, Premium-Theme und Branding verwenden.

### Regression

- Bestehender roter/weißer Flaggenzähler funktioniert unverändert.
- TikTok Connect, Reconnect und Disconnect funktionieren.
- Profile wechseln und speichern korrekt.
- Historie und CSV enthalten keine Zuschauer- oder Chatdaten.
- Updater bleibt erreichbar.
- Browser-Dashboard kompiliert weiterhin, obwohl Desktop-spezifische Verwaltung dort reduziert sein darf.

## Manuelle End-to-End-Abnahme

1. App ohne Lizenz frisch starten.
2. Free-Zähler verbinden, Overlay kopieren und eine Runde durchführen.
3. Pro-Lizenz aktivieren und beobachten, dass Navigation und Aktionen sofort freigeschaltet werden.
4. Profil `A/B Test` erstellen.
5. Eine Abstimmung `Welches Team?` mit zwei Optionen und eigenen Triggern erstellen.
6. Einen zweiten parallelen Zähler erstellen.
7. Für beide unterschiedliche Farben, Vorlagen und URLs konfigurieren.
8. Beide Einzeloverlays und die Gesamtansicht im Browser prüfen.
9. Stimmen manuell und über Testevents auslösen.
10. Einzelne und alle Runden zurücksetzen.
11. Historie prüfen und CSV exportieren.
12. App neu starten und Persistenz prüfen.
13. Lizenzstatus aktualisieren und Offline-Grace simulieren.
14. Upgrade von der letzten stabilen Version installieren und vorhandene Daten prüfen.

## Arbeitsregeln für Claude

1. Nicht den gesamten Umbau in einem Commit umsetzen.
2. Pro Phase kleine, fachlich geschlossene Commits erstellen.
3. Vor jedem Commit `git status` und `git diff --check` prüfen und nur zugehörige Dateien stagen.
4. Nach jedem fachlichen Schritt relevante Tests ausführen.
5. Nach jeder Phase mindestens Typecheck, betroffene Tests und Produktionsbuild ausführen.
6. Keine bestehende Domainlogik in React duplizieren.
7. Keine Funktion nur per CSS verstecken, wenn die Berechtigung fachlich geprüft werden muss.
8. Bei aktivem Pro keine Upgrade-Werbung anstelle einer fehlenden Funktion anzeigen.
9. Keine stillen Fehler: Mutationserfolg als Toast, Feldfehler am Feld, globale Verbindungsfehler global anzeigen.
10. Keine Änderungen an Stripe, Admin-Authentifizierung oder Lizenzsignierung, sofern sie für dieses App-Redesign nicht zwingend erforderlich sind.
11. Keine neue Datenerfassung oder Telemetrie einführen.
12. Vor einer Schema- oder Protokolländerung Migration und Abwärtskompatibilität definieren.
13. Bestehende `.claude/`-Dateien und andere nutzereigene, nicht versionierte Dateien nicht verändern.

## Empfohlene Commit-Reihenfolge

```text
test(app): cover pro poll discovery and entitlement mismatch
feat(ui): add desktop design tokens and primitives
feat(app): introduce sidebar application shell
feat(counters): add guided counter and poll creation
feat(live): redesign multi-counter live controls
feat(overlays): configure and preview overlays per counter
feat(profiles): redesign stream profile management
feat(history): improve round history and export flow
feat(license): expose effective pro capabilities
test(app): cover redesigned free and pro workflows
docs(app): document redesigned desktop workflows
release: prepare redesigned FlagCount app
```

## Definition of Done

Das Redesign ist erst abgeschlossen, wenn:

- ein Pro-Nutzer Abstimmungen sofort findet und erstellen kann;
- aktive Pro-Funktionen nicht aufgrund unklarer Navigation unsichtbar bleiben;
- jede gesperrte Funktion einen nachvollziehbaren Grund und eine passende Aktion zeigt;
- jeder Zähler und jede Abstimmung ein eigenes konfigurierbares Overlay und eine klar zugeordnete URL besitzt;
- bis zu vier parallele Elemente live übersichtlich bedienbar sind;
- Free vollständig funktionsfähig bleibt;
- bestehende Daten ohne Verlust übernommen werden;
- Desktop-, Sidecar- und gemeinsame Tests erfolgreich sind;
- der Windows-Release-Build erfolgreich ist;
- die wichtigsten Free-/Pro-/Overlay-Flows manuell geprüft und dokumentiert sind.

