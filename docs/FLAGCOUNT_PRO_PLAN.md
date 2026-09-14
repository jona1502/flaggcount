# FlagCount Free & Pro – vollständiger Umsetzungsplan für Claude

## Auftrag

Erweitere FlagCount von einem kostenlosen Red-Flag-Zähler zu einem Freemium-Produkt für interaktive TikTok-LIVE-Abstimmungen. Der kostenlose Kern muss dauerhaft nützlich, ohne Konto verwendbar und lokal funktionsfähig bleiben. **FlagCount Pro** verkauft zusätzliche Flexibilität, professionelle Gestaltung, mehrere parallele Formate und lokale Auswertungen.

Dieser Plan ist die verbindliche Arbeitsgrundlage. Vor jeder Umsetzung den aktuellen Repository-Stand, `README.md`, `CHANGELOG.md`, `package.json`, die bestehenden Tests und alle seit Erstellung dieses Plans hinzugekommenen Änderungen lesen. Vorhandene oder fremde Änderungen nicht überschreiben.

## Produktversprechen

> FlagCount ist das einfachste faire Abstimmungs- und Entscheidungswerkzeug für TikTok LIVE: Jede Person zählt pro Abstimmung nur einmal.

FlagCount ist kein allgemeiner Ersatz für TikFinity, Streamlabs oder TikTok LIVE Studio. Das Produkt konzentriert sich auf leicht verständliche, faire und visuell gute Live-Abstimmungen.

## Verbindliche Tarifgrenze

| FlagCount Free | FlagCount Pro |
| --- | --- |
| Rote und weiße Flaggen zählen | Eigene Emojis und Begriffe |
| Eine Stimme pro Zuschauer | Mehrere Abstimmungsoptionen, z. B. A/B/C |
| Lokales OBS-Overlay | Premium-Overlays und Animationen |
| Einfaches Online-Overlay | Mehrere parallele Ziele und Overlays |
| Ein gespeichertes Profil | Mehrere Stream-Profile |
| Aktuelle Runde | Verlauf, Statistiken und CSV-Export |
| Grundlegender Designer | Logos, Schriften und eigene Hintergründe |
| Community-Support | Priorisierter Support |

### Vorgesehene Preise

- Pro monatlich: **6,99 EUR** inklusive Umsatzsteuer, soweit diese anfällt.
- Pro jährlich: **59,00 EUR** inklusive Umsatzsteuer, soweit diese anfällt.
- Ein zeitlich und mengenmäßig begrenztes Founding-Angebot darf **39,00 EUR für das erste Jahr** kosten.
- Keine Lifetime-Lizenz mit dauerhaft enthaltenen Cloud-Leistungen anbieten.
- Preise, Steuerdarstellung und Währungen kommen vom Zahlungsanbieter und dürfen nicht im Client als abrechnungsrelevante Wahrheit fest codiert werden.

Die Preise dürfen erst öffentlich als kaufbar erscheinen, wenn Checkout, Widerrufs-/Erstattungsprozess, Datenschutz, Supportweg und Lizenzwiederherstellung funktionieren.

## Nicht verhandelbare Produktregeln

1. Bestehende kostenlose Funktionen bleiben kostenlos. Insbesondere dürfen der rote/weiße Flaggenzähler, das lokale Overlay, das bestehende einfache Online-Overlay und die vorhandenen grundlegenden Designoptionen nicht nachträglich gesperrt werden.
2. Free benötigt kein FlagCount-Konto, keine Zahlungsdaten und keine dauerhafte Internetverbindung. Nur TikTok-Verbindung, Updates und Online-Overlay benötigen das Netz.
3. Ein abgelaufenes Pro-Abonnement darf niemals aktive Stimmen löschen oder einen laufenden Stream zerstören. Die App fällt kontrolliert auf Free zurück.
4. Chattexte und TikTok-Zuschaueridentitäten verlassen für Abstimmungen und Statistiken niemals den lokalen Prozess.
5. Historie speichert ausschließlich aggregierte Ergebnisse. Keine `userId`, Handles, Nicknames oder Chatnachrichten persistieren oder exportieren.
6. Das bestehende Online-Overlay bleibt über eine schwer erratbare öffentliche URL lesbar und über einen getrennten geheimen Schlüssel beschreibbar.
7. Premium ist eine Berechtigung, keine zweite Anwendung. Free und Pro verwenden denselben Installer und denselben Updatekanal.
8. Keine Werbung und kein erzwungenes Wasserzeichen im Stream.
9. Alle Tarifgrenzen werden zentral als Entitlements modelliert, nicht verteilt über React-Komponenten fest codiert.
10. Bei unklarem Lizenzstatus gilt: lokale Free-Funktionen funktionieren weiter; Pro erhält eine definierte Offline-Gnadenfrist.

## Umfang des ersten kommerziellen Releases

### Muss enthalten sein

