import { useEffect, useState, type FormEvent } from 'react';
import { MAX_TARGET, MIN_TARGET, isValidTarget, type VoteSnapshot } from '../../shared/voting';
import { getErrorMessage } from './errorMessages';
import { ResetControl } from './ResetControl';

const numberFormat = new Intl.NumberFormat('de-DE');

type VotesPanelProps = {
  votes: VoteSnapshot;
  disabled: boolean;
  onAddManualVote: () => void;
  onSetTarget: (target: number) => void;
  onReset: () => void;
};

export function VotesPanel({ votes, disabled, onAddManualVote, onSetTarget, onReset }: VotesPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState(String(votes.target));
  const [validation, setValidation] = useState<string | null>(null);

  // Keep the input in sync when the target changes from outside (e.g. after saving).
  useEffect(() => {
    setDraft(String(votes.target));
    setValidation(null);
  }, [votes.target]);

  const percent = Math.min(100, Math.round((votes.count / votes.target) * 100));

  const submitTarget = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const target = Number(draft);
    if (draft.trim() === '' || !isValidTarget(target)) {
      setValidation(getErrorMessage('invalid-target'));
      return;
    }
    setValidation(null);
    if (target !== votes.target) {
      onSetTarget(target);
    }
  };

  return (
    <section className="panel" aria-labelledby="votes-heading">
      <h2 id="votes-heading">Aktuelle Runde</h2>
      <p className="vote-count">
        <strong data-testid="vote-count">{numberFormat.format(votes.count)}</strong>
        <span>von {numberFormat.format(votes.target)} Stimmen</span>
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-label="Fortschritt zum Stimmenziel"
        aria-valuemin={0}
        aria-valuemax={votes.target}
        aria-valuenow={Math.min(votes.count, votes.target)}
        data-reached={votes.targetReached}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {votes.targetReached && <p className="target-reached">Ziel erreicht!</p>}

      <button type="button" className="button primary manual-vote" disabled={disabled} onClick={onAddManualVote}>
        <span aria-hidden="true">🚩</span> Flagge manuell hinzufügen
      </button>

      <div className="votes-actions">
        <form className="target-form" onSubmit={submitTarget} noValidate>
          <label htmlFor="target">Stimmenziel</label>
          <div className="input-row">
            <input
              id="target"
              type="number"
              inputMode="numeric"
              min={MIN_TARGET}
              max={MAX_TARGET}
              step={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={disabled}
              aria-invalid={validation ? true : undefined}
              aria-describedby={validation ? 'target-error' : undefined}
            />
            <button type="submit" className="button secondary" disabled={disabled}>
              Übernehmen
            </button>
          </div>
          {validation && (
            <p id="target-error" className="field-error">
              {validation}
            </p>
          )}
        </form>
        <ResetControl disabled={disabled} onReset={onReset} />
      </div>
    </section>
  );
}
