import type { LicenseState } from '../../shared/licensing';
import type { Tone } from '../components/ui';

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

export function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

export type LicenseDescription = {
  title: string;
  detail: string;
  badge: { tone: Tone; label: string };
};

/** What the license status means for the streamer, without internal keys or signature details. */
export function describeLicense(license: LicenseState): LicenseDescription {
  const until = formatDate(license.expiresAt);
  switch (license.status) {
    case 'active':
      return {
        title: 'Audience Live Pro ist aktiv',
        detail: until ? `Auf diesem Computer bestätigt bis ${until}. Audience Live verlängert das automatisch, solange das Abo läuft.` : '',
        badge: license.needsRefresh ? { tone: 'warning', label: 'Aktualisierung nötig' } : { tone: 'success', label: 'Aktiv' }
      };
    case 'grace':
      return {
        title: 'Audience Live Pro ist aktiv – Zahlung offen',
        detail: 'Die letzte Zahlung konnte nicht eingezogen werden. Bitte prüfe deine Zahlungsmethode unter „Abo verwalten“.',
        badge: { tone: 'warning', label: 'Zahlung offen' }
      };
    case 'expired':
      return {
        title: 'Pro ist auf diesem Computer nicht mehr aktiv',
        detail: 'Audience Live läuft im Free-Modus weiter. Deine Profile und Designs bleiben erhalten.',
        badge: { tone: 'danger', label: 'Abgelaufen' }
      };
    case 'invalid':
      return {
        title: 'Die Lizenz konnte nicht bestätigt werden',
        detail: 'Audience Live läuft im Free-Modus weiter. Deine Profile und Designs bleiben erhalten.',
        badge: { tone: 'danger', label: 'Nicht bestätigt' }
      };
    case 'none':
      return license.lastError === 'license-inactive'
        ? {
            title: 'Diese Lizenz ist nicht aktiv',
            detail: 'Audience Live läuft im Free-Modus weiter. Deine Profile und Designs bleiben erhalten.',
            badge: { tone: 'danger', label: 'Gesperrt' }
          }
        : {
            title: 'Du nutzt Audience Live Free',
            detail: 'Rote Flaggen zählen, lokales und Online-Overlay sowie der Designer bleiben dauerhaft kostenlos – ohne Konto.',
            badge: { tone: 'neutral', label: 'Free' }
          };
  }
}
