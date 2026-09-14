import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AdminApiError,
  adminApi,
  describeAdminError,
  type AdminLicenseDetails,
  type AdminLicenseSummary,
  type AdminSessionInfo,
  type ManualReason
} from './adminApi';

const REASONS: Record<ManualReason, string> = {
  support: 'Support',
  creator: 'Creator',
  testing: 'Test',
  promotion: 'Aktion'
};

const ACTIONS: Record<string, string> = {
  'manual-license-created': 'Manuelle Lizenz erstellt',
  'manual-validity-changed': 'Laufzeit geändert',
  'license-blocked': 'Gesperrt',
  'license-unblocked': 'Entsperrt',
  'note-changed': 'Hinweis geändert',
  'installation-deactivated': 'Installation deaktiviert',
  'code-renewed-shown': 'Neuer Code angezeigt',
  'code-renewed-emailed': 'Neuer Code per E-Mail'
};

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = (value: string | null): string => (value ? dateTime.format(new Date(value)) : '–');

/** A date input means the end of that day in local time. */
const endOfDay = (date: string): string | null => (date ? new Date(`${date}T23:59:59`).toISOString() : null);
const dateInput = (value: string | null): string => (value ? value.slice(0, 10) : '');

function accessLabel(license: AdminLicenseSummary): string {
  if (!license.access) return 'Kein Pro-Zugriff';
  const until = license.access.endsAt ? ` bis ${formatDate(license.access.endsAt)}` : '';
  return license.access.status === 'grace' ? `Gnadenfrist${until}` : `Aktiv${until}`;
}

export function AdminApp(): React.JSX.Element {
  const [session, setSession] = useState<AdminSessionInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    adminApi.session().then(setSession, (error: unknown) => {
      setSession({ authenticated: false });
      setProblem(describeAdminError(error));
    });
  }, []);

  if (!session) return <div className="login-page" aria-busy="true" />;
  if (!session.authenticated) {
    return (
      <main className="admin-login">
        <section className="panel admin-login-card">
          <h1>FlagCount Admin</h1>
          <p>Nur für freigegebene GitHub-Konten. Die Sitzung endet nach 30 Minuten ohne Aktivität.</p>
          <a className="button primary" href="/admin/auth/login">
            Mit GitHub anmelden
          </a>
          {problem && <p className="admin-error" role="alert">{problem}</p>}
        </section>
      </main>
    );
  }

  const signOut = (): void => {
    void adminApi
      .logout()
      .catch(() => undefined)
      .finally(() => setSession({ authenticated: false }));
  };
  const expired = (error: unknown): void => {
    if (error instanceof AdminApiError && error.status === 401) setSession({ authenticated: false });
  };

  return <AdminWorkspace login={session.login} onSignOut={signOut} onExpired={expired} />;
}

