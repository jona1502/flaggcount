import type { CounterDefinition } from '../../shared/profiles';
import type { CounterSnapshot } from '../../shared/voting';
import { ResetControl } from './ResetControl';

const numberFormat = new Intl.NumberFormat('de-DE');
const percentFormat = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });

type CountersBoardProps = {
  counters: CounterSnapshot[];
  /** Definitions of the running counters, for colors and chat triggers. */
  definitions: CounterDefinition[];
  disabled: boolean;
  onAddVote: (counterId: string, optionId: string) => void;
  onRemoveVote: (counterId: string, optionId: string) => void;
  /** Without a counter id, every round starts over. */
  onReset: (counterId?: string) => void;
};

/** Live view of several counters and polls, with corrections and resets per counter. */
export function CountersBoard({ counters, definitions, disabled, onAddVote, onRemoveVote, onReset }: CountersBoardProps): React.JSX.Element {
  return (
    <section className="panel counters-board" aria-labelledby="counters-board-heading">
      <div className="panel-heading">
        <h2 id="counters-board-heading">Aktuelle Runden</h2>
        {counters.length > 1 && (
          <ResetControl
            disabled={disabled}
            onReset={() => onReset()}
            label="Alle Runden zurücksetzen"
            question="Alle Stimmen aller Zähler löschen?"
            confirmLabel="Ja, alle zurücksetzen"
          />
        )}
      </div>

      <div className="counter-cards">
        {counters.map((counter) => {
          const definition = definitions.find((candidate) => candidate.id === counter.counterId);
          const progress = counter.target ? Math.min(100, Math.round((counter.totalCount / counter.target) * 100)) : null;
          return (
            <article key={counter.counterId} className="live-counter" aria-labelledby={`live-${counter.counterId}`}>
              <header className="live-counter-header">
                <h3 id={`live-${counter.counterId}`}>{counter.name}</h3>
                <p className="live-total">
                  <strong>{numberFormat.format(counter.totalCount)}</strong>
                  <span>{counter.target ? `von ${numberFormat.format(counter.target)} Stimmen` : 'Stimmen'}</span>
                </p>
              </header>

              {progress !== null && (
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`Fortschritt von ${counter.name}`}
                  aria-valuemin={0}
                  aria-valuemax={counter.target ?? 0}
                  aria-valuenow={Math.min(counter.totalCount, counter.target ?? 0)}
                  data-reached={counter.targetReached}
                >
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              )}

              <ul className="live-options">
                {counter.options.map((option) => {
                  const optionDefinition = definition?.options.find((candidate) => candidate.id === option.optionId);
                  const share = counter.totalCount > 0 ? option.count / counter.totalCount : 0;
                  const name = counter.mode === 'poll' ? option.label : counter.name;
                  const triggers = optionDefinition?.triggers.map((trigger) => trigger.value).join(' · ');
                  return (
                    <li key={option.optionId} className="live-option">
                      {counter.mode === 'poll' && (
                        <div className="live-option-row">
                          <span className="option-dot" style={{ background: optionDefinition?.accentColor }} aria-hidden="true" />
                          <span className="live-option-label">{option.label}</span>
                          <span className="live-option-count">
                            {numberFormat.format(option.count)} · {percentFormat.format(share)}
                          </span>
                        </div>
                      )}
                      {counter.mode === 'poll' && (
                        <div className="option-bar" aria-hidden="true">
                          <div style={{ width: `${Math.round(share * 100)}%`, background: optionDefinition?.accentColor }} />
                        </div>
                      )}
                      <div className="live-option-row">
                        {triggers && <span className="hint">Im Chat: {triggers}</span>}
                        <span className="live-option-actions">
                          <button
                            type="button"
                            className="button secondary"
                            disabled={disabled}
                            aria-label={`Stimme für ${name} hinzufügen`}
                            onClick={() => onAddVote(counter.counterId, option.optionId)}
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={disabled || option.count === 0}
                            aria-label={`Stimme für ${name} abziehen`}
                            onClick={() => onRemoveVote(counter.counterId, option.optionId)}
                          >
                            −1
                          </button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <ResetControl
                disabled={disabled}
                onReset={() => onReset(counter.counterId)}
                label={`${counter.name} zurücksetzen`}
                question={`Alle Stimmen von „${counter.name}“ löschen?`}
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