- Pro-Checkout und Abonnementverwaltung über einen Merchant of Record.
- Aktivierung, Wiederherstellung und Deaktivierung einer Pro-Lizenz.
- Sichtbarer Lizenzstatus und verständliche Fehlerzustände.
- Eigene Auslöser aus Emojis und Begriffen.
- Abstimmungen mit zwei bis sechs Optionen.
- Bis zu vier parallele Zähler/Abstimmungen und je ein Overlay pro Zähler.
- Bis zu zehn gespeicherte Stream-Profile.
- Lokale, aggregierte Rundenhistorie und CSV-Export.
- Premium-Overlay-Vorlagen, zusätzliche Animationen, Logo, Schriftwahl und Hintergrundbild.
- Support-Link für Pro-Kunden mit einer mitgegebenen, nicht sensiblen Lizenzreferenz.
- Feature-Matrix und Preise auf der öffentlichen Landingpage.

### Bewusst später

- Gift-/Coin-Ziele und TikTok-Geschenkereignisse.
- Team-, Agentur- oder White-Label-Tarif.
- Plattformen außer TikTok.
- Cloud-Synchronisation der Profile oder Historie.
- Öffentliche Profil- oder Template-Galerie.
- KI-Funktionen, TTS, Sound-Alerts oder allgemeine Automationen.
- Zuschauerbezogene Langzeitanalyse.

## Konkrete Tariflimits

Die Werte werden in einer gemeinsamen, getesteten Entitlement-Definition gepflegt.

| Fähigkeit | Free | Pro |
| --- | ---: | ---: |
| Gespeicherte Profile | 1 | 10 |
| Gleichzeitig aktive Zähler/Abstimmungen | 1 | 4 |
| Optionen pro Abstimmung | nur der einzelne Flaggenzähler | 2–6 |
| Benutzerdefinierte positive Auslöser | nein | bis 8 je Zähler/Option |
| Benutzerdefinierte Rücknahme-Auslöser | nein | bis 4 je Zähler |
| Lokale Overlay-URLs | 1 | bis 4 |
| Einfache Online-Overlay-URLs | 1 | bis 4 |
| Rundenhistorie | keine dauerhafte Historie | letzte 500 Runden |
| CSV-Export | nein | ja |
| Eigenes Logo | nein | ja, 2 MB maximal |
| Eigenes Hintergrundbild | nein | ja, 5 MB maximal |
| Schriftwahl | Systemstandard | kuratierte lokal mitgelieferte Schriften |
| Support | öffentlicher Community-Kanal | priorisierte Supportadresse/-formular |

Limits müssen in der UI sichtbar sein, bevor eine Aktion scheitert. Ein Upgrade-Hinweis erklärt den konkreten Nutzen und darf den Stream nicht mit einem modalen Dialog unterbrechen.

## Fachliches Modell

### Profil

Ein `StreamProfile` ist eine vollständig gespeicherte Stream-Konfiguration:

```ts
type StreamProfile = {
  id: string;
  name: string;
  counters: CounterDefinition[];
  createdAt: string;
  updatedAt: string;
};
```

- Free besitzt genau ein Profil. Beim Update werden die bisherigen Einstellungen verlustfrei in dieses Profil migriert.
- Pro darf bis zu zehn Profile anlegen, duplizieren, umbenennen und löschen.
- Das aktive Profil kann nur gewechselt werden, wenn vorher bestätigt wird, dass dabei aktive Runden beendet werden.
- Mindestens ein Profil muss immer existieren.
- Profilnamen sind lokal, 1–60 Zeichen lang und müssen nicht eindeutig sein.

### Zähler und Abstimmungen

```ts
type Trigger = {
  kind: 'emoji' | 'text';
  value: string;
  match: 'contains' | 'word';
};

type PollOption = {
  id: string;
  label: string;
  triggers: Trigger[];
  accentColor: string;
};

type CounterDefinition = {
  id: string;
  name: string;
  mode: 'single' | 'poll';
  target: number | null;
  options: PollOption[];
  withdrawalTriggers: Trigger[];
  overlay: OverlayConfiguration;
};
```

- Der migrierte Free-Zähler heißt „Rote Flaggen“, ist `single`, verwendet `🚩`, zieht mit `🏳️` zurück und behält den bisherigen Zielwert.
- Ein Single-Zähler besitzt intern genau eine Option.
- Eine Poll-Abstimmung besitzt zwei bis sechs Optionen.
- Pro Zuschauer ist je Zähler und Runde genau eine aktive Stimme erlaubt.
- Eine neue eindeutige Option desselben Zuschauers verschiebt dessen Stimme zur neuen Option. So lässt sich eine Wahl korrigieren.
- Eine Rücknahme entfernt die Stimme dieses Zuschauers im betreffenden Zähler.
- Passt eine Nachricht gleichzeitig zu mehreren Optionen desselben Zählers, wird sie für diesen Zähler als mehrdeutig ignoriert.
- Eine Nachricht kann verschiedene parallele Zähler aktualisieren, wenn sie dort jeweils eindeutig passt.
- Textvergleiche sind Unicode-normalisiert und bei `word` ohne Beachtung der Groß-/Kleinschreibung. Emoji-Auslöser werden exakt verglichen.
- Leere Auslöser, nur aus Leerzeichen bestehende Texte, Duplikate und Auslöser, die innerhalb desselben Zählers mehreren Optionen zugeordnet sind, werden bei der Konfiguration abgelehnt.
- Jeder Zähler hat eine eigene `roundId` und kann einzeln zurückgesetzt werden. Zusätzlich gibt es „Alle Runden zurücksetzen“ mit Bestätigung.
- Manuelle Stimmen werden einer konkreten Option zugeordnet. Beim Single-Zähler bleibt der heutige Ein-Klick-Ablauf erhalten.

