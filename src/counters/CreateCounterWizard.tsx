import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AppError } from '../../shared/appState';
import { createPollCounter, createSingleCounter, findCounterProblems, type CounterProblem } from '../../shared/counterValidation';
import { canUse, checkCounters, limitFor, type Entitlements } from '../../shared/entitlements';
import { MAX_NAME_LENGTH, type CounterDefinition, type CounterMode } from '../../shared/profiles';
import { MAX_TARGET, MIN_TARGET } from '../../shared/voting';
import {
  Badge,
  Button,
  Callout,
  Dialog,
  Field,
  IconCheck,
  IconChevronLeft,
  IconCounters,
  IconPoll,
  Input,
  Switch
} from '../components/ui';
import { getErrorMessage } from '../dashboard/errorMessages';
import { COUNTER_TYPE_LABELS, describeProblem, describeViolation, fieldProblem, triggerProblems } from './counterText';
import { PollOptionsEditor } from './PollOptionsEditor';
import { TriggerEditor } from './TriggerEditor';

type Step = 'type' | 'basics' | 'options' | 'triggers' | 'withdrawal' | 'summary';

const STEP_TITLES: Record<Step, string> = {
  type: 'Typ',
  basics: 'Name & Ziel',
  options: 'Optionen',
  triggers: 'Auslöser',
  withdrawal: 'Rücknahme',
  summary: 'Zusammenfassung'
};

const TYPE_DESCRIPTIONS: Record<CounterMode, string> = {
  single: 'Zählt eine Sache, zum Beispiel rote Flaggen oder 🔥 im Chat.',
  poll: 'Zwei bis sechs Optionen wie A/B oder Team Rot/Blau. Jede Person hat eine Stimme und kann umentscheiden.'
};

const LOCKED_TRIGGERS = 'Eigene Emojis und Begriffe gibt es mit Audience Live Pro. Free zählt 🚩 und nimmt mit 🏳️ zurück.';

function stepsFor(mode: CounterMode): Step[] {
  return mode === 'poll' ? ['type', 'basics', 'options', 'triggers', 'withdrawal', 'summary'] : ['type', 'basics', 'triggers', 'withdrawal', 'summary'];
}

const isWithdrawalProblem = (problem: CounterProblem): boolean =>
  ((problem.code === 'too-many-triggers' || problem.code === 'invalid-trigger') && problem.owner.kind === 'withdrawal') ||
  (problem.code === 'duplicate-trigger' && problem.owners.some((owner) => owner.kind === 'withdrawal'));

/** Problems that keep the current step from continuing. */
function problemsOf(step: Step, problems: CounterProblem[]): CounterProblem[] {
  switch (step) {
    case 'basics':
      return problems.filter((problem) => problem.code === 'invalid-name' || problem.code === 'invalid-target');
    case 'options':
      return problems.filter((problem) => problem.code === 'option-count' || problem.code === 'invalid-label' || problem.code === 'invalid-color');
    case 'triggers':
      return problems.filter(
        (problem) =>
          problem.code === 'missing-trigger' ||
          (!isWithdrawalProblem(problem) && (problem.code === 'too-many-triggers' || problem.code === 'invalid-trigger' || problem.code === 'duplicate-trigger'))
      );
    case 'withdrawal':
      return problems.filter(isWithdrawalProblem);
    case 'summary':
      return problems;
    case 'type':
      return [];
  }
}

type CreateCounterWizardProps = {
  existing: CounterDefinition[];
  entitlements: Entitlements;
  busy: boolean;
  /** The last backend error, shown here because the dialog covers the global banner. */
  error: AppError | null;
  onCancel: () => void;
  onCreate: (counter: CounterDefinition) => void;
  onShowLicense: () => void;
};

