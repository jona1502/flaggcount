import type { AppError, AppState } from '../../shared/appState';
import type { FlagCountActions } from '../api/useFlagCount';
import { ConnectionPanel } from './ConnectionPanel';
import { ErrorBanner } from './ErrorBanner';
import { OverlayPanel } from './OverlayPanel';
import { VotesPanel } from './VotesPanel';
import { UpdateNotice } from '../updater/UpdateNotice';
import type { UpdaterController } from '../updater/useUpdater';

type DashboardProps = {
  state: AppState | null;
  error: AppError | null;
  pending: boolean;
  actions: FlagCountActions;
  onDismissError: () => void;
  onCopyText: (text: string) => Promise<void>;
  version?: string | null;
  updater?: UpdaterController;
  /** Only the web version has a login to sign out of. */
  onLogout?: () => void;
};

export function Dashboard({
  state,
  error,
  pending,
  actions,
  onDismissError,
  onCopyText,
  version,
  updater,
  onLogout
}: DashboardProps): React.JSX.Element {
  return (
    <main className="app">
      <header className="app-header">
        <h1>
          <span aria-hidden="true">🚩</span> FlagCount
        </h1>
        {(version || updater || onLogout) && (
          <div className="version-actions">
            {version && <span className="version">Version {version}</span>}
            {updater && (
              <button
                type="button"
                className="text-button"
                disabled={updater.status === 'checking' || updater.status === 'downloading'}
                onClick={() => void updater.checkForUpdates()}
              >
                Nach Updates suchen
              </button>
            )}
            {onLogout && (
              <button type="button" className="text-button" onClick={onLogout}>
                Abmelden
              </button>
            )}
          </div>
        )}
      </header>

      {updater && <UpdateNotice updater={updater} />}

      <ErrorBanner error={error} onDismiss={onDismissError} />

      {state === null ? (
        <p className="loading">Status wird geladen …</p>
      ) : (
        <>
          <ConnectionPanel
            connection={state.connection}
            savedUsername={state.settings.username}
            sidecarRunning={state.sidecarRunning}
            pending={pending}
            onConnect={(username) => void actions.connect(username)}
            onDisconnect={() => void actions.disconnect()}
          />
          <VotesPanel
            votes={state.votes}
            disabled={!state.sidecarRunning || pending}
            onAddManualVote={() => void actions.addManualVote()}
            onSetTarget={(target) => void actions.setTarget(target)}
            onReset={() => void actions.resetVotes()}
          />
          <OverlayPanel
            overlayUrl={state.overlayUrl}
            settings={state.settings.overlay}
            disabled={pending}
            onCopy={onCopyText}
            onChangeSettings={(overlay) => void actions.setOverlaySettings(overlay)}
          />
        </>
      )}
    </main>
  );
}