### Zustand und Snapshots

Die bisherige einzelne `VoteSnapshot`-Struktur wird kompatibel weiterentwickelt:

```ts
type OptionSnapshot = {
  optionId: string;
  label: string;
  count: number;
};

type CounterSnapshot = {
  counterId: string;
  name: string;
  mode: 'single' | 'poll';
  options: OptionSnapshot[];
  totalCount: number;
  target: number | null;
  targetReached: boolean;
  roundId: string;
};
```

Während der Migration darf ein Adapter die alte Snapshot-Form bedienen, damit Dashboard und Overlay nicht in einem einzigen riskanten Schritt umgestellt werden müssen.

### Rundenhistorie

```ts
type RoundRecord = {
  schemaVersion: 1;
  id: string;
  profileId: string;
  profileName: string;
  counterId: string;
  counterName: string;
  mode: 'single' | 'poll';
  startedAt: string;
  endedAt: string;
  endReason: 'reset' | 'profile-change' | 'app-exit';
  target: number | null;
  targetReached: boolean;
  totalCount: number;
  options: Array<{ optionId: string; label: string; count: number }>;
  manualVotes: number;
};
```

- Nur abgeschlossene Runden mit mindestens einer Stimme speichern.
- Beim regulären App-Ende aktive, nicht leere Runden mit `app-exit` abschließen.
- Maximal 500 Datensätze; beim Überschreiten die ältesten löschen.
- Löschen der Historie verlangt eine Bestätigung.
- CSV wird UTF-8 mit BOM und Semikolon als Trennzeichen exportiert, damit deutsches Excel die Datei direkt sinnvoll öffnet.
- Formelfähige CSV-Zellen, die mit `=`, `+`, `-` oder `@` beginnen, müssen gegen CSV-Injection neutralisiert werden.
- Export enthält keine Zuschaueridentitäten und keine Chattexte.

## Overlay-System

### Free

- Bestehendes Standard-Overlay und seine vorhandenen grundlegenden Einstellungen.
- Eine lokale und eine einfache öffentliche URL.
- Aktueller Zählerstand, Ziel und bestehende Effekte bleiben unverändert verfügbar.

### Pro

- Pro aktivem Zähler eine eigene lokale und öffentliche URL.
- Eine optionale „Übersicht“-URL, die alle aktiven Zähler in einem Layout zeigt.
- Premium-Vorlagen, zunächst mindestens: `minimal`, `glass`, `neon`, `scoreboard`, `vertical-poll`.
- Zusätzliche Animationen nur mit `prefers-reduced-motion`-Fallback.
- Logo als PNG, JPEG oder WebP bis 2 MB.
- Hintergrundbild als PNG, JPEG oder WebP bis 5 MB.
- Keine SVG-Uploads zulassen.
- Bilddateien lokal in einem verwalteten App-Datenverzeichnis ablegen, Dateinamen zufällig generieren und Bildtyp anhand des Inhalts validieren.
- Nur kuratierte, mit der App ausgelieferte und lizenzrechtlich dokumentierte Schriften. In Version 1 keine beliebigen Font-Dateien hochladen.
- Browserquellen erhalten Assets ausschließlich über enge lokale bzw. öffentliche Asset-Routen mit korrektem MIME-Typ und CSP.
- Das Online-Relay überträgt nur die für die Darstellung erforderlichen aggregierten Snapshots und freigegebenen Assets. Keine lokalen Dateipfade übertragen.

### Cloud-Assets

- Pro-Assets werden bei Bedarf in einen S3-kompatiblen Object Store hochgeladen.
- Upload erfolgt über kurzlebige signierte URLs.
- Der Server validiert Typ, Größe und Zuordnung nochmals.
- Beim Ersetzen oder Löschen eines Assets wird das alte Objekt zeitversetzt und idempotent entfernt.
- Free-Kunden erhalten keinen allgemeinen Asset-Upload.
- Fällt die Cloud aus, bleibt das lokale Overlay vollständig nutzbar.

## Lizenz- und Billing-Architektur

### Anbieterentscheidung

Für Version 1 einen Merchant of Record verwenden. Bevorzugter Anbieter ist **Paddle**; die Integration muss hinter `BillingProvider` abstrahiert werden, damit ein Wechsel möglich bleibt. Vor Implementierungsbeginn aktuelle offizielle Paddle-Dokumentation, unterstützte Länder, Webhook-Signaturverfahren, Steuerdarstellung, Sandbox und Kündigungsablauf prüfen.

