import { useEffect, useRef, useState } from 'react';
import type { FlagCountActions } from '../api/useFlagCount';
import { Badge, Button, Dialog, IconLink, StatusDot, type Tone } from '../components/ui';
import { describeStatus } from '../dashboard/ConnectionPanel';
import { LiveConnection } from '../dashboard/LiveConnection';
import type { AppModel } from './appModel';
import type { Navigate } from './navigation';
import { ProfileSwitcher } from './ProfileSwitcher';

const CONNECTION_TONES: Record<string, Tone> = {
  connected: 'success',
  connecting: 'warning',
  reconnecting: 'warning',
  unavailable: 'danger',
  disconnected: 'neutral'
};

type TopBarProps = {
  model: AppModel | null;
  pending: boolean;
  actions: FlagCountActions;
  onNavigate: Navigate;
  /** Profiles and plans are managed in the desktop app only. */
  desktop: boolean;
};

/** Visible on every page: the live connection, the running profile and the plan. */
export function TopBar({ model, pending, actions, onNavigate, desktop }: TopBarProps): React.JSX.Element {
  const [connectionOpen, setConnectionOpen] = useState(false);
  const status = model?.state.connection.status;
  const previousStatus = useRef(status);

  // Once the stream is connected, the drawer has done its job.
  useEffect(() => {
    if (status === 'connected' && previousStatus.current !== 'connected') setConnectionOpen(false);
    previousStatus.current = status;
  }, [status]);

  if (!model) return <header className="shell-topbar" aria-label="Stream-Status" />;

  const { state } = model;
  const connection = describeStatus(state.connection, state.sidecarRunning);
  const active = state.connection.status !== 'disconnected';

  return (
    <header className="shell-topbar" aria-label="Stream-Status">
      <div className="shell-topbar-connection" data-status={connection.key}>
        <span className="shell-topbar-status" role="status" data-status={connection.key}>
          <StatusDot
            tone={CONNECTION_TONES[connection.key] ?? 'neutral'}
            pulse={connection.key === 'connecting' || connection.key === 'reconnecting'}
          />
          <span className="shell-topbar-status-text">{connection.text}</span>
        </span>
        <Button size="sm" variant="secondary" icon={active ? undefined : IconLink} aria-haspopup="dialog" onClick={() => setConnectionOpen(true)}>
          {active ? 'Verbindung verwalten' : 'LIVE verbinden'}
        </Button>
      </div>

      <span className="shell-topbar-spacer" />

      {desktop && (
        <ProfileSwitcher
          model={model}
          disabled={!state.sidecarRunning || pending}
          onSwitch={(profileId) => void actions.switchProfile(profileId)}
          onManage={() => onNavigate({ page: 'profiles' })}
        />
      )}
      {desktop && (
        <button type="button" className="shell-topbar-plan" onClick={() => onNavigate({ page: 'license' })}>
          <Badge tone={model.isPro ? 'pro' : 'neutral'}>{model.isPro ? 'Pro' : 'Free'}</Badge>
        </button>
      )}

      <Dialog
        open={connectionOpen}
        variant="drawer"
        title="LIVE-Verbindung"
        description="Verbinde dich, sobald dein LIVE läuft. Manuelle Stimmen funktionieren auch ohne Verbindung."
        onClose={() => setConnectionOpen(false)}
      >
        <LiveConnection model={model} pending={pending} actions={actions} desktop={desktop} bare />
      </Dialog>
    </header>
  );
}
