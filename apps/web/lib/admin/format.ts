import type { AdminLicenseSummary, ManualReason } from './types';

export const REASONS: Record<ManualReason, string> = {
  support: 'Support',
  creator: 'Creator',
  testing: 'Test',
  promotion: 'Aktion'
};

export const SUBSCRIPTION_STATUSES: Record<string, string> = {
  incomplete: 'Zahlung offen',
  incomplete_expired: 'Zahlung abgelaufen',
  trialing: 'Testphase',
  active: 'Aktiv',
  past_due: 'Zahlung überfällig',
  paused: 'Pausiert',
  unpaid: 'Unbezahlt',
  canceled: 'Beendet'
};

export const AUDIT_ACTIONS: Record<string, string> = {
  'manual-license-created': 'Manuelle Lizenz erstellt',
  'manual-validity-changed': 'Laufzeit geändert',
  'license-blocked': 'Gesperrt',
  'license-unblocked': 'Entsperrt',
  'note-changed': 'Hinweis geändert',
  'installation-deactivated': 'Installation deaktiviert',
  'code-renewed-shown': 'Neuer Code angezeigt',
  'code-renewed-emailed': 'Neuer Code per E-Mail'
};

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' });

export function formatDate(value: string | null): string {
  return value ? dateTime.format(new Date(value)) : '–';
}

/** Stripe and manual licenses must be told apart at a glance. */
export function sourceLabel(license: Pick<AdminLicenseSummary, 'source' | 'legacy' | 'manualReason'>): string {
  if (license.source === 'manual') return `Manuell · ${REASONS[license.manualReason ?? 'support']}`;
  const name = license.source === 'stripe' ? 'Stripe' : license.source === 'paddle' ? 'Paddle' : license.source;
  return license.legacy ? `${name} (früherer Anbieter)` : name;
}

export function accessLabel(license: Pick<AdminLicenseSummary, 'access'>): string {
  if (!license.access) return 'Kein Pro-Zugriff';
  const until = license.access.endsAt ? ` bis ${formatDate(license.access.endsAt)}` : '';
  return license.access.status === 'grace' ? `Gnadenfrist${until}` : `Aktiv${until}`;
}

/** Backend error codes as messages for administrators. */
export function adminErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'invalid-input': 'Die Eingabe ist ungültig.',
    'not-found': 'Die Lizenz wurde nicht gefunden.',
    'provider-managed': 'Das wird im Stripe-Dashboard geändert, nicht hier.',
    'no-email': 'Für diese Lizenz ist keine Kauf-E-Mail-Adresse verfügbar.',
    'installation-not-found': 'Diese Installation ist nicht mehr aktiv.',
    'licensing-unavailable': 'Der Lizenzdienst ist gerade nicht verbunden.',
    'backend-unreachable': 'Der Lizenzdienst ist nicht erreichbar.',
    'admin-unavailable': 'Der Admin-Bereich ist nicht vollständig eingerichtet.',
    'rate-limited': 'Zu viele Anfragen. Bitte warte kurz.',
    unauthorized: 'Die Anfrage wurde nicht autorisiert. Bitte melde dich erneut an.'
  };
  return messages[code] ?? `Unerwarteter Fehler (${code}).`;
}
