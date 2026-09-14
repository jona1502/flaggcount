'use client';

import { useState, type FormEvent } from 'react';

type Status = { kind: 'sent' } | { kind: 'error'; message: string } | null;

/** The same text for every address, so the page never reveals whether an address has bought Pro. */
export const RECOVERY_SENT_MESSAGE =
  'Wenn zu dieser Adresse ein aktives FlagCount Pro gehört, ist ein neuer Aktivierungscode unterwegs. Bitte schau auch im Spam-Ordner nach.';

export function RecoveryForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch('/api/v1/licenses/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      if (response.status === 429) {
        setStatus({ kind: 'error', message: 'Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.' });
      } else if (response.status === 503) {
        setStatus({ kind: 'error', message: 'Die Wiederherstellung ist gerade nicht verfügbar. Bitte versuche es später erneut.' });
      } else if (!response.ok) {
        setStatus({ kind: 'error', message: 'Das hat nicht funktioniert. Bitte prüfe die E-Mail-Adresse.' });
      } else {
        setStatus({ kind: 'sent' });
      }
    } catch {
      setStatus({ kind: 'error', message: 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.' });
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="waitlist-form recovery-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="recovery-email">E-Mail-Adresse des Kaufs</label>
      <input
        id="recovery-email"
        type="email"
        autoComplete="email"
        maxLength={254}
        required
        value={email}
        disabled={pending}
        onChange={(event) => setEmail(event.currentTarget.value)}
      />
      <div className="waitlist-actions">
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? 'Bitte warten …' : 'Neuen Code anfordern'}
        </button>
      </div>
      {status?.kind === 'sent' && (
        <p className="waitlist-status success" role="status">
          {RECOVERY_SENT_MESSAGE}
        </p>
      )}
      {status?.kind === 'error' && (
        <p className="waitlist-status error" role="alert">
          {status.message}
        </p>
      )}
    </form>
  );
}
