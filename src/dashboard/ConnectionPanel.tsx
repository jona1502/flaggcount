import { useState, type FormEvent } from 'react';
import type { ConnectionState } from '../../shared/appState';

type ConnectionPanelProps = {
  connection: ConnectionState;
  /** Username from the last session, used to prefill the input. */
  savedUsername: string;
  sidecarRunning: boolean;
  pending: boolean;
  onConnect: (username: string) => void;
  onDisconnect: () => void;
};

export function describeStatus(connection: ConnectionState, sidecarRunning: boolean): { key: string; text: string } {
  if (!sidecarRunning) {
    return { key: 'unavailable', text: 'Verbindungsdienst nicht verfügbar' };
  }
  const name = connection.username ? `@${connection.username}` : 'dem Livestream';
  switch (connection.status) {
    case 'connecting':
      return { key: 'connecting', text: `Verbinde mit ${name} …` };
    case 'connected':
      return { key: 'connected', text: `Verbunden mit ${name}` };
    case 'reconnecting': {
      const retry = connection.reconnect;
      const detail = retry
        ? ` – neuer Versuch ${retry.attempt} von ${retry.maxAttempts} in ${Math.max(1, Math.round(retry.delayMs / 1000))} s`
        : '';
      return { key: 'reconnecting', text: `Verbindung zu ${name} unterbrochen${detail}` };
    }
    default:
      return { key: 'disconnected', text: 'Nicht verbunden' };
  }
}

export function ConnectionPanel({
  connection,
  savedUsername,
  sidecarRunning,
  pending,
  onConnect,
  onDisconnect
}: ConnectionPanelProps): React.JSX.Element {
  const [username, setUsername] = useState(connection.username ?? savedUsername);
  const [validation, setValidation] = useState<string | null>(null);
  const active = connection.status !== 'disconnected';
  const status = describeStatus(connection, sidecarRunning);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (active) {
      onDisconnect();
      return;
    }

    const trimmed = username.trim();
    if (!trimmed) {
      setValidation('Bitte gib einen TikTok-Benutzernamen ein.');
      return;
    }
    setValidation(null);
    onConnect(trimmed);
  };

  let buttonLabel = 'Verbinden';
  if (connection.status === 'connecting') buttonLabel = 'Abbrechen';
  if (connection.status === 'connected' || connection.status === 'reconnecting') buttonLabel = 'Trennen';

  return (
    <section className="panel connection-panel" aria-labelledby="connection-heading">
      <h2 id="connection-heading">Livestream</h2>
      <form onSubmit={submit} noValidate>
        <label htmlFor="username">TikTok-Benutzername</label>
        <div className="input-row">
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="@benutzername"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            disabled={active}
            aria-invalid={validation ? true : undefined}
            aria-describedby={validation ? 'username-error' : undefined}
          />
          <button
            type="submit"
            className={active ? 'button secondary' : 'button primary'}
            disabled={!sidecarRunning || pending}
          >
            {buttonLabel}
          </button>
        </div>
        {validation && (
          <p id="username-error" className="field-error">
            {validation}
          </p>
        )}
      </form>
      {status.key !== 'disconnected' && (
        <p className="status" data-status={status.key} role="status">
          <span className="status-dot" aria-hidden="true" />
          {status.text}
        </p>
      )}
    </section>
  );
}
