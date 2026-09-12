import type { AppError, AppState } from '../../shared/appState';
import type { FlagCountActions } from '../api/useFlagCount';
import { ConnectionPanel } from './ConnectionPanel';
import { ErrorBanner } from './ErrorBanner';
import { VotesPanel } from './VotesPanel';

type DashboardProps = {
  state: AppState | null;
  error: AppError | null;
  pending: boolean;
  actions: FlagCountActions;
  onDismissError: () => void;
  version?: string | null;
};

export function Dashboard({ state, error, pending, actions, onDismissError, version }: DashboardProps): React.JSX.Element {
  return (
    <main className="app">
      <header className="app-header">
        <h1>
          <span aria-hidden="true">🚩</span> FlagCount
        </h1>
        {version && <span className="version">Version {version}</span>}
      </header>

      <ErrorBanner error={error} onDismiss={onDismissError} />

      {state === null ? (
        <p className="loading">Status wird geladen …</p>
      ) : (
        <>
          <ConnectionPanel
            connection={state.connection}
            sidecarRunning={state.sidecarRunning}
            pending={pending}
            onConnect={(username) => void actions.connect(username)}
            onDisconnect={() => void actions.disconnect()}
          />
          <VotesPanel
            votes={state.votes}
            disabled={!state.sidecarRunning || pending}
            onSetTarget={(target) => void actions.setTarget(target)}
            onReset={() => void actions.resetVotes()}
          />
        </>
      )}
    </main>
  );
}
