import type { AppErrorCode } from '../../shared/appState';

export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  'invalid-username':
    'Bitte gib einen gültigen TikTok-Benutzernamen ein (2–24 Zeichen: Buchstaben, Zahlen, Punkt oder Unterstrich).',
  'user-offline': 'Dieser Nutzer ist gerade nicht live. Starte den Livestream und versuche es erneut.',
  'user-not-found': 'Dieser TikTok-Nutzer wurde nicht gefunden. Bitte prüfe den Benutzernamen.',
  'rate-limited': 'TikTok hat zu viele Verbindungsversuche erkannt. Bitte warte einen Moment und versuche es erneut.',
  network: 'Keine Verbindung zu TikTok möglich. Bitte prüfe deine Internetverbindung.',
  'stream-ended': 'Der Livestream wurde beendet.',
  'reconnect-failed':
    'Die Verbindung zum Livestream konnte nicht wiederhergestellt werden. Bitte verbinde dich erneut.',
  'invalid-target': 'Das Stimmenziel muss eine ganze Zahl zwischen 1 und 100.000 sein.',
  'invalid-overlay-settings': 'Die Overlay-Einstellungen sind ungültig. Bitte prüfe Farben, Größe und Deckkraft.',
  'invalid-code': 'Dieser Aktivierungscode ist ungültig. Bitte prüfe ihn in deiner Kauf-E-Mail.',
  'invalid-installation': 'Dieser Computer konnte der Lizenz nicht zugeordnet werden. Bitte starte FlagCount neu.',
  'invalid-profile': 'Dieses Profil konnte nicht geändert werden. Profilnamen brauchen 1 bis 60 Zeichen, und ein Profil muss bleiben.',
  'pro-required': 'Diese Funktion gehört zu FlagCount Pro. Unter „Pro“ erfährst du mehr – deine Einstellungen bleiben erhalten.',
  'sidecar-unavailable': 'Der Verbindungsdienst läuft nicht. Bitte starte FlagCount neu.',
  unknown: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.'
};

/** German, user-facing text for an error code; unknown codes get a generic message. */
export function getErrorMessage(code: string): string {
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code as AppErrorCode] : ERROR_MESSAGES.unknown;
}
