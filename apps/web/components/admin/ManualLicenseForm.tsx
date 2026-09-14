'use client';

import Link from 'next/link';
import { useState, useTransition, type FormEvent } from 'react';
import { createManualLicense } from '../../app/admin/(protected)/licenses/actions';
import { REASONS } from '../../lib/admin/format';
import type { ManualReason } from '../../lib/admin/types';

/** A date input means the end of that day in local time. */
export const endOfDay = (date: string): string | null => (date ? new Date(`${date}T23:59:59`).toISOString() : null);

export function ManualLicenseForm({ confirm = (message: string) => window.confirm(message) }: { confirm?: (message: string) => boolean }) {
  const [reason, setReason] = useState<ManualReason>('support');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; reference: string; code: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const until = validUntil ? ` bis ${new Date(`${validUntil}T12:00:00`).toLocaleDateString('de-DE')}` : ' ohne Ablaufdatum';
    if (!confirm(`Manuelle Lizenz (${REASONS[reason]})${until} vergeben?`)) return;
    setProblem(null);
    startTransition(async () => {
      const result = await createManualLicense({ reason, validUntil: endOfDay(validUntil), note: note.trim() || null });
      if (result.ok) setCreated(result.value);
      else setProblem(result.message);
    });
  };

  if (created) {
    return (
      <div className="admin-code" role="status">
        <span>Lizenz {created.reference} erstellt. Aktivierungscode – wird nur jetzt angezeigt:</span>
        <code>{created.code}</code>
        <Link href={`/admin/licenses/${created.id}`}>Zur Lizenz</Link>
      </div>
    );
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label>
        Grund
        <select value={reason} onChange={(event) => setReason(event.currentTarget.value as ManualReason)}>
          {Object.entries(REASONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Gültig bis (empfohlen)
        <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.currentTarget.value)} />
      </label>
      <label>
        Interner Hinweis
        <input value={note} maxLength={500} placeholder="ohne Namen oder E-Mail-Adressen" onChange={(event) => setNote(event.currentTarget.value)} />
      </label>
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? 'Wird erstellt …' : 'Lizenz erstellen'}
      </button>
      {problem && (
        <p className="admin-message error" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}