Keine geheimen Paddle-Schlüssel in Desktop-App, Webbundle, GitHub Actions Logs oder Overlay-URLs aufnehmen.

### Kaufablauf

1. Nutzer klickt in FlagCount oder auf der Landingpage auf „Pro holen“.
2. Gehosteter Checkout öffnet sich im Systembrowser.
3. Paddle verarbeitet Zahlung, Steuer und Beleg.
4. Ein signierter Webhook aktualisiert das Abonnement im FlagCount-Lizenzdienst.
5. Nach erfolgreichem Kauf erhält der Kunde per E-Mail einen Aktivierungscode bzw. einen sicheren Aktivierungslink.
6. In der Desktop-App wird Pro über diesen Code aktiviert.
7. Der Lizenzdienst liefert ein signiertes Entitlement-Dokument zurück.
8. Die App speichert nur das notwendige Aktivierungsgeheimnis im sicheren Betriebssystem-Speicher; niemals im normalen `settings.json`.

### Entitlement-Dokument

```ts
type SignedEntitlement = {
  version: 1;
  licenseId: string;
  installationId: string;
  plan: 'pro';
  status: 'active' | 'grace';
  issuedAt: string;
  refreshAfter: string;
  expiresAt: string;
  features: string[];
  signature: string;
};
```

- Signatur asymmetrisch erzeugen; nur der öffentliche Prüfschlüssel wird in die App eingebaut.
- Online mindestens alle sieben Tage aktualisieren.
- Nach dem letzten erfolgreichen Abruf 30 Tage Offline-Gnadenfrist gewähren.
- Kündigung lässt Pro bis zum bezahlten Periodenende aktiv.
- Rückerstattung, Chargeback oder Betrugsstatus darf schneller sperren, aber nie Free beschädigen.
- Maximal drei aktive Installationen pro Lizenz. Nutzer können alte Geräte im Customer Portal oder über Support deaktivieren.
- Uhr-Manipulation nicht allein als Sperrgrund verwenden. Verdächtige lokale Zeit führt zu Online-Neuprüfung, nicht zu Datenverlust.

### Serverdaten

Minimal speichern:

- interne `licenseId`;
- Provider-Kunden- und Abonnement-ID;
- Status und bezahltes Periodenende;
- gehashter Aktivierungscode;
- pseudonyme `installationId`, Aktivierungszeit und letzter Kontakt;
- Zeitpunkt und Typ des letzten verarbeiteten Webhook-Events;
- Supportstatus.

Nicht speichern:

- TikTok-Benutzername des Creators im Billing-System;
- Zuschaueridentitäten oder Chatnachrichten;
- lokale Profile, Abstimmungen oder Historie;
- vollständige Zahlungsdaten.

### Webhook-Sicherheit

- Signatur auf dem unveränderten Request-Body prüfen.
- Zeitstempel-Toleranz anwenden.
- Event-ID zur Idempotenz speichern.
- Ereignisse dürfen in beliebiger Reihenfolge eintreffen; Status aus Provider-Daten nachvollziehbar abgleichen.
- Unbekannte Eventtypen protokollieren, aber erfolgreich quittieren, wenn die Signatur gültig ist.
- Keine personenbezogenen Inhalte in Logs schreiben.
- Sandbox und Produktion strikt über getrennte Schlüssel, URLs, Produkte und Datenbanken trennen.

## Entitlement-API und Feature Gates

Eine gemeinsame Definition in `shared/` ist die einzige Quelle für Produktfähigkeiten:

```ts
type Feature =
  | 'custom-triggers'
  | 'multi-option-polls'
  | 'parallel-counters'
  | 'multiple-profiles'
  | 'history'
  | 'csv-export'
  | 'premium-templates'
  | 'custom-branding'
  | 'priority-support';

type Entitlements = {
  plan: 'free' | 'pro';
  features: ReadonlySet<Feature>;
  limits: {
    profiles: number;
    counters: number;
    pollOptions: number;
    historyRecords: number;
  };
};
```

- Geschäftslogik prüft Entitlements vor jeder schreibenden Aktion.
- React blendet Funktionen nicht nur aus, sondern zeigt sie auffindbar mit Pro-Kennzeichnung und Nutzenbeschreibung.
- Tauri und Sidecar validieren dieselben Grenzen erneut. UI-Prüfungen allein sind keine Autorisierung.
- Der öffentliche Relay-Server validiert Pro-spezifische Kanal- und Assetoperationen serverseitig.
- Ein lokaler manipulierte Client darf höchstens lokale Funktionen freischalten können, niemals fremde Cloud-Ressourcen oder unbezahlte Serverkapazität.

## Bestehende Architektur weiterentwickeln

### `shared/`

