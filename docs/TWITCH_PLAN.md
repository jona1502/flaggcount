# FlagCount Twitch-Integration – Umsetzungsplan

## Ziel

FlagCount soll Twitch neben TikTok als gleichwertige Quelle für Chat-Stimmen unterstützen. Nutzer wählen eine Plattform, verbinden den gewünschten Kanal und verwenden danach dieselben Zähler, Abstimmungen, Profile, Verläufe und Overlays wie bisher.

Die erste Version unterstützt genau **eine aktive Chatquelle gleichzeitig**. Ein paralleler TikTok- und Twitch-Betrieb ist ausdrücklich nicht Teil dieses Vorhabens. Diese Grenze hält Zustände, Rundengültigkeit, Fehlerbehandlung und Bedienung eindeutig; die interne Architektur darf eine spätere Mehrfachverbindung aber nicht verhindern.

## Analyse des aktuellen Stands

Die Voting- und Overlay-Kerne sind bereits weitgehend plattformneutral:

- `shared/voting/VotingEngine.ts` benötigt nur eine stabile Zuschauer-ID und den normalisierten Kommentar.
- `SidecarApp` leitet Chatnachrichten an alle aktiven Zähler weiter.
- Zähler, Profile, Verlauf sowie lokale und öffentliche Overlays benötigen keine Twitch-spezifische Änderung.

Die Live-Verbindung selbst ist dagegen fest an TikTok gekoppelt:

- `sidecar/src/app.ts` besitzt direkt einen `TikTokLiveService`.
- `sidecar/src/index.ts` und `sidecar/src/web/index.ts` erzeugen ausschließlich `createTikTokConnection`.
- `sidecar/src/protocol.ts` nennt nur `username`; `ChatMessage` und Kommentare dokumentieren TikTok als Quelle.
- `shared/appState.ts` kennt weder Plattform noch Authentifizierungszustand.
- `shared/profiles.ts`, Rust-Settings, Tauri-Commands und Web-API speichern nur den letzten TikTok-Benutzernamen.
- `ConnectionPanel`, Statusleiste, Setup-Schritte und Fehlermeldungen sprechen ausschließlich von TikTok.
- Der Browser-Controller ist aktuell ein einzelner serverweiter Live-Controller. Twitch-Tokens dürfen dort nicht global mit einer beliebigen Browsersitzung geteilt werden.

Eine zweite Sonderimplementierung neben `TikTokLiveService` würde diese Kopplung verdoppeln. Zuerst wird daher ein gemeinsamer Plattformvertrag eingeführt, anschließend werden TikTok und Twitch als Adapter dahinter betrieben.

## Verbindliche Twitch-Technik

Twitch wird über die offizielle Twitch-API umgesetzt:

- OAuth für eine installierte App über den **Device Code Grant**, ohne ausgeliefertes Client Secret.
- Nur der minimale Scope `user:read:chat`; FlagCount sendet keine Chatnachrichten.
- Chat über **EventSub WebSocket** und Subscription `channel.chat.message` Version `1`.
- `broadcaster_user_id` und `user_id` entsprechen in Version 1 dem angemeldeten Kanalinhaber. Damit verbindet die erste Version immer den eigenen Twitch-Kanal; ein frei eingegebener fremder Kanal wird nicht angeboten.
- Helix `/users` beziehungsweise Token-Validierung liefert die stabile Kanalidentität; die im Event enthaltene `chatter_user_id` ist die stabile Zuschauer-ID.
- `stream.online` und `stream.offline` oder eine Helix-Live-Prüfung bilden den LIVE-Status ab. Nur Chatnachrichten während des verbundenen LIVE-Zustands werden gezählt.
- EventSub liefert mindestens einmal. Vor der Voting-Engine werden EventSub-`message_id` beziehungsweise Chat-`message_id` in einem begrenzten TTL-Cache dedupliziert.
- `session_welcome`, Keepalive-Timeout, `session_reconnect`, Socketverlust, Resubscribe und Subscription-Revocation werden explizit behandelt. Beim Twitch-Reconnect-URL-Wechsel bleibt die alte Verbindung bis zum Welcome der neuen Verbindung offen.
- Access- und Refresh-Token werden nie geloggt, nie an React gesendet und auf Desktop im vorhandenen Windows-Credential-Manager-Konzept abgelegt. Der Twitch Client ID ist Konfiguration, kein Geheimnis.
- Drittanbieterhinweis und Datenschutzerklärung werden um Twitch ergänzt; Twitch-Marken oder eine Partnerschaft werden nicht suggeriert.

