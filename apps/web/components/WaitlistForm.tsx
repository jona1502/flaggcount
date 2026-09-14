'use client';

import { useState, type FormEvent } from 'react';

type FormStatus = { kind: 'success' | 'error'; message: string } | null;

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<FormStatus>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const unsubscribe = submitter?.value === 'unsubscribe';
    if (!unsubscribe && !consent) {
      setStatus({ kind: 'error', message: 'Bitte bestätige zuerst die Einwilligung.' });
      return;
    }

    setPending(true);
    setStatus(null);
    try {
      const response = await fetch(unsubscribe ? '/api/v1/waitlist/unsubscribe' : '/api/v1/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unsubscribe ? { email } : { email, consent: true })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setConsent(false);
      setStatus({
        kind: 'success',
        message: unsubscribe ? 'Die Adresse wurde aus der Warteliste entfernt.' : 'Danke! Du bist unverbindlich für FlagCount Pro vorgemerkt.'
      });
    } catch {
      setStatus({ kind: 'error', message: 'Das hat gerade nicht funktioniert. Bitte versuche es später erneut.' });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="waitlist-card">
      <h3>Unverbindlich vormerken</h3>
      <p>Trag dich ein, wenn du über Neuigkeiten zu FlagCount Pro informiert werden möchtest. Das ist keine Bestellung und es entstehen keine Kosten.</p>
      <form className="waitlist-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="waitlist-email">E-Mail-Adresse</label>
        <input
          id="waitlist-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          disabled={pending}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
        <label className="checkbox waitlist-consent">
          <input type="checkbox" checked={consent} disabled={pending} onChange={(event) => setConsent(event.currentTarget.checked)} />
          Ich möchte per E-Mail Neuigkeiten zu FlagCount Pro erhalten. Meine Adresse wird nur dafür gespeichert; ich kann mich jederzeit austragen.
        </label>
        <div className="waitlist-actions">
          <button className="button primary" type="submit" value="subscribe" disabled={pending}>
            {pending ? 'Bitte warten …' : 'Vormerken'}
          </button>
          <button className="text-button" type="submit" value="unsubscribe" disabled={pending}>
            Austragen
          </button>
        </div>
        {status && (
          <p className={`waitlist-status ${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'}>
            {status.message}
          </p>
        )}
      </form>
    </div>
  );
}