- Versionierte Profil-, Counter-, Poll-, Snapshot-, Historien- und Entitlement-Typen.
- Reine Voting-Engine ohne React, Tauri oder Node-Abhängigkeiten.
- Normalisierung und Validierung aller Trigger.
- Tariflimits und Hilfsfunktionen wie `canUse`, `limitFor` und `requireFeature`.
- Migrationsfunktionen von den heutigen `Settings` und `VoteSnapshot`-Strukturen.

### `sidecar/`

- Eine `VotingEngine`, die mehrere unabhängige Zähler verwaltet.
- TikTok-Chat wird genau einmal normalisiert und anschließend gegen alle aktiven Zähler ausgewertet.
- Zuschauer-IDs bleiben nur in den flüchtigen Voter-Sets.
- Separate lokale Overlay-Routen pro Zähler, zum Beispiel `/overlay/:counterId`, plus `/overlay/all`.
- Relay veröffentlicht mehrere aggregierte Snapshots, aber keine Identitäten.
- Geschützte Asset-Auslieferung und MIME-Prüfung.
- Keine Billing-Geheimnisse im Sidecar.

### `src-tauri/`

- Profile und UI-Einstellungen versioniert und atomar speichern.
- Pro-Entitlement prüfen und über den App-Zustand bereitstellen.
- Aktivierungsgeheimnis mit einem geeigneten Windows-Credential-/Secret-Mechanismus speichern. Falls dafür ein Plugin nötig ist, dessen Berechtigungen minimal konfigurieren.
- Dateiöffnen/-speichern-Dialog für Logo, Hintergrund und CSV-Export.
- Historie lokal atomar verwalten.
- Vorhandene Capabilities nur um konkret erforderliche Aktionen erweitern.
- Checkout und Customer Portal ausschließlich über erlaubte HTTPS-URLs im Systembrowser öffnen.

### `src/`

- Navigation: `Live`, `Profile`, `Design`, `Historie`, `Pro`.
- Free-Nutzer sehen den vollständigen aktuellen Workflow ohne zusätzliche Reibung.
- Pro-Badges sind dezent und zugänglich.
- Upgrade-Dialog zeigt immer Preis, Abrechnungszeitraum, automatische Verlängerung und Kündigungsweg.
- Lizenzansicht: Status, Plan, Ablauf/Verlängerung, „Lizenz aktualisieren“, „Gerät deaktivieren“, „Abo verwalten“.
- Keine künstlichen Countdown-Timer, irreführenden Rabatte oder vorangekreuzten Kästchen.

### Webserver

Die bestehende passwortgeschützte Web-Dashboard-Instanz ist kein Mehrmandanten-Kundenkonto und bleibt davon getrennt.

Neue öffentliche Endpunkte klar trennen, beispielsweise:

```text
POST /api/v1/billing/checkout
POST /api/v1/billing/webhooks/paddle
POST /api/v1/licenses/activate
POST /api/v1/licenses/refresh
POST /api/v1/licenses/deactivate
POST /api/v1/assets/upload-intent
PUT  /api/v1/relay/:channelId
GET  /o/:channelId
GET  /o/:channelId/events
```

- Aktivierungs- und Refresh-Endpunkte streng rate-limiten.
- Datenbankmigrationen versionsgeführt ausführen.
- Für Version 1 PostgreSQL verwenden; lokaler Entwicklungsbetrieb darf einen separaten Compose-Service nutzen.
- Relay-Zustände dürfen weiterhin kurzlebig sein, Lizenz-, Abonnement-, Geräte- und Assetmetadaten nicht.
- Healthcheck unterscheidet Prozessbereitschaft und Abhängigkeiten.
- Strukturierte Logs mit Request-ID, aber ohne Tokens, Lizenzcodes oder personenbezogene Inhalte.

## Migration bestehender Installationen

### Einstellungen

- Die aktuelle Kombination aus `username`, `target` und `overlay` wird beim ersten Start einmalig in ein `schemaVersion: 2`-Dokument mit einem Profil und einem Single-Zähler migriert.
- Migration ist idempotent: erneutes Starten erzeugt keine Duplikate.
- Vor dem Umschreiben eine lokale Sicherung `settings.v1.backup.json` anlegen.
- Bei fehlerhafter Migration alte Einstellungen weiter laden und eine verständliche Fehlermeldung anbieten; niemals stillschweigend löschen.

### Online-Overlay

- Bestehende öffentliche Overlay-URLs bleiben gültig.
- Der vorhandene Relay-Schlüssel wird für den ersten Free-Zähler weiterverwendet.
- Zusätzliche Pro-Kanäle erhalten getrennte Schlüssel bzw. serverseitig abgeleitete Kanalberechtigungen.
- Ein Downgrade entfernt keine Profile oder Designs. Sie bleiben lokal erhalten, sind aber schreibgeschützt/inaktiv, bis Pro wieder aktiv ist. Das Free-Profil kann weiterhin bearbeitet werden.

### Designer

