import { PageHeader } from '../app-shell/PageHeader';
import { ConnectionPanel } from '../dashboard/ConnectionPanel';
import { CountersBoard } from '../dashboard/CountersBoard';
import { VotesPanel } from '../dashboard/VotesPanel';
import type { PageProps } from './types';

export function LivePage({ model, pending, actions }: PageProps): React.JSX.Element {
  const { state, running } = model;
  const disabled = !state.sidecarRunning || pending;
  // The single red flag counter keeps its familiar one-click panel; polls and parallel counters get the board.
  const showBoard = state.counters.length > 1 || state.counters.some((snapshot) => snapshot.mode === 'poll');
  return (
    <div className="page">
      <PageHeader title="Live-Steuerung" description="Stimmen, Ziele und Runden während des Streams." />
      <div className="dashboard-grid">
        <ConnectionPanel
          connection={state.connection}
          savedUsername={state.settings.username}
          sidecarRunning={state.sidecarRunning}
          pending={pending}
          onConnect={(username) => void actions.connect(username)}
          onDisconnect={() => void actions.disconnect()}
        />
        {showBoard ? (
          <CountersBoard
            counters={state.counters}
            definitions={running.counters}
            disabled={disabled}
            onAddVote={(counterId, optionId) => void actions.addManualVote(counterId, optionId)}
            onRemoveVote={(counterId, optionId) => void actions.removeManualVote(counterId, optionId)}
            onReset={(counterId) => void actions.resetVotes(counterId)}
          />
        ) : (
          <VotesPanel
            votes={state.votes}
            disabled={disabled}
            onAddManualVote={() => void actions.addManualVote()}
            onRemoveManualVote={() => void actions.removeManualVote()}
            onSetTarget={(target) => void actions.setTarget(target)}
            onReset={() => void actions.resetVotes()}
          />
        )}
      </div>
    </div>
  );
}
