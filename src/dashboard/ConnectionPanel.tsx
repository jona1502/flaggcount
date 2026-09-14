import { useState, type FormEvent } from 'react';
import type { ConnectionState } from '../../shared/appState';
import { Button, Card, Field, IconLink, Input, StatusDot, type Tone } from '../components/ui';

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

const STATUS_TONES: Record<string, Tone> = {
  connected: 'success',
  connecting: 'warning',
  reconnecting: 'warning',
  unavailable: 'danger'
};

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
    <Card
      className="connection-card"
      title="TikTok LIVE"
      description={active ? undefined : 'Verbinde dich, sobald dein LIVE läuft. Manuelle Stimmen funktionieren auch ohne Verbindung.'}
    >
      <form className="connection-form" onSubmit={submit} noValidate>
        <Field id="username" label="TikTok-Benutzername" error={validation}>
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="@benutzername"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            disabled={active}
          />
        </Field>
        <Button type="submit" variant={active ? 'secondary' : 'primary'} icon={active ? undefined : IconLink} disabled={!sidecarRunning || pending}>
          {buttonLabel}
        </Button>
      </form>
      {status.key !== 'disconnected' && (
        <p className="connection-status" data-status={status.key} role="status">
          <StatusDot tone={STATUS_TONES[status.key] ?? 'neutral'} pulse={status.key === 'connecting' || status.key === 'reconnecting'} />
          {status.text}
        </p>
      )}
    </Card>
  );
}