- Alle heute verfügbaren Farb-, Positions-, Größen- und Effektwerte bleiben Free.
- Nur neue Vorlagen, neue Effekte, Logo, Schriften und Hintergrundbild sind Pro.
- „Standard wiederherstellen“ muss für Free und Pro weiterhin funktionieren.

## Datenschutz, Recht und Kommunikation

Vor öffentlichem Verkauf müssen vorhanden sein:

- Impressum;
- Datenschutzerklärung für Website, Billing, Lizenzdienst, Support und Relay;
- AGB bzw. klare Nutzungsbedingungen;
- Preis- und Verlängerungshinweise;
- Widerrufs-/Erstattungsprozess für digitale Leistungen;
- Kündigungs- und Customer-Portal-Link;
- Auftragsverarbeitungs- und Unterauftragnehmerübersicht, soweit erforderlich;
- Kontaktadresse für Datenschutz- und Supportanfragen.

Rechtstexte nicht von Claude erfinden und ungeprüft veröffentlichen. Entwürfe dürfen technische Datenflüsse dokumentieren, müssen vor Veröffentlichung fachlich/rechtlich geprüft werden.

Die bestehende Aussage „kein offizielles Produkt von TikTok“ bleibt sichtbar. Keine TikTok-Logos verwenden und keine Partnerschaft suggerieren.

## Teststrategie

### Unit-Tests

- Trigger-Normalisierung einschließlich Unicode und Emoji-Varianten.
- Eindeutige, doppelte, verschobene, zurückgenommene und mehrdeutige Stimmen.
- Unabhängigkeit paralleler Zähler.
- Tariflimits an allen Grenzwerten.
- Free-Fallback bei fehlendem, ungültigem und abgelaufenem Entitlement.
- Signatur- und Ablaufprüfung mit kontrollierter Uhr.
- Settings-Migration v1 nach v2 und wiederholte Migration.
- Historienbegrenzung und CSV-Injection-Schutz.
- Overlay- und Assetvalidierung.

### Komponenten-Tests

- Bestehender Free-Workflow bleibt unverändert nutzbar.
- Pro-Funktionen sind auffindbar, aber korrekt gegated.
- Upgrade-Hinweise erscheinen nicht während kritischer Streamaktionen.
- Profilwechsel- und Resetbestätigung.
- Lizenzaktivierung, Offline-Gnadenfrist, Kündigung, Ablauf und Wiederherstellung.
- Historienfilter und CSV-Export.
- Designer mit fehlenden/gelöschten Assets.
- Tastaturbedienung, Fokus, Labels, Kontrast und reduzierte Bewegung.

### Integrations-Tests

- TikTok-Chat → mehrere Voting-Zähler → Tauri-Zustand → lokale Overlays.
- Desktop → mehrere öffentliche Relay-Kanäle → SSE-Overlays.
- Free-Client kann keinen zweiten Cloud-Kanal veröffentlichen.
- Webhook-Signatur, Wiederholung, falsche Reihenfolge und Chargeback.
- Aktivierung auf bis zu drei Geräten und Ablehnung des vierten.
- Serverausfall während eines Streams beeinträchtigt lokales Overlay nicht.
- Downgrade während aktiver Runden beendet oder löscht nichts.
- Update einer alten Installation erhält Einstellungen und bestehende Overlay-URL.

### Release-Prüfung

Vor jedem Release mindestens:

```powershell
npm run version:check
npm run typecheck
npm test
npm run test:rust
npm run build
npm run build:web
npm run build:server
```

Zusätzlich einen gepackten Windows-Installer auf einer sauberen Windows-10- oder Windows-11-Umgebung testen: Neuinstallation, Update, Lizenzaktivierung, Offline-Start, lokales Overlay, öffentliches Overlay, Export und Deinstallation.

## Observability und Betrieb

- Metriken für aktive Relay-Kanäle, SSE-Verbindungen, Publish-Rate, Antwortlatenz und Fehlerquote.
- Metriken für Checkout begonnen/erfolgreich, Aktivierungsfehler, Refresh-Fehler, Kündigungen und unfreiwilligen Churn nur aggregiert.
- Alarme für Webhook-Fehler, hohe 5xx-Rate, Datenbankausfall, Object-Store-Ausfall und Relay-Kapazität.
- Automatisierte verschlüsselte Datenbank-Backups und dokumentierter Restore-Test.
- Asset-Lifecycle und Kostenlimits einrichten.
- Keine bezahlte SLA versprechen, bevor Monitoring, Backups und Bereitschaft dafür tatsächlich existieren.

## Umsetzungsreihenfolge und Commits

Jeder Punkt wird als eigener Commit abgeschlossen. Nur zugehörige Dateien stagen. Fremde Änderungen nicht anfassen. Vor jedem Commit mindestens Typecheck und relevante Tests, am Ende jeder Phase die vollständige Prüfsuite ausführen.

### Phase 0 – Nachfrage validieren

#### 1. Pro-Seite und unverbindliche Warteliste

- Featurevergleich, geplante Preise und FAQ ergänzen.
- Interesse messen, aber noch keinen Kauf vortäuschen.
- E-Mail nur mit Einwilligung speichern und Abmeldung anbieten.