Referenzen (Stand 15. September 2026):

- [Twitch: Installed Chatbots und EventSub-Authentifizierung](https://dev.twitch.tv/docs/chat/authenticating/)
- [Twitch: OAuth-Tokens und Device Code Grant](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Twitch: EventSub über WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
- [Twitch: EventSub Subscription Types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)

## Zielmodell

```text
React UI / Web UI
        │
        ▼
plattformneutrale Commands und AppState
        │
        ▼
LiveChatService ──────── ConnectionState + sichere Fehler
        │
        ├── TikTokAdapter ── tiktok-live-connector
        │
        └── TwitchAdapter ── OAuth + Helix + EventSub WebSocket
                              │
                              ▼
                    normalisierte ChatMessage
                              │
                              ▼
                 Message-Deduplizierung → VotingEngine
                              │
                              ▼
                  Verlauf, Dashboard und Overlays
```

Vorgeschlagene Kernformen:

```ts
type LivePlatform = 'tiktok' | 'twitch';

type LiveChannel = {
  platform: LivePlatform;
  channelId: string | null;
  login: string | null;
  displayName: string | null;
};

type ConnectionState = {
  status: 'disconnected' | 'authenticating' | 'connecting' | 'connected' | 'reconnecting';
  channel: LiveChannel | null;
  reconnect?: ReconnectInfo;
};

type ChatMessage = {
  platform: LivePlatform;
  messageId: string;
  userId: string;
  comment: string;
  receivedAt: number;
};
```

Der tatsächliche Typ darf zusätzliche rein interne Felder enthalten. Anzeigename, Login, Chattext und Zuschauer-ID dürfen weiterhin nicht im Verlauf oder Overlay-Relay landen.

## Commit-Plan

Jeder nummerierte Punkt ist genau **ein eigenständig baubarer und getesteter Commit**. Keine Misch-Commits; falls bei der Umsetzung ein Punkt zu groß wird, muss dieser Plan vorab in weitere nummerierte Punkte geteilt werden.

### 1. Plattformneutrales Live-Domainmodell einführen

- `LivePlatform`, `LiveChannel`, plattformbezogenen `ConnectionState` und normalisierte `ChatMessage` in `shared/` definieren.
- Das bestehende `username`-Modell kompatibel migrieren, ohne vorhandene TikTok-Einstellungen zu verlieren.
- Plattformneutrale Fehlercodes für Authentifizierung, fehlende Berechtigung, widerrufene Tokens und nicht konfigurierten Anbieter ergänzen.
- Parser-, Migrations- und Serialisierungstests in TypeScript und Rust ergänzen.

Commit:

```text
refactor(live): introduce platform-neutral connection model
```

### 2. TikTok hinter den gemeinsamen Adaptervertrag verschieben

- `TikTokLiveService` in einen allgemeinen Orchestrator für Connect, Disconnect und Backoff zerlegen.
- TikTok-Normalisierung, Fehlerklassifikation und Connector als `LiveChatAdapter` anbinden.
- Bestehendes TikTok-Verhalten inklusive Stream-Ende, Reconnect, Sanitizing und Tests unverändert erhalten.
- `SidecarApp`, Desktop-Einstieg und Web-Einstieg nur noch gegen den Adaptervertrag koppeln.

Commit:

```text
refactor(tiktok): move live chat behind provider adapter
```

### 3. Twitch-OAuth und sichere Desktop-Tokenablage implementieren

- Twitch Client ID über Build-/Deployment-Konfiguration bereitstellen und bei fehlender Konfiguration einen klaren Zustand anzeigen.
- Device-Code-Start, Browser-/Code-Anweisung, Polling, Abbruch, Token-Refresh, `/validate` und Logout implementieren.
- Access- und Refresh-Token analog zu Lizenzgeheimnissen im Windows Credential Manager speichern; Settings enthalten nur nicht geheime Kanalmetadaten.
- Protokoll-Events und Tauri-Commands für `startTwitchAuth`, Authstatus und `disconnectTwitchAccount` ergänzen; Protokollversion erhöhen.
- HTTP-Aufrufe mit gefälschtem Server testen: Erfolg, Pending, Ablehnung, Ablauf, Refresh, Revocation und redigierte Logs.

Commit:

```text
feat(twitch): add desktop oauth and secure token storage
```

### 4. Twitch-EventSub-Chatadapter implementieren

- EventSub-WebSocket öffnen und nach `session_welcome` `channel.chat.message` abonnieren.
- Twitch-Chatfragmente deterministisch in Klartext normalisieren; Emotes müssen als ihr Chattext erhalten bleiben, damit Emoji-/Texttrigger funktionieren.
- `chatter_user_id`, Chat-Message-ID und EventSub-Metadaten in das gemeinsame interne Nachrichtenformat überführen.
- Begrenzten TTL-/LRU-Deduplizierungscache vor der Voting-Engine ergänzen.
- Keepalive-Überwachung, Twitch-Reconnect-URL, harter Socketverlust mit Resubscribe und Revocation behandeln.
- Adaptertests ausschließlich gegen lokale WebSocket-/HTTP-Fakes ausführen; keine echten Tokens in Fixtures.

Commit:

```text
feat(twitch): receive deduplicated chat through eventsub
```

### 5. Twitch-LIVE-Lebenszyklus und gemeinsame Verbindungssteuerung anbinden

- Angemeldeten Nutzer per Helix auflösen und vor dem Zählen prüfen, ob dessen Stream live ist.
- Online-/Offline-Ereignisse abonnieren oder kontrolliert nachprüfen; bei Streamende den Zustand sauber beenden und `stream-ended` melden.
- `connect` um die ausgewählte Plattform erweitern und sicherstellen, dass ein Plattformwechsel die alte Verbindung zuerst beendet.
- Gewünschte Verbindung inklusive Plattform in Tauri merken, damit Sidecar-Neustarts nur gültige, autorisierte Sessions wiederherstellen.
- TikTok- und Twitch-Reconnects, App-Shutdown, schneller Plattformwechsel und verspätete Events alter Verbindungen testen.

Commit:

```text
feat(live): connect twitch channels through shared lifecycle
```

### 6. Desktop-Oberfläche für Plattformwahl und Twitch-Anmeldung ergänzen

- Im Connection Panel eine verständliche TikTok-/Twitch-Auswahl ergänzen.
- Für TikTok das heutige Benutzernamenfeld erhalten; für Twitch `Mit Twitch anmelden`, den Device Code und den angemeldeten eigenen Kanal zeigen.
- Statusleiste, Setup-Checkliste, Fehlerbanner und Toasts plattformspezifisch, aber konsistent formulieren.
- Während einer aktiven Verbindung Plattform und Ziel sperren; Wechsel erst nach Trennen erlauben.
- Tastaturbedienung, Fokusführung, Screenreader-Live-Regionen und responsive Darstellung testen.

Commit:

```text
feat(ui): add twitch account and platform controls
```

### 7. Browser-Dashboard Twitch-sicher und sitzungsgebunden machen

- Den heute globalen `WebController` pro angemeldeter FlagCount-Websession beziehungsweise Nutzer isolieren, bevor Twitch-Credentials angenommen werden.
- OAuth Authorization Code Grant serverseitig mit `state`, Redirect-Allowlist und verschlüsselter Tokenablage implementieren; kein Client Secret und kein Refresh-Token gelangen in den Browser.
- Twitch-Verbindungen beim Logout, Sessionablauf und Tokenwiderruf schließen.
- API, CSP, CSRF-Schutz, Rate Limits und Paralleltests für zwei voneinander isolierte Nutzer ergänzen.
- Falls diese sichere Isolation noch nicht produktreif ist, Twitch im Browser explizit als „nur in der Desktop-App verfügbar“ kennzeichnen; niemals Desktop-Tokens improvisiert wiederverwenden.

Commit:

```text
feat(web): isolate twitch oauth and live sessions
```

### 8. Produkttexte, Datenschutz und Betriebsdokumentation aktualisieren

- README, Onboarding, Overlay-Anleitungen, App-Beschreibungen und Website von „nur TikTok“ auf „TikTok und Twitch“ aktualisieren.
- Dokumentieren, dass Twitch eine Anmeldung und `user:read:chat` benötigt, welche Daten lokal verarbeitet werden und wie die Verbindung widerrufen wird.
- `.env.example`, Deployment-Variablen und Release-Checkliste um Twitch Client ID, Redirect-URL und produktive Twitch-App-Registrierung ergänzen.
- Markenhinweise für TikTok und Twitch ergänzen; keine offizielle Partnerschaft behaupten.

Commit:

```text
docs(twitch): document setup privacy and platform support
```

### 9. End-to-End-Abnahme und Release-Härtung abschließen

- Vollständigen Testlauf für TypeScript, Rust, Sidecar-Build, Web-Build und Windows-Paket ausführen.
- Einen lokalen EventSub-Fake für reproduzierbare E2E-Flows einbauen: Auth, LIVE, Vote, Rücknahme, doppeltes Event, Reconnect und Streamende.
- Manuelle Abnahme mit einem echten Twitch-Testkanal und der produktiv registrierten Redirect-URL dokumentieren.
- Prüfen, dass TikTok-Regressionsfälle, Overlays, Profile, History und Lizenzgrenzen unverändert funktionieren.
- Changelog und Versionsnummer erst nach bestandener Abnahme aktualisieren.

Commit:

```text
test(twitch): verify cross-platform live workflows
```

## Akzeptanzkriterien

- Der Nutzer kann zwischen TikTok und Twitch wählen und jeweils genau eine Quelle verbinden.
- Eine Twitch-Anmeldung fordert ausschließlich `user:read:chat` an und verbindet den eigenen Kanal.
- Rote Flaggen, Rücknahmen, freie Trigger und Poll-Optionen verhalten sich auf beiden Plattformen gleich.
- Eine Twitch-Zuschauer-ID zählt pro Runde und Zähler höchstens einmal; erneut zugestellte EventSub-Nachrichten verändern das Ergebnis nicht.
- Nach Twitch-Reconnect werden neue Nachrichten wieder gezählt, ohne alte Nachrichten doppelt anzuwenden.
- Bei Streamende, Tokenablauf, Berechtigungswiderruf und Netzfehler erhält der Nutzer einen verständlichen, handlungsorientierten Zustand.
- Tokens, Chattexte und Zuschaueridentitäten erscheinen weder in Logs noch in AppState, History, Relay oder Overlays.
- Bestehende Installationen behalten ihren TikTok-Kanal und starten nach der Settings-Migration ohne Neueinrichtung.
- TikTok funktioniert nach jedem Commit weiterhin; TypeScript-, Rust- und relevante E2E-Tests sind grün.

## Nicht Teil dieses Vorhabens

- Gleichzeitiges Zählen aus Twitch und TikTok in derselben Runde.
- Verbindung zu einem fremden Twitch-Kanal ohne Autorisierung des Broadcasters.
- Schreiben in den Twitch-Chat, Bots, Moderation, Bits, Subs, Raids oder Channel-Point-Rewards.
- Zusammenführen derselben Person über Plattformgrenzen hinweg.
- Speichern von Chatverläufen oder Zuschauerprofilen.

## Hauptrisiken und Gegenmaßnahmen

- **OAuth erhöht die Produktkomplexität:** Authentifizierung als eigener Commit mit Fake-Servern und sicherer Ablage isolieren.
- **EventSub ist mindestens-einmal:** Nachrichten vor dem Voting über IDs deduplizieren, nicht auf die bestehende Pro-Nutzer-Deduplizierung vertrauen.
- **Reconnect kann Events verlieren:** Twitch-Reconnect-URL korrekt übernehmen; nach einem echten Socketverlust transparent resubscriben und keine lückenlose Zustellung versprechen.
- **Browser-Mandantentrennung fehlt heute:** Web-Twitch erst freigeben, wenn Controller und Tokens strikt an die FlagCount-Sitzung gebunden sind.
- **Settings-Migration kann TikTok beschädigen:** alte `username`-Werte explizit nach `{ platform: 'tiktok', channelInput: ... }` migrieren und in Rust sowie TypeScript mit Fixtures absichern.
- **Twitch-App-Konfiguration ist extern:** Client ID, Redirect-URLs, Review-/Produktionsstatus und Widerrufsweg vor Release als manuelle Gates prüfen.
