import type { LicenseErrorCode } from '../../shared/licensing';

export const LICENSE_ERROR_MESSAGES: Record<LicenseErrorCode, string> = {
  'invalid-code': 'Dieser Aktivierungscode ist ungültig. Bitte prüfe ihn in deiner Kauf-E-Mail.',
  'license-inactive':
    'Diese Pro-Lizenz ist nicht aktiv, zum Beispiel nach einer Kündigung. FlagCount läuft im Free-Modus weiter.',
  'installation-limit': 'Diese Lizenz ist bereits auf drei Computern aktiv.',
  'invalid-installation':
    'Dieser Computer ist für die Lizenz nicht mehr aktiviert. Du kannst ihn mit deinem Code erneut aktivieren.',
  'rate-limited': 'Zu viele Versuche. Bitte warte einen Moment und versuche es dann erneut.',
  network: 'Der Lizenzserver ist gerade nicht erreichbar. Pro bleibt offline bis zum angezeigten Datum aktiv.',
  unavailable: 'Der Lizenzserver ist gerade nicht verfügbar. Bitte versuche es später erneut.',
  'invalid-response': 'Die Antwort des Lizenzservers konnte nicht bestätigt werden. Bitte aktualisiere FlagCount.',
  'secret-storage':
    'Die Lizenz konnte nicht sicher auf diesem Computer gespeichert werden. Nach einem Neustart musst du sie erneut aktivieren.'
};
