# Twitch in Audience Live

Die Desktop-App liest den Chat des eigenen Twitch-Kanals über die offizielle EventSub-WebSocket-API. Dafür wird der OAuth Device Code Grant eines öffentlichen Clients verwendet; ein Client Secret gehört weder in die App noch in dieses Repository.

## Einrichtung

1. Eine Twitch-Anwendung registrieren und deren Client-ID beim Build als `TWITCH_CLIENT_ID` setzen.
2. Im Cockpit **Twitch** und **Mit Twitch anmelden** wählen.
3. Den angezeigten Gerätecode bei Twitch bestätigen. Audience Live fordert ausschließlich `user:read:chat` an.
4. Sobald der eigene Kanal live ist, **Eigenen Kanal verbinden** wählen.

Twitch ist im Browser-Dashboard bewusst deaktiviert, bis OAuth-Tokens und Live-Controller vollständig pro Websitzung isoliert sind.

## Datenschutz und Sicherheit

- Access- und Refresh-Token werden nur im nativen Secret Store des Betriebssystems gespeichert und nie in Einstellungen oder Logs geschrieben.
- Chattexte und Zuschauer-IDs werden flüchtig im lokalen Sidecar ausgewertet. Sie gelangen nicht in Verlauf, Overlay, Relay oder Logdateien.
- **Twitch-Konto trennen** löscht die lokale Autorisierung und sendet einen Widerruf an Twitch.
- Audience Live liest Chatnachrichten, schreibt aber nicht in den Chat und fordert keine Moderations-, Abonnement- oder Zahlungsrechte an.

Audience Live ist kein offizielles Twitch-Produkt. Twitch-Marken gehören ihren jeweiligen Inhabern; es wird keine Partnerschaft behauptet.
