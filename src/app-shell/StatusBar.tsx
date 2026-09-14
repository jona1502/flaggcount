import type { AppState } from '../../shared/appState';
import { Badge, StatusDot, type Tone } from '../components/ui';
import { describeStatus } from '../dashboard/ConnectionPanel';
import type { AppModel } from './appModel';
import type { Navigate } from './navigation';

const CONNECTION_TONES: Record<string, Tone> = {
  connected: 'success',
  connecting: 'warning',
  reconnecting: 'warning',
  unavailable: 'danger',
  disconnected: 'neutral'
};

type StatusBarProps = {
  model: AppModel | null;
  version?: string | null;
  onNavigate: Navigate;
  /** Profiles and plans are managed in the desktop app only. */
  desktop: boolean;
};

function connectionOf(state: AppState): { key: string; text: string } {
  return describeStatus(state.connection, state.sidecarRunning);
}

/** Always visible: connection, running profile, plan and version. */
export function StatusBar({ model, version, onNavigate, desktop }: StatusBarProps): React.JSX.Element {
  const connection = model ? connectionOf(model.state) : null;
  const running = model?.state.counters.length ?? 0;
  return (
    <footer className="shell-statusbar" aria-label="Statusleiste">
      {connection && (
        <button type="button" className="shell-status-item" onClick={() => onNavigate({ page: 'live' })}>
          <StatusDot tone={CONNECTION_TONES[connection.key] ?? 'neutral'} pulse={connection.key === 'connecting' || connection.key === 'reconnecting'} />
          <span>{connection.text}</span>
        </button>
      )}
      {model && desktop && (
        <button type="button" className="shell-status-item" onClick={() => onNavigate({ page: 'profiles' })}>
          <span className="shell-status-muted">Profil</span>
          <span className="shell-status-strong">{model.running.name}</span>
        </button>
      )}
      {model && (
        <span className="shell-status-item is-static">
          {running} {running === 1 ? 'Element aktiv' : 'Elemente aktiv'}
        </span>
      )}
      <span className="shell-status-spacer" />
      {model && desktop && (
        <button type="button" className="shell-status-item" onClick={() => onNavigate({ page: 'license' })}>
          <Badge tone={model.isPro ? 'pro' : 'neutral'}>{model.isPro ? 'Pro' : 'Free'}</Badge>
        </button>
      )}
      {version && <span className="shell-status-item is-static shell-status-muted">Version {version}</span>}
    </footer>
  );
}