/** Guided creation of a counter or poll in at most six steps. */
export function CreateCounterWizard({
  existing,
  entitlements,
  busy,
  error,
  onCancel,
  onCreate,
  onShowLicense
}: CreateCounterWizardProps): React.JSX.Element {
  const pollsAllowed = canUse(entitlements, 'multi-option-polls');
  const triggersAllowed = canUse(entitlements, 'custom-triggers');
  const isPro = entitlements.plan === 'pro';
  const counterLimit = limitFor(entitlements, 'counters');
  const limitReached = existing.length >= counterLimit;
  const number = existing.length + 1;

  const template = (mode: CounterMode): CounterDefinition =>
    mode === 'poll'
      ? createPollCounter(`Abstimmung ${number}`)
      : triggersAllowed
        ? createSingleCounter(`Zähler ${number}`, [{ kind: 'emoji', value: '🔥', match: 'contains' }], [])
        : createSingleCounter(`Zähler ${number}`);

  const [draft, setDraft] = useState<CounterDefinition>(() => template(pollsAllowed ? 'poll' : 'single'));
  const [stepIndex, setStepIndex] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [lastTarget, setLastTarget] = useState(100);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const steps = stepsFor(draft.mode);
  const step = steps[stepIndex] ?? 'type';
  const problems = findCounterProblems(draft);
  const stepProblems = problemsOf(step, problems);
  const violations = checkCounters([...existing, draft], entitlements);
  const typeLocked = (mode: CounterMode): boolean => mode === 'poll' && !pollsAllowed;
  const canContinue = step === 'type' ? !limitReached && !typeLocked(draft.mode) : stepProblems.length === 0;
  const canCreate = problems.length === 0 && violations.length === 0 && !limitReached;

  // Each new step is announced by moving focus to its title.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepTitle.current?.focus();
  }, [stepIndex]);

  const listProblems = (list: CounterProblem[]): React.JSX.Element | null =>
    list.length > 0 ? (
      <div className="wizard-problems">
        {list.map((problem) => (
          <p key={JSON.stringify(problem)} className="ui-field-error">
            {describeProblem(problem)}
          </p>
        ))}
      </div>
    ) : null;

  const renderStep = (): React.JSX.Element => {
    switch (step) {
      case 'type':
        return (
          <>
            {limitReached && (
              <Callout
                tone={isPro ? 'warning' : 'pro'}
                title={`Höchstens ${counterLimit} ${counterLimit === 1 ? 'Element' : 'Elemente'} gleichzeitig`}
                actions={
                  !isPro && (
                    <Button size="sm" onClick={onShowLicense}>
                      Pro ansehen
                    </Button>
                  )
                }
              >
                {isPro
                  ? 'Lösche ein Element dieses Profils oder lege für weitere Elemente ein neues Profil an.'
                  : 'Audience Live Free zählt ein Element. Bearbeite den bestehenden Zähler oder hol dir Pro für bis zu vier Zähler und Abstimmungen gleichzeitig.'}
              </Callout>
            )}
            <fieldset className="type-choice">
              <legend className="visually-hidden">Typ des Elements</legend>
              {(['single', 'poll'] as const).map((mode) => {
                const locked = typeLocked(mode);
                const selected = draft.mode === mode;
                const Icon = mode === 'poll' ? IconPoll : IconCounters;
                const inputDisabled = locked || limitReached;
                return (
                  <div key={mode} className="type-card" data-selected={selected} data-locked={locked}>
                    <input
                      type="radio"
                      id={`wizard-type-${mode}`}
                      name="wizard-type"
                      value={mode}
                      checked={selected}
                      disabled={inputDisabled}
                      aria-describedby={`wizard-type-${mode}-description`}
                      data-autofocus={selected && !inputDisabled ? true : undefined}
                      onChange={() => {
                        setDraft(template(mode));
                        setAttempted(false);
                      }}
                    />
                    <label htmlFor={`wizard-type-${mode}`} className="type-card-label">
                      <span className="type-card-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      {COUNTER_TYPE_LABELS[mode]}
                    </label>
                    <p id={`wizard-type-${mode}-description`} className="type-card-description">
                      {TYPE_DESCRIPTIONS[mode]}
                      {locked &&
                        (isPro
                          ? ' Deine Lizenz enthält diese Funktion gerade nicht – aktualisiere den Lizenzstatus unter „Pro & Lizenz“.'
                          : ' Abstimmungen gibt es mit Audience Live Pro.')}
                    </p>
                    {locked && <Badge tone="pro">{isPro ? 'Nicht freigegeben' : 'Pro erforderlich'}</Badge>}
                  </div>
                );
              })}
            </fieldset>
          </>
        );
      case 'basics':
        return (
          <div className="wizard-fields">
            <Field id="wizard-name" label="Name" hint="Erscheint in der Übersicht und im Overlay." error={fieldProblem(problems, 'invalid-name')}>
              <Input value={draft.name} maxLength={MAX_NAME_LENGTH} data-autofocus onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Switch
              id="wizard-has-target"
              checked={draft.target !== null}
              label="Stimmenziel festlegen"
              description="Mit Ziel zeigt das Overlay einen Fortschrittsbalken."
              onChange={(on) => {
                if (draft.target !== null) setLastTarget(draft.target);
                setDraft({ ...draft, target: on ? lastTarget : null });
              }}
            />
            {draft.target !== null && (
              <Field id="wizard-target" label="Stimmenziel" error={fieldProblem(problems, 'invalid-target')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={MIN_TARGET}
                  max={MAX_TARGET}
                  step={1}
                  value={draft.target}
                  onChange={(event) => setDraft({ ...draft, target: Number(event.target.value) })}
                />
              </Field>
            )}
          </div>
        );
      case 'options':
        return (
          <PollOptionsEditor
            counter={draft}
            idPrefix="wizard"
            problems={problems}
            optionLimit={limitFor(entitlements, 'pollOptions')}
            triggerLimit={limitFor(entitlements, 'optionTriggers')}
            triggersEditable={triggersAllowed}
            showTriggers={false}
            onChange={setDraft}
          />
        );
      case 'triggers':
        return (
          <>
            <p className="wizard-hint">
              Zuschauer stimmen ab, indem sie einen Auslöser in den Chat schreiben. Ein Auslöser darf pro Element nur einmal vorkommen.
            </p>
            {draft.mode === 'poll' ? (
              <PollOptionsEditor
                counter={draft}
                idPrefix="wizard"
                problems={problems}
                optionLimit={limitFor(entitlements, 'pollOptions')}
                triggerLimit={limitFor(entitlements, 'optionTriggers')}
                triggersEditable={triggersAllowed}
                showLabels={false}
                onChange={setDraft}
              />
            ) : (
              draft.options[0] && (
                <TriggerEditor
                  title={`Stimme für ${draft.name.trim() || 'den Zähler'}`}
                  idPrefix="wizard-single"
                  triggers={draft.options[0].triggers}
                  max={limitFor(entitlements, 'optionTriggers')}
                  editable={triggersAllowed}
                  problems={triggerProblems(problems, { kind: 'option', optionId: draft.options[0].id })}
                  lockedHint={LOCKED_TRIGGERS}
                  onChange={(triggers) => setDraft({ ...draft, options: [{ ...draft.options[0]!, triggers }] })}
                />
              )
            )}
          </>
        );
      case 'withdrawal':
        return (
          <>
            <p className="wizard-hint">Optional: Mit diesen Auslösern nimmt eine Person ihre Stimme wieder zurück.</p>
            <TriggerEditor
              title="Stimme zurücknehmen"
              idPrefix="wizard-withdrawal"
              triggers={draft.withdrawalTriggers}
              max={limitFor(entitlements, 'withdrawalTriggers')}
              editable={triggersAllowed}
              problems={triggerProblems(problems, { kind: 'withdrawal' })}
              lockedHint={LOCKED_TRIGGERS}
              emptyText="Keine – Stimmen lassen sich nicht zurücknehmen"
              onChange={(withdrawalTriggers) => setDraft({ ...draft, withdrawalTriggers })}
            />
          </>
        );
      case 'summary':
        return (
          <>
            <dl className="wizard-summary">
              <div>
                <dt>Typ</dt>
                <dd>{COUNTER_TYPE_LABELS[draft.mode]}</dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd>{draft.name}</dd>
              </div>
              <div>
                <dt>Stimmenziel</dt>
                <dd>{draft.target === null ? 'Ohne Ziel' : new Intl.NumberFormat('de-DE').format(draft.target)}</dd>
              </div>
              <div>
                <dt>{draft.mode === 'poll' ? 'Optionen' : 'Auslöser'}</dt>
                <dd>
                  <ul className="wizard-summary-options">
                    {draft.options.map((option) => (
                      <li key={option.id} style={{ '--option-color': option.accentColor } as CSSProperties}>
                        {draft.mode === 'poll' && (
                          <>
                            <span className="option-dot" aria-hidden="true" />
                            <strong>{option.label}</strong>:{' '}
                          </>
                        )}
                        {option.triggers.map((trigger) => trigger.value).join(' · ') || 'keine'}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt>Rücknahme</dt>
                <dd>{draft.withdrawalTriggers.map((trigger) => trigger.value).join(' · ') || 'Keine'}</dd>
              </div>
            </dl>
            {listProblems(problems)}
            {violations.length > 0 && (
              <Callout tone="pro" title="Dafür brauchst du Audience Live Pro">
                <ul>
                  {violations.map((violation) => (
                    <li key={JSON.stringify(violation)}>{describeViolation(violation)}</li>
                  ))}
                </ul>
              </Callout>
            )}
            {attempted && error && !busy && (
              <Callout tone="danger" title="Das Element wurde nicht erstellt" role="alert">
                {getErrorMessage(error.code)}
              </Callout>
            )}
            <p className="wizard-hint">Nach dem Erstellen wird das Element gespeichert, läuft sofort in der Übersicht und bekommt ein eigenes Overlay.</p>
          </>
        );
    }
  };

  return (
    <Dialog
      open
      title="Neues Element"
      description="Lege einen Zähler oder eine Abstimmung für das laufende Profil an."
      onClose={onCancel}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
          <span className="wizard-footer-spacer" />
          {stepIndex > 0 && (
            <Button icon={IconChevronLeft} onClick={() => setStepIndex(stepIndex - 1)}>
              Zurück
            </Button>
          )}
          {step === 'summary' ? (
            <Button
              variant="primary"
              icon={IconCheck}
              loading={busy && attempted}
              disabled={!canCreate}
              onClick={() => {
                setAttempted(true);
                onCreate(draft);
              }}
            >
              Erstellen
            </Button>
          ) : (
            <Button variant="primary" disabled={!canContinue} onClick={() => setStepIndex(stepIndex + 1)}>
              Weiter
            </Button>
          )}
        </>
      }
    >
      <ol className="wizard-steps" aria-label="Schritte">
        {steps.map((candidate, index) => (
          <li key={candidate} aria-current={index === stepIndex ? 'step' : undefined} data-done={index < stepIndex}>
            <span className="wizard-step-number" aria-hidden="true">
              {index < stepIndex ? <IconCheck size={12} /> : index + 1}
            </span>
            <span className="wizard-step-label">{STEP_TITLES[candidate]}</span>
          </li>
        ))}
      </ol>
      <h3 ref={stepTitle} tabIndex={-1} className="wizard-step-title">
        Schritt {stepIndex + 1} von {steps.length}: {STEP_TITLES[step]}
      </h3>
      <div className="wizard-body">{renderStep()}</div>
    </Dialog>
  );
}