Commit:

```text
feat(web): add FlagCount Pro preview and waitlist
```

**Go/No-Go:** Billing erst beginnen, wenn mindestens zehn externe Creator FlagCount wiederholt in echten Streams genutzt haben und mindestens fünf zu 59 EUR jährlich kaufen oder verbindlich vorbestellen würden.

### Phase 1 – Domänenmodell ohne Paywall

#### 3. Versionierte Profile und Migration

- `StreamProfile`, v2-Einstellungen, Validierung und v1-Migration.
- Bestehende App verhält sich danach weiterhin wie bisher.

Commit:

```text
refactor(settings): introduce versioned stream profiles
```

#### 4. Voting-Engine für mehrere Zähler und Optionen

- Neue reine Engine und vollständige Unit-Tests.
- Kompatibilitätsadapter für den bisherigen Flaggenzähler.

Commit:

```text
feat(voting): support configurable counters and polls
```

#### 5. Mehrfach-Snapshots durch Sidecar und Tauri

- Protokoll versionieren und alten Zustand kontrolliert migrieren.
- Keine Chat- oder Identitätsdaten an UI oder Relay geben.

Commit:

```text
refactor(protocol): carry multiple voting snapshots
```

### Phase 2 – Entitlements und Billing

#### 6. Gemeinsames Entitlement-Modell

- Free/Pro-Fähigkeiten und Limits zentral definieren.
- Alle Grenzfälle testen, noch ohne Checkout.

Commit:

```text
feat(pro): add shared entitlement model
```

#### 7. Persistenter Lizenzdienst

- PostgreSQL, Migrationen, Provider-Abstraktion, Rate-Limits und strukturierte Logs.
- Lokale Entwicklungsumgebung ergänzen.

Commit:

```text
feat(server): add persistent license service
```

#### 8. Paddle-Checkout und Webhooks

- Sandbox zuerst, Signatur- und Idempotenztests verpflichtend.
- Customer Portal und Statussynchronisation.

Commit:

```text
feat(billing): integrate Paddle subscriptions
```

#### 9. Desktop-Lizenzaktivierung

- Sicherer Secret-Speicher, signierte Entitlements, Refresh und Offline-Gnadenfrist.
- Lizenzstatus und Wiederherstellung in der UI.

Commit:

```text
feat(pro): add secure desktop license activation
```

### Phase 3 – Pro-Produktfunktionen

#### 10. Profilverwaltung

- Erstellen, duplizieren, umbenennen, wechseln und löschen.
- Free-/Pro-Limits durchgängig validieren.

Commit:

```text
feat(profiles): add multi-profile management
```

#### 11. Eigene Trigger und Poll-Editor

- Emoji-/Textauslöser, zwei bis sechs Optionen und verständliche Konfliktprüfung.

Commit:

```text
feat(polls): add custom triggers and multiple choices
```

#### 12. Parallele Runden und Dashboard

- Bis zu vier aktive Zähler, gezieltes manuelles Abstimmen und Einzel-/Gesamtreset.

Commit:

```text
feat(pro): add parallel live counters
```

#### 13. Mehrere lokale und öffentliche Overlays

- Stabile URLs je Zähler und kombinierte Übersicht.
- Free-Relay bleibt rückwärtskompatibel.

Commit:

```text
feat(overlay): support multiple counter overlays
```

#### 14. Premium-Vorlagen und Animationen

- Mindestens fünf Vorlagen, responsive Darstellung und Reduced-Motion-Fallback.

Commit:

```text
feat(pro): add premium overlay themes
```

#### 15. Logo, Schriften und Hintergründe

- Sichere lokale Imports, CSP, Assetverwaltung und Cloud-Upload für öffentliche Overlays.

Commit:

```text
feat(pro): add custom overlay branding
```

#### 16. Aggregierte Historie

- Lokale Speicherung abgeschlossener Runden, Filterung, Löschen und Limitierung.

Commit:

```text
feat(pro): add private round history
```

#### 17. Sicherer CSV-Export

- BOM, Semikolon, korrekte Escapes und Schutz vor Spreadsheet-Formeln.

Commit:

```text
feat(pro): export aggregated round statistics
```

### Phase 4 – Verkauf und Launch

#### 18. Preis- und Checkout-Seite

- Verbindliche Produktmatrix, Monats-/Jahrespreis, Steuerhinweise, FAQ und Customer Portal.
- Bestehender kostenloser Download bleibt prominent.

Commit:

```text
feat(web): launch FlagCount Pro pricing and checkout
```

#### 19. Priorisierter Support

- Support-Link mit bereinigter Diagnose, Lizenzreferenz und Einwilligung.
- Keine Logs automatisch mitsenden.

Commit:

```text
feat(pro): add priority support flow
```

#### 20. Recht, Dokumentation und Betriebsrunbooks

- Geprüfte Rechtstexte einbinden.
- Billing-, Refund-, Incident-, Backup- und Lizenz-Support-Runbooks dokumentieren.

