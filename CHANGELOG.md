# Änderungsverlauf

## Noch nicht veröffentlicht

- Twitch ist in der Desktop-App als zweite, exklusive LIVE-Quelle verfügbar: Device-Code-Anmeldung mit `user:read:chat`, nativer Token-Speicher, EventSub-Chat, Deduplizierung, Reconnect und Streamende-Erkennung. Das Browser-Dashboard kennzeichnet Twitch bis zur mandantenfähigen Web-OAuth-Umsetzung als Desktop-Funktion.
- Neues Design im Stil des Audience-Live-Logos: Indigo, Cyan und Violett ersetzen das FlagCount-Rot in App, Web-Dashboard und Website; Rot steht nur noch für Fehler und Löschen. Das Logo ersetzt die rote Flagge in Seitenleiste, Web-Login und Admin-Bereich.
- Die Desktop-App ist neu gestaltet: Die Seitenleiste gruppiert Cockpit, Zähler & Abstimmungen, Overlays, Profile, Historie, Pro & Lizenz und Einstellungen in Stream, Einrichten und Konto. Eine Kopfleiste zeigt auf jeder Seite LIVE-Verbindung, laufendes Profil mit Wechsel und Tarif.
- Das Cockpit ist die Startseite: Verbinden, offene Einrichtungsschritte und alle laufenden Runden auf einer Seite. Hinweise auf Pro-Funktionen sind kompakter.
- Zähler und Abstimmungen entstehen mit dem Assistenten „Neues Element“ in höchstens sechs Schritten. Elemente lassen sich duplizieren, sortieren und löschen und werden ausdrücklich gespeichert; ungespeicherte Änderungen gehen beim Verlassen nicht unbemerkt verloren.
- Das Cockpit zeigt bis zu vier Zähler und Abstimmungen nebeneinander, mit Führung, Anteilen, Zielen und großen Plus-/Minus-Schaltflächen. Chat-Auslöser erscheinen als Chips, das Stimmenziel öffnet sich über „Ziel ändern“. Reset und Profilwechsel werden in einem Dialog bestätigt; die bisherige Rückfrage, die sich nach fünf Sekunden selbst abbrach, entfällt.
- Jedes Element hat ein eigenes Overlay mit eigenem Design, lokaler und Online-URL sowie einer Einrichtungsanleitung für OBS und TikTok LIVE Studio. Die Gesamtansicht zeigt alle Elemente mit ihren eigenen Designs. Bestehende Overlay-URLs bleiben gültig.
- Profile, Historie (mit Kennzahlen, Filter, Details und Rückmeldung zum CSV-Export) und Pro & Lizenz (mit freigeschalteten Funktionen, Grenzen und einer Diagnose, falls Pro-Funktionen fehlen) sind neu gestaltet.
- Nach der Aktivierung ist Pro ohne Neustart freigeschaltet. Nicht verfügbare Pro-Funktionen bleiben sichtbar und erklären, was fehlt.
- Das Fenster startet größer und hat eine Mindestgröße von 800 × 600 Pixeln. Alle Bereiche sind per Tastatur bedienbar und respektieren reduzierte Bewegung.
- Audience Live Pro wird über Stripe verkauft: Checkout, Kundenportal für Rechnungen, Zahlungsmethode und Kündigung sowie Lizenzwiederherstellung per E-Mail. Ein Audience-Live-Konto ist weiterhin nicht nötig.
- Lizenzen folgen dem aktuellen Stand des Stripe-Abos; der Aktivierungscode kommt erst nach bestätigter Zahlung.
- Die Desktop-App öffnet Stripe Checkout und das Stripe-Kundenportal.
- Die Seiten `/pro` und `/pro/erfolgreich` sind erreichbar und zeigen die aktuellen Preise.
- Neuer Admin-Bereich mit GitHub-Anmeldung für Support: Lizenzen suchen, Installationen deaktivieren, Codes erneuern, Lizenzen sperren und manuelle Lizenzen vergeben – mit Audit-Protokoll.

## 0.3.0 – 2026-09-14

- FlagCount Pro eingeführt: sichere Lizenzaktivierung in der Desktop-App, Abos über Paddle und öffentliche Preis-/Checkout-Seite.
- Mehrere parallele Live-Zähler, eigene Umfragen mit individuellen Auslösern und mehreren Antwortmöglichkeiten.
- Mehrere Stream-Profile verwalten.
- Mehrere Zähler-Overlays gleichzeitig; Pro-Overlays mit Premium-Themes und eigenem Branding.
- Private Rundenhistorie mit aggregierten Statistiken und sicherem CSV-Export.
- Priorisierter Support für Pro-Kunden.
- Die Free-Version funktioniert weiterhin ohne Lizenz und ohne Konto.

## 0.2.3 – 2026-09-13

- Zuschauer können ihre Stimme mit einer weißen Flagge (`🏳️`) im Chat zurücknehmen.
- Die zurückgenommene Stimme wird sofort aus Dashboard und Streaming-Overlay entfernt.
- Ein Hinweis im Dashboard erklärt die rote und weiße Flagge.

## 0.2.2 – 2026-09-13

- Visuellen Overlay-Designer für Farben, Position, Größe und Effekte ergänzt.
- Flaggenanimation bei neuen Stimmen und Ziel-Feier hinzugefügt.
- Tauri-Dashboard kompakter und übersichtlicher gestaltet.
- Einleitungstext von der öffentlichen Downloadseite entfernt.

## 0.2.1 – 2026-09-13

- Online-URL für das Streaming-Overlay ergänzt, damit es auch in TikTok LIVE Studio funktioniert. Die App überträgt dafür nur Zählerstand, Ziel und Darstellung, keine Chat-Inhalte.
- Streaming-Overlay skaliert sich jetzt auf die Größe der Quelle und sitzt mittig statt klein in der Ecke.
- Dashboard kompakter gestaltet.

## 0.2.0 – 2026-09-13

- Signierte automatische Updates über GitHub Releases ergänzt.
- Automatische Startprüfung und manuelle Updateprüfung mit Downloadfortschritt ergänzt.
- Manuelles Hinzufügen von Flaggen ermöglicht, auch ohne aktive TikTok-Verbindung.
- Verbindungsstatus vereinfacht und erfolgreichen Verbindungen einen grünen Leuchteffekt gegeben.
- „OBS-Overlay“ in „Streaming-Overlay“ umbenannt.
## Audience Live 0.6.0

- FlagCount wird zu Audience Live umbenannt.
- Bestehende Einstellungen, Lizenzen und lokale Daten bleiben beim Update erhalten.
- Neues Audience-Live-App-Icon sowie aktualisierte Website- und Release-Metadaten.
