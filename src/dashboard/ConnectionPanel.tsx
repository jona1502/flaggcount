import { useId, useState, type FormEvent } from 'react';
import type { ConnectionState } from '../../shared/appState';
import type { LivePlatform, TwitchAuthState } from '../../shared/live';
import { Button, Card, ConfirmDialog, Field, IconLink, Input, Select, StatusDot, type Tone } from '../components/ui';

type ConnectionPanelProps = {
  connection: ConnectionState;
  /** Username from the last session, used to prefill the input. */
  savedUsername: string;
  sidecarRunning: boolean;
  pending: boolean;
  initialPlatform?: LivePlatform;
  twitchAuth?: TwitchAuthState;
  twitchAvailable?: boolean;
  /** Without the card frame, e.g. inside the connection drawer that has its own title. */
  bare?: boolean;
  onConnect: (username: string, platform?: LivePlatform) => void;
  onDisconnect: () => void;
  onStartTwitchAuth?: () => void;
  onDisconnectTwitchAccount?: () => void;
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
  initialPlatform = 'tiktok',
  twitchAuth = { status: 'signed-out' },
  twitchAvailable = true,
  bare = false,
  onConnect,
  onDisconnect,
  onStartTwitchAuth = () => undefined,
  onDisconnectTwitchAccount = () => undefined
}: ConnectionPanelProps): React.JSX.Element {
  // The overview and the drawer can show the form at the same time, so field ids must not collide.
  const fieldId = useId();
  const [platform, setPlatform] = useState<LivePlatform>(connection.platform ?? initialPlatform);
  const [username, setUsername] = useState(connection.username ?? savedUsername);
  const [validation, setValidation] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const active = connection.status !== 'disconnected';
  const status = describeStatus(connection, sidecarRunning);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (active) {
      onDisconnect();
      return;
    }

    const trimmed = username.trim();
    if (platform === 'tiktok' && !trimmed) {
      setValidation('Bitte gib einen TikTok-Benutzernamen ein.');
      return;
    }
    setValidation(null);
    if (platform === 'twitch' && twitchAuth.status !== 'signed-in') {
      setValidation('Melde dich zuerst mit Twitch an.');
      return;
    }
    if (platform === 'twitch') onConnect('', 'twitch');
    else onConnect(trimmed);
  };

  let buttonLabel = 'Verbinden';
  if (connection.status === 'connecting') buttonLabel = 'Abbrechen';
  if (connection.status === 'connected' || connection.status === 'reconnecting') buttonLabel = 'Trennen';

  const content = (
    <>
      <form className="connection-form" onSubmit={submit} noValidate>
        <Field id={`${fieldId}-platform`} label="Plattform">
          <Select value={platform} disabled={active} onChange={(event) => { setPlatform(event.target.value as LivePlatform); setValidation(null); }}>
            <option value="tiktok">TikTok</option>
            <option value="twitch" disabled={!twitchAvailable}>Twitch{twitchAvailable ? '' : ' (nur Desktop-App)'}</option>
          </Select>
        </Field>
        {!twitchAvailable && <p className="field-hint">Twitch ist derzeit ausschließlich in der Desktop-App verfügbar.</p>}
        {platform === 'tiktok' ? <Field id={`${fieldId}-username`} label="TikTok-Benutzername" error={validation}>
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="@benutzername"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            disabled={active}
          />
        </Field> : <div className="twitch-auth" aria-live="polite">
          {twitchAuth.status === 'signed-in' ? <>
            <p>Angemeldet als <strong>{twitchAuth.displayName}</strong> (@{twitchAuth.login})</p>
            <Button type="button" variant="ghost" size="sm" disabled={active || pending} onClick={() => setConfirmUnlink(true)}>Twitch-Konto trennen</Button>
          </> : twitchAuth.status === 'authorizing' ? <p>Öffne <strong>{twitchAuth.verificationUri}</strong> und gib den Code <strong>{twitchAuth.userCode}</strong> ein.</p>
            : <Button type="button" variant="secondary" disabled={pending} onClick={onStartTwitchAuth}>Mit Twitch anmelden</Button>}
          {validation && <p className="field-error">{validation}</p>}
        </div>}
        <Button type="submit" variant={active ? 'secondary' : 'primary'} icon={active ? undefined : IconLink} disabled={!sidecarRunning || pending}>
          {platform === 'twitch' && !active ? 'Eigenen Kanal verbinden' : buttonLabel}
        </Button>
      </form>
      {/* The top bar announces status changes; this line only repeats them next to the form. */}
      {status.key !== 'disconnected' && (
        <p className="connection-status" data-status={status.key}>
          <StatusDot tone={STATUS_TONES[status.key] ?? 'neutral'} pulse={status.key === 'connecting' || status.key === 'reconnecting'} />
          {status.text}
        </p>
      )}
      <ConfirmDialog open={confirmUnlink} title="Twitch-Konto trennen?" message="Die lokale Twitch-Autorisierung wird gelöscht und bei Twitch widerrufen." confirmLabel="Konto trennen" onCancel={() => setConfirmUnlink(false)} onConfirm={() => { setConfirmUnlink(false); onDisconnectTwitchAccount(); }} />
    </>
  );

  if (bare) return <div className="connection-panel">{content}</div>;

  return (
    <Card
      className="connection-card"
      title="LIVE-Verbindung"
      description={active ? undefined : 'Verbinde dich, sobald dein LIVE läuft. Manuelle Stimmen funktionieren auch ohne Verbindung.'}
    >
      {content}
    </Card>
  );
}
