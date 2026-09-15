import { useEffect, useId, useState, type CSSProperties, type FormEvent } from 'react';
import { MAX_TARGET, MIN_TARGET, isValidTarget } from '../../shared/voting';
import { Badge, Button, ConfirmDialog, Field, IconButton, IconMinus, IconPlus, IconRefresh, IconTarget, Input } from '../components/ui';
import { COUNTER_TYPE_LABELS } from '../counters/counterText';
import { getErrorMessage } from '../dashboard/errorMessages';
import type { LiveCounter } from './liveCounters';

const numberFormat = new Intl.NumberFormat('de-DE');
const percentFormat = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });

type TargetFormProps = {
  id: string;
  target: number | null;
  /** Keeps several target fields apart for screen readers. */
  labelSuffix?: string;
  disabled: boolean;
  onSubmit: (target: number) => void;
  /** Closes the form after a valid target or Escape. */
  onDone: () => void;
};

function TargetForm({ id, target, labelSuffix, disabled, onSubmit, onDone }: TargetFormProps): React.JSX.Element {
  const [draft, setDraft] = useState(target === null ? '' : String(target));
  const [validation, setValidation] = useState<string | null>(null);

  // Follow targets that changed elsewhere, e.g. after saving.
  useEffect(() => {
    setDraft(target === null ? '' : String(target));
    setValidation(null);
  }, [target]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const next = Number(draft);
    if (draft.trim() === '' || !isValidTarget(next)) {
      setValidation(getErrorMessage('invalid-target'));
      return;
    }
    setValidation(null);
    if (next !== target) onSubmit(next);
    onDone();
  };

  return (
    <form
      className="live-target-form"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone();
      }}
      noValidate
    >
      <Field
        id={id}
        label={
          <>
            Stimmenziel
            {labelSuffix && <span className="visually-hidden"> {labelSuffix}</span>}
          </>
        }
        error={validation}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={MIN_TARGET}
          max={MAX_TARGET}
          step={1}
          value={draft}
          disabled={disabled}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={disabled}>
        Übernehmen
      </Button>
    </form>
  );
}

/** Chat words or emojis shown as small chips, so they are quick to read aloud during a stream. */
function ChatTriggers({ label, values }: { label: string; values: string[] }): React.JSX.Element | null {
  if (values.length === 0) return null;
  return (
    <p className="live-chat">
      <span className="live-chat-label">{label}</span>
      {values.map((value, index) => (
        <span key={`${index}-${value}`} className="live-chip">
          {value}
        </span>
      ))}
    </p>
  );
}

type LiveCounterCardProps = {
  counter: LiveCounter;
  /** The only card on the page keeps the short, familiar button names. */
  alone: boolean;
  disabled: boolean;
  onAddVote: (optionId: string) => void;
  onRemoveVote: (optionId: string) => void;
  onReset: () => void;
  /** Only the first counter changes its target right here. */
  onSetTarget?: (target: number) => void;
  onEditTarget?: () => void;
};