Commit:

```text
docs: prepare FlagCount Pro operations and compliance
```

#### 21. Vollständige Regression und Release

- Tests, Migrationstest, Installer-Smoke-Test, Sandbox-Kauf und kontrollierter Produktionskauf.
- Changelog und README aktualisieren.

Commit:

```text
release: prepare FlagCount Pro launch
```

## Abnahmekriterien

### Free

- Eine bestehende Installation aktualisiert ohne Datenverlust.
- Rote Flagge stimmt ab, weiße Flagge zieht zurück, eine Stimme pro Zuschauer und Runde.
- Lokales und bestehendes Online-Overlay funktionieren ohne Kauf.
- Das vorhandene Design bleibt einstellbar.
- Ohne Lizenz, ohne Netz und bei Ausfall des Billing-Servers startet die App normal im Free-Modus.

### Pro

- Erfolgreicher Sandbox-/Produktionskauf aktiviert Pro ohne Neuinstallation.
- Lizenz lässt sich auf bis zu drei Geräten aktivieren und wiederherstellen.
- Zwei bis sechs Optionen, eigene Trigger und Stimmwechsel funktionieren deterministisch.
- Vier parallele Zähler aktualisieren getrennte und kombinierte Overlays sofort.
- Zehn Profile lassen sich verlustfrei verwalten.
- Logo, Schrift, Hintergrund und Premium-Themes funktionieren lokal und online.
- Bis zu 500 aggregierte Runden sind lokal sichtbar und sicher exportierbar.
- Kündigung erhält Zugriff bis Periodenende; danach erfolgt ein verlustfreier Free-Fallback.

### Sicherheit und Datenschutz

- Gefälschte, abgelaufene oder für ein anderes Gerät ausgestellte Entitlements werden abgelehnt.
- Unsigned/invalid Paddle-Webhooks ändern keine Daten.
- Lizenz- und Relay-Endpunkte sind rate-limited.
- Keine Zuschaueridentität und kein Chattext erscheint in Persistenz, Logs, Billing oder Relay.
- Uploads akzeptieren nur erlaubte Rasterbilder innerhalb der Größenlimits.
- Tokens, Aktivierungscodes und Provider-Schlüssel erscheinen nicht in UI, Logs oder URLs.

### Qualität

- TypeScript-, Rust-, Unit-, Komponenten- und Integrationstests sind grün.
- Alle neuen UI-Flows sind per Tastatur bedienbar und besitzen zugängliche Namen.
- Dashboard und Overlay bleiben bei Reconnect, Serverausfall und ungültigen Daten stabil.
- Free-Nutzer erhalten keine störenden Upgrade-Popups während eines Streams.

## Kennzahlen nach Launch

Wöchentlich auswerten, nur aggregiert:

- Aktivierung: erster erfolgreicher Stream mit mindestens zehn Stimmen und geöffnetem Overlay.
- 7-/30-Tage-Retention aktiver Creator.
- Anteil wiederkehrender Creator mit mindestens zwei Streams pro Woche.
- Aufrufe der Pro-Seite → Checkout begonnen → Kauf erfolgreich.
- Free-zu-Pro-Konversion.
- Monats- und Jahresplananteil.
- freiwilliger und unfreiwilliger Churn.
- Aktivierungs-/Refresh-Fehlerquote.
- Relay-Verfügbarkeit und Kosten pro aktivem Creator.
- Supportanfragen pro 100 aktive Creator.

Keine Zielzahlen durch irreführende UI optimieren. Produktentscheidungen zuerst an wiederholter realer Streamnutzung und anschließend an bezahlter Bindung ausrichten.

## Späterer Ausbau: Gifts und Agenturen

Erst nach einem stabilen Pro-Launch evaluieren:

1. TikTok-Geschenkereignisse in ein separates, getestetes internes Format überführen.
2. Gift-/Coin-Ziele und Geschenk-gewichtete Optionen als Pro-Funktion testen.
3. Niemals TikTok-Zahlungen selbst abwickeln oder einen Anteil an Gifts versprechen.
4. Agenturplan mit mehreren Creator-Lizenzen, Rollen und zentralen Marken-Templates nur nach nachgewiesener Nachfrage entwickeln.
5. Möglicher Agenturpreis als Hypothese: 49 EUR monatlich für bis zu fünf Creator; vor Umsetzung durch Interviews validieren.

## Definition of Done für das Gesamtprojekt

FlagCount Pro ist erst fertig, wenn ein neuer Kunde den gesamten Weg ohne manuelle Datenbankeingriffe durchlaufen kann: Preis verstehen, kaufen, Lizenz erhalten, Desktop-App aktivieren, Pro-Funktionen verwenden, öffentliches Overlay betreiben, Abo verwalten, auf einem neuen Gerät wiederherstellen und kündigen. Gleichzeitig muss ein Free-Nutzer die bisherige App ohne Konto, Kaufdruck oder Funktionsverlust weiterverwenden können.