function AdminWorkspace({ login, onSignOut, onExpired }: { login: string; onSignOut: () => void; onExpired: (error: unknown) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminLicenseSummary[]>([]);
  const [selected, setSelected] = useState<AdminLicenseDetails | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(work: () => Promise<T>, success?: string): Promise<T | null> => {
      setBusy(true);
      setMessage(null);
      try {
        const value = await work();
        if (success) setMessage({ kind: 'success', text: success });
        return value;
      } catch (error) {
        onExpired(error);
        setMessage({ kind: 'error', text: describeAdminError(error) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [onExpired]
  );

  const search = useCallback(
    async (text: string) => {
      const found = await run(() => adminApi.search(text));
      if (found) setResults(found);
    },
    [run]
  );

  useEffect(() => {
    void search('');
  }, [search]);

  const open = async (id: string): Promise<void> => {
    setShownCode(null);
    const details = await run(() => adminApi.details(id));
    if (details) setSelected(details);
  };

  const update = (details: AdminLicenseDetails | null): void => {
    if (!details) return;
    setSelected(details);
    setResults((current) => current.map((license) => (license.id === details.id ? details : license)));
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void search(query);
  };

  return (
    <div className="app admin-app">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-mark" aria-hidden="true">
            🚩
          </div>
          <h1>FlagCount Admin</h1>
        </div>
        <div className="admin-account">
          <span>Angemeldet als {login}</span>
          <button className="text-button" type="button" onClick={onSignOut}>
            Abmelden
          </button>
        </div>
      </header>

      {message && (
        <p className={`admin-message ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <div className="admin-layout">
        <div className="admin-column">
          <section className="panel" aria-labelledby="admin-search-title">
            <h2 id="admin-search-title">Lizenzen</h2>
            <form className="admin-search" onSubmit={submitSearch}>
              <label htmlFor="admin-query">Referenz, Lizenz-ID oder Stripe-ID</label>
              <div className="admin-row">
                <input id="admin-query" value={query} maxLength={100} placeholder="FC-…, cus_…, sub_…" onChange={(event) => setQuery(event.currentTarget.value)} />
                <button className="button" type="submit" disabled={busy}>
                  Suchen
                </button>
              </div>
            </form>
            <ul className="admin-results">
              {results.map((license) => (
                <li key={license.id}>
                  <button type="button" className={selected?.id === license.id ? 'selected' : ''} onClick={() => void open(license.id)}>
                    <strong>{license.reference}</strong>
                    <span>
                      {license.source}
                      {license.legacy ? ' (alt)' : ''} · {license.providerStatus ?? REASONS[license.manualReason ?? 'support']}
                      {license.supportStatus === 'blocked' ? ' · gesperrt' : ''}
                    </span>
                    <small>{accessLabel(license)}</small>
                  </button>
                </li>
              ))}
              {results.length === 0 && <li className="admin-empty">Keine Lizenzen gefunden.</li>}
            </ul>
          </section>

          <ManualLicenseForm
            busy={busy}
            onCreate={async (input) => {
              const created = await run(() => adminApi.createManual(input), 'Manuelle Lizenz erstellt.');
              if (!created) return;
              setSelected(created.license);
              setShownCode(created.code);
              setResults((current) => [created.license, ...current]);
            }}
          />
        </div>

        {selected ? (
          <LicenseDetails
            key={selected.id}
            license={selected}
            busy={busy}
            shownCode={shownCode}
            onBlock={async (blocked) => {
              if (!window.confirm(blocked ? 'Lizenz sperren? Pro endet bei der nächsten Prüfung.' : 'Sperre aufheben?')) return;
              update(await run(() => adminApi.setBlocked(selected.id, blocked), blocked ? 'Lizenz gesperrt.' : 'Sperre aufgehoben.'));
            }}
            onNote={async (note) => update(await run(() => adminApi.setNote(selected.id, note), 'Hinweis gespeichert.'))}
            onValidity={async (validUntil) => update(await run(() => adminApi.setValidity(selected.id, validUntil), 'Laufzeit gespeichert.'))}
            onDeactivate={async (installationId) => {
              if (!window.confirm('Installation deaktivieren? Pro endet auf diesem Computer bei der nächsten Prüfung.')) return;
              update(await run(() => adminApi.deactivateInstallation(selected.id, installationId), 'Installation deaktiviert.'));
            }}
            onRenewCode={async (delivery) => {
              if (!window.confirm('Neuen Aktivierungscode erstellen? Der bisherige Code wird ungültig.')) return;
              const renewed = await run(
                () => adminApi.renewCode(selected.id, delivery),
                delivery === 'email' ? 'Neuer Code wurde per E-Mail gesendet.' : 'Neuer Code erstellt.'
              );
              if (!renewed) return;
              setShownCode(renewed.code);
              update(await run(() => adminApi.details(selected.id)));
            }}
          />
        ) : (
          <section className="panel admin-placeholder">
            <p>Wähle links eine Lizenz aus.</p>
          </section>
        )}
      </div>
    </div>
  );
}

function ManualLicenseForm({
  busy,
  onCreate
}: {
  busy: boolean;
  onCreate: (input: { reason: ManualReason; validUntil: string | null; note: string | null }) => Promise<void>;
}) {
  const [reason, setReason] = useState<ManualReason>('support');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onCreate({ reason, validUntil: endOfDay(validUntil), note: note.trim() || null }).then(() => {
      setValidUntil('');
      setNote('');
    });
  };

  return (
    <section className="panel" aria-labelledby="admin-manual-title">
      <h2 id="admin-manual-title">Manuelle Lizenz</h2>
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
        <button className="button primary" type="submit" disabled={busy}>
          Lizenz erstellen
        </button>
      </form>
    </section>
  );
}

type DetailsProps = {
  license: AdminLicenseDetails;
  busy: boolean;
  shownCode: string | null;
  onBlock: (blocked: boolean) => Promise<void>;
  onNote: (note: string) => Promise<void>;
  onValidity: (validUntil: string | null) => Promise<void>;
  onDeactivate: (installationId: string) => Promise<void>;
  onRenewCode: (delivery: 'show' | 'email') => Promise<void>;
};

function LicenseDetails({ license, busy, shownCode, onBlock, onNote, onValidity, onDeactivate, onRenewCode }: DetailsProps) {
  const [note, setNote] = useState(license.supportNote ?? '');
  const [validUntil, setValidUntil] = useState(dateInput(license.manualValidUntil));
  const manual = license.source === 'manual';

  const facts: [string, React.ReactNode][] = [
    ['Quelle', `${license.source}${license.legacy ? ' (früherer Anbieter)' : ''}`],
    ['Pro-Zugriff', accessLabel(license)],
    ...(manual
      ? ([
          ['Grund', REASONS[license.manualReason ?? 'support']],
          ['Gültig bis', formatDate(license.manualValidUntil)]
        ] as [string, React.ReactNode][])
      : ([
          ['Abo-Status', license.providerStatus ?? '–'],
          ['Bezahlt bis', formatDate(license.currentPeriodEndsAt)],
          ['Kündigung zum', formatDate(license.scheduledCancelAt)],
          ['Gekündigt am', formatDate(license.canceledAt)],
          ['Kunde', license.links.customer ? <a href={license.links.customer} target="_blank" rel="noreferrer">{license.providerCustomerId}</a> : (license.providerCustomerId ?? '–')],
          ['Abo', license.links.subscription ? <a href={license.links.subscription} target="_blank" rel="noreferrer">{license.providerSubscriptionId}</a> : (license.providerSubscriptionId ?? '–')]
        ] as [string, React.ReactNode][])),
    ['Erstattung/Chargeback', license.revokedAt ? formatDate(license.revokedAt) : 'nein'],
    ['Support-Sperre', license.supportStatus === 'blocked' ? 'gesperrt' : 'nein'],
    ['Code ausgestellt', license.hasActivationCode ? formatDate(license.codeIssuedAt) : 'noch keiner'],
    ['Erstellt', formatDate(license.createdAt)]
  ];

  return (
    <section className="panel admin-details" aria-labelledby="admin-details-title">
      <h2 id="admin-details-title">{license.reference}</h2>
      {!manual && (
        <p className="admin-hint">Zahlungsstatus, Laufzeit, Preis, Kündigung und Erstattung werden im Stripe-Dashboard geändert und per Webhook übernommen.</p>
      )}
      <dl className="admin-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {shownCode && (
        <div className="admin-code" role="status">
          <span>Aktivierungscode – wird nur jetzt angezeigt:</span>
          <code>{shownCode}</code>
        </div>
      )}

      <div className="admin-actions">
        <button className="button" type="button" disabled={busy} onClick={() => void onRenewCode('show')}>
          Neuen Code anzeigen
        </button>
        {!manual && (
          <button className="button" type="button" disabled={busy} onClick={() => void onRenewCode('email')}>
            Neuen Code per E-Mail
          </button>
        )}
        <button className={`button ${license.supportStatus === 'blocked' ? '' : 'danger'}`} type="button" disabled={busy} onClick={() => void onBlock(license.supportStatus !== 'blocked')}>
          {license.supportStatus === 'blocked' ? 'Sperre aufheben' : 'Lizenz sperren'}
        </button>
      </div>

      {manual && (
        <form
          className="admin-row"
          onSubmit={(event) => {
            event.preventDefault();
            void onValidity(endOfDay(validUntil));
          }}
        >
          <label htmlFor="admin-validity">Gültig bis</label>
          <input id="admin-validity" type="date" value={validUntil} onChange={(event) => setValidUntil(event.currentTarget.value)} />
          <button className="button" type="submit" disabled={busy}>
            Laufzeit speichern
          </button>
        </form>
      )}

      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onNote(note);
        }}
      >
        <label>
          Interner Hinweis
          <textarea value={note} maxLength={500} rows={3} onChange={(event) => setNote(event.currentTarget.value)} />
        </label>
        <button className="button" type="submit" disabled={busy}>
          Hinweis speichern
        </button>
      </form>

      <h3>Aktive Installationen ({license.installations.length}/3)</h3>
      <ul className="admin-list">
        {license.installations.map((installation) => (
          <li key={installation.installationId}>
            <span>
              <code>{installation.installationId}</code>
              <small>
                aktiviert {formatDate(installation.activatedAt)} · zuletzt {formatDate(installation.lastSeenAt)}
              </small>
            </span>
            <button className="text-button" type="button" disabled={busy} onClick={() => void onDeactivate(installation.installationId)}>
              Deaktivieren
            </button>
          </li>
        ))}
        {license.installations.length === 0 && <li className="admin-empty">Keine aktive Installation.</li>}
      </ul>

      <h3>Audit-Protokoll</h3>
      <ul className="admin-list">
        {license.audit.map((entry) => (
          <li key={entry.id}>
            <span>
              {ACTIONS[entry.action] ?? entry.action}
              <small>
                {formatDate(entry.createdAt)} · {entry.adminSubject}
              </small>
            </span>
          </li>
        ))}
        {license.audit.length === 0 && <li className="admin-empty">Noch keine Änderungen.</li>}
      </ul>
    </section>
  );
}
