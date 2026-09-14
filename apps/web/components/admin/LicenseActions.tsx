'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deactivateInstallation, renewCode, saveNote, setBlocked, setValidity, type ActionResult } from '../../app/admin/(protected)/licenses/actions';
import { formatDate } from '../../lib/admin/format';
import type { InstallationView } from '../../lib/admin/types';
import { endOfDay } from './ManualLicenseForm';

type Props = {
  licenseId: string;
  manual: boolean;
  blocked: boolean;
  /** Provider licenses can send a new code to the purchase address. */
  canEmail: boolean;
  note: string | null;
  validUntil: string | null;
  installations: InstallationView[];
  confirm?: (message: string) => boolean;
};

/** Every change asks for confirmation, runs as a Server Action and reloads the license afterwards. */
export function LicenseActions({ licenseId, manual, blocked, canEmail, note, validUntil, installations, confirm = (message) => window.confirm(message) }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [noteText, setNoteText] = useState(note ?? '');
  const [until, setUntil] = useState(validUntil ? validUntil.slice(0, 10) : '');

  const run = <T,>(question: string, action: () => Promise<ActionResult<T>>, success: string, onValue?: (value: T) => void) => {
    if (!confirm(question)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.message });
        return;
      }
      onValue?.(result.value);
      setMessage({ kind: 'success', text: success });
      router.refresh();
    });
  };

  return (
    <section className="panel admin-section" aria-labelledby="actions-title">
      <h2 id="actions-title">Aktionen</h2>
      {message && (
        <p className={`admin-message ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {shownCode && (
        <div className="admin-code" role="status">
          <span>Aktivierungscode – wird nur jetzt angezeigt:</span>
          <code>{shownCode}</code>
        </div>
      )}

      <div className="admin-actions">
        <button
          className="button"
          type="button"
          disabled={pending}
          onClick={() =>
            run('Neuen Aktivierungscode erstellen und hier anzeigen? Der bisherige Code wird ungültig.', () => renewCode(licenseId, 'show'), 'Neuer Code erstellt.', (value) =>
              setShownCode(value.code)
            )
          }
        >
          Neuen Code anzeigen
        </button>
        {canEmail && (
          <button
            className="button"
            type="button"
            disabled={pending}
            onClick={() =>
              run('Neuen Aktivierungscode an die Kauf-E-Mail-Adresse senden? Der bisherige Code wird ungültig.', () => renewCode(licenseId, 'email'), 'Neuer Code wurde per E-Mail gesendet.')
            }
          >
            Neuen Code per E-Mail
          </button>
        )}
        <button
          className={`button ${blocked ? '' : 'danger'}`}
          type="button"
          disabled={pending}
          onClick={() =>
            blocked
              ? run('Sperre aufheben? Pro ist danach wieder nutzbar, sofern die Lizenz gültig ist.', () => setBlocked(licenseId, false), 'Sperre aufgehoben.')
              : run('Lizenz sperren? Pro endet bei der nächsten Prüfung auf allen Computern.', () => setBlocked(licenseId, true), 'Lizenz gesperrt.')
          }
        >
          {blocked ? 'Sperre aufheben' : 'Lizenz sperren'}
        </button>
      </div>

      {manual && (
        <form
          className="admin-row"
          onSubmit={(event) => {
            event.preventDefault();
            run(until ? `Laufzeit bis ${until} setzen?` : 'Laufzeit ohne Ablaufdatum setzen?', () => setValidity(licenseId, endOfDay(until)), 'Laufzeit gespeichert.');
          }}
        >
          <label htmlFor="license-validity">Gültig bis</label>
          <input id="license-validity" type="date" value={until} onChange={(event) => setUntil(event.currentTarget.value)} />
          <button className="button" type="submit" disabled={pending}>
            Laufzeit speichern
          </button>
        </form>
      )}

      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          run('Internen Hinweis speichern?', () => saveNote(licenseId, noteText), 'Hinweis gespeichert.');
        }}
      >
        <label>
          Interner Hinweis
          <textarea value={noteText} maxLength={500} rows={3} placeholder="ohne Namen oder E-Mail-Adressen" onChange={(event) => setNoteText(event.currentTarget.value)} />
        </label>
        <button className="button" type="submit" disabled={pending}>
          Hinweis speichern
        </button>
      </form>

      <h3>Aktive Installationen ({installations.length}/3)</h3>
      <ul className="admin-list">
        {installations.map((installation) => (
          <li key={installation.installationId}>
            <span>
              <code>{installation.installationId}</code>
              <small>
                aktiviert {formatDate(installation.activatedAt)} · zuletzt {formatDate(installation.lastSeenAt)}
              </small>
            </span>
            <button
              className="text-button"
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  'Installation deaktivieren? Pro endet auf diesem Computer bei der nächsten Prüfung.',
                  () => deactivateInstallation(licenseId, installation.installationId),
                  'Installation deaktiviert.'
                )
              }
            >
              Deaktivieren
            </button>
          </li>
        ))}
        {installations.length === 0 && <li className="admin-empty">Keine aktive Installation.</li>}
      </ul>
    </section>
  );
}