/** Live view of one counter or poll with large, safe manual corrections. */
export function LiveCounterCard({
  counter,
  alone,
  disabled,
  onAddVote,
  onRemoveVote,
  onReset,
  onSetTarget,
  onEditTarget
}: LiveCounterCardProps): React.JSX.Element {
  const headingId = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const { definition } = counter;
  const tie = counter.leaders.length > 1;
  const single = counter.options[0];
  const withdrawal = definition?.withdrawalTriggers.map((trigger) => trigger.value) ?? [];
  const triggersOf = (optionId: string): string[] =>
    definition?.options.find((option) => option.id === optionId)?.triggers.map((trigger) => trigger.value) ?? [];
  const resetLabel = alone ? 'Runde zurücksetzen' : `${counter.name} zurücksetzen`;
  const voteWord = counter.redFlags ? 'Flagge' : 'Stimme';

  return (
    <article className="live-card" aria-labelledby={headingId} data-reached={counter.targetReached}>
      <header className="live-card-header">
        <div className="live-card-heading">
          <h2 id={headingId} className="live-card-title">
            {counter.name}
          </h2>
          <p className="live-card-type">{COUNTER_TYPE_LABELS[counter.mode]}</p>
        </div>
        <div className="live-card-tools">
          {counter.targetReached && <Badge tone="success">Ziel erreicht!</Badge>}
          {(onSetTarget || onEditTarget) && (
            <Button
              variant="ghost"
              size="sm"
              icon={IconTarget}
              disabled={Boolean(onSetTarget) && disabled}
              aria-label={alone ? undefined : `Ziel von ${counter.name} ändern`}
              aria-expanded={onSetTarget ? editingTarget : undefined}
              onClick={() => {
                if (onSetTarget) setEditingTarget((open) => !open);
                else onEditTarget?.();
              }}
            >
              Ziel ändern
            </Button>
          )}
          <IconButton variant="danger-outline" icon={IconRefresh} label={resetLabel} disabled={disabled} onClick={() => setConfirmReset(true)} />
        </div>
      </header>

      {editingTarget && onSetTarget && (
        <TargetForm
          id={alone ? 'target' : `target-${counter.counterId}`}
          target={counter.target}
          labelSuffix={alone ? undefined : `von ${counter.name}`}
          disabled={disabled}
          onSubmit={onSetTarget}
          onDone={() => setEditingTarget(false)}
        />
      )}

      <p className="live-total">
        <strong data-testid={counter.primary ? 'vote-count' : undefined}>{numberFormat.format(counter.total)}</strong>
        <span>{counter.target === null ? (counter.total === 1 ? 'Stimme' : 'Stimmen') : `von ${numberFormat.format(counter.target)} Stimmen`}</span>
      </p>

      {counter.progress !== null && counter.target !== null && (
        <div
          className="live-progress"
          role="progressbar"
          aria-label={alone ? 'Fortschritt zum Stimmenziel' : `Fortschritt von ${counter.name}`}
          aria-valuemin={0}
          aria-valuemax={counter.target}
          aria-valuenow={Math.min(counter.total, counter.target)}
          data-reached={counter.targetReached}
        >
          <div className="live-progress-fill" style={{ width: `${counter.progress}%` }} />
        </div>
      )}

      {counter.mode === 'poll' ? (
        <ul className="live-options">
          {counter.options.map((option) => (
            <li key={option.optionId} className="live-option" data-leading={option.leading} style={{ '--option-color': option.color } as CSSProperties}>
              <div className="live-option-head">
                <span className="option-dot" aria-hidden="true" />
                <span className="live-option-label">{option.label}</span>
                {option.leading && <Badge tone="success">{tie ? 'Gleichstand' : 'Führt'}</Badge>}
                <span className="live-option-count">
                  {numberFormat.format(option.count)} · {percentFormat.format(option.share)}
                </span>
              </div>
              <div className="live-option-bar" aria-hidden="true">
                <div style={{ width: `${Math.round(option.share * 100)}%` }} />
              </div>
              <div className="live-option-actions">
                <ChatTriggers label="Im Chat" values={triggersOf(option.optionId)} />
                <Button
                  size="lg"
                  icon={IconPlus}
                  disabled={disabled}
                  aria-label={`Stimme für ${option.label} hinzufügen`}
                  onClick={() => onAddVote(option.optionId)}
                >
                  1
                </Button>
                <Button
                  size="lg"
                  icon={IconMinus}
                  disabled={disabled || option.count === 0}
                  aria-label={`Stimme für ${option.label} abziehen`}
                  onClick={() => onRemoveVote(option.optionId)}
                >
                  1
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        single && (
          <>
            <div className="live-single-actions">
              <Button
                size="lg"
                variant="primary"
                icon={IconPlus}
                disabled={disabled}
                aria-label={alone ? undefined : `Stimme für ${counter.name} hinzufügen`}
                onClick={() => onAddVote(single.optionId)}
              >
                {voteWord} hinzufügen
              </Button>
              <Button
                size="lg"
                icon={IconMinus}
                disabled={disabled || counter.total === 0}
                aria-label={alone ? undefined : `Stimme für ${counter.name} abziehen`}
                onClick={() => onRemoveVote(single.optionId)}
              >
                {voteWord} abziehen
              </Button>
            </div>
            <ChatTriggers label="Im Chat abstimmen" values={triggersOf(single.optionId)} />
          </>
        )
      )}

      <ChatTriggers label="Im Chat zurücknehmen" values={withdrawal} />

      <ConfirmDialog
        open={confirmReset}
        title={alone ? 'Runde zurücksetzen?' : `„${counter.name}“ zurücksetzen?`}
        message="Alle automatischen und manuellen Stimmen dieser Runde werden gelöscht. Danach dürfen alle erneut abstimmen."
        confirmLabel="Ja, zurücksetzen"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          onReset();
        }}
      />
    </article>
  );
}
