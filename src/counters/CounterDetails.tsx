import { useState } from 'react';
import { changeCounterMode, type CounterProblem } from '../../shared/counterValidation';
import { canUse, limitFor, type EntitlementViolation, type Entitlements } from '../../shared/entitlements';
import { MAX_NAME_LENGTH, type CounterDefinition, type CounterMode } from '../../shared/profiles';
import { MAX_TARGET, MIN_TARGET } from '../../shared/voting';
import {
  Button,
  Callout,
  Card,
  ConfirmDialog,
  Field,
  IconDuplicate,
  IconOverlays,
  IconRefresh,
  IconTrash,
  Input,
  Select,
  Switch
} from '../components/ui';
import { COUNTER_TYPE_LABELS, describeViolation, fieldProblem, triggerProblems } from './counterText';
import { PollOptionsEditor } from './PollOptionsEditor';
import { TriggerEditor } from './TriggerEditor';

const LOCKED_TRIGGERS = 'Eigene Emojis und Begriffe gibt es mit Audience Live Pro.';

type CounterDetailsProps = {
  counter: CounterDefinition;
  index: number;
  total: number;
  entitlements: Entitlements;
  problems: readonly CounterProblem[];
  /** What keeps this element from running on the current plan. */
  violations: readonly EntitlementViolation[];
  /** A round of this element is running and can be reset. */
  running: boolean;
  duplicateBlockedReason: string | null;
  disabled: boolean;
  onChange: (counter: CounterDefinition) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset: () => void;
  onOpenOverlay: () => void;
  onShowLicense: () => void;
};

/** Everything about one counter or poll: name, target, options, triggers and its actions. */
export function CounterDetails({
  counter,
  index,
  total,
  entitlements,
  problems,
  violations,
  running,
  duplicateBlockedReason,
  disabled,
  onChange,
  onDuplicate,
  onDelete,
  onReset,
  onOpenOverlay,
  onShowLicense
}: CounterDetailsProps): React.JSX.Element {
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const [lastTarget, setLastTarget] = useState(counter.target ?? 100);
  const pollsAllowed = canUse(entitlements, 'multi-option-polls');
  const triggersAllowed = canUse(entitlements, 'custom-triggers');
  const title = counter.name.trim() || `Element ${index + 1}`;
  const id = (field: string): string => `counter-${field}-${counter.id}`;
  const singleOption = counter.options[0];

  return (
    <Card className="counter-details" title={title} description={`${COUNTER_TYPE_LABELS[counter.mode]} · Element ${index + 1} von ${total}`}>
      <fieldset className="details-fieldset" disabled={disabled}>
        <legend className="visually-hidden">Einstellungen von {title}</legend>

        <section className="details-section" aria-labelledby={id('general')}>
          <h3 id={id('general')} className="details-heading">
            Allgemein
          </h3>
          <div className="details-fields">
            <Field id={id('name')} label="Name" error={fieldProblem(problems, 'invalid-name')}>
              <Input value={counter.name} maxLength={MAX_NAME_LENGTH} onChange={(event) => onChange({ ...counter, name: event.target.value })} />
            </Field>
            <Field id={id('mode')} label="Typ" hint={pollsAllowed ? undefined : 'Abstimmungen gibt es mit Audience Live Pro.'}>
              <Select value={counter.mode} onChange={(event) => onChange(changeCounterMode(counter, event.target.value as CounterMode))}>
                <option value="single">{COUNTER_TYPE_LABELS.single}</option>
                <option value="poll" disabled={!pollsAllowed && counter.mode !== 'poll'}>
                  {pollsAllowed ? COUNTER_TYPE_LABELS.poll : `${COUNTER_TYPE_LABELS.poll} (Pro)`}
                </option>
              </Select>
            </Field>
            <div className="details-target">
              <Switch
                id={id('has-target')}
                checked={counter.target !== null}
                label="Stimmenziel festlegen"
                onChange={(on) => {
                  if (counter.target !== null) setLastTarget(counter.target);
                  onChange({ ...counter, target: on ? lastTarget : null });
                }}
              />
              {counter.target !== null && (
                <Field id={id('target')} label="Stimmenziel" error={fieldProblem(problems, 'invalid-target')}>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MIN_TARGET}
                    max={MAX_TARGET}
                    step={1}
                    value={counter.target}
                    onChange={(event) => onChange({ ...counter, target: Number(event.target.value) })}
                  />
                </Field>
              )}
            </div>
          </div>
        </section>

        <section className="details-section" aria-labelledby={id('options')}>
          <h3 id={id('options')} className="details-heading">
            {counter.mode === 'poll' ? 'Optionen und Auslöser' : 'Auslöser im Chat'}
          </h3>
          <p className="details-hint">Jede Person hat pro Runde genau eine Stimme{counter.mode === 'poll' ? ' und kann umentscheiden' : ''}.</p>
          {counter.mode === 'poll' ? (
            <PollOptionsEditor
              counter={counter}
              idPrefix={`counter-${counter.id}`}
              problems={problems}
              optionLimit={limitFor(entitlements, 'pollOptions')}
              triggerLimit={limitFor(entitlements, 'optionTriggers')}
              triggersEditable={triggersAllowed}
              onChange={onChange}
            />
          ) : (
            singleOption && (
              <TriggerEditor
                title={`Stimme für ${title}`}
                idPrefix={`option-${singleOption.id}`}
                triggers={singleOption.triggers}
                max={limitFor(entitlements, 'optionTriggers')}
                editable={triggersAllowed}
                problems={triggerProblems(problems, { kind: 'option', optionId: singleOption.id })}
                lockedHint={LOCKED_TRIGGERS}
                onChange={(triggers) => onChange({ ...counter, options: [{ ...singleOption, triggers }] })}
              />
            )
          )}
        </section>

        <section className="details-section" aria-labelledby={id('withdrawal')}>
          <h3 id={id('withdrawal')} className="details-heading">
            Stimme zurücknehmen
          </h3>
          <p className="details-hint">Optional: Mit diesen Auslösern nimmt eine Person ihre Stimme wieder zurück.</p>
          <TriggerEditor
            title={`Stimme zurücknehmen bei ${title}`}
            idPrefix={`withdraw-${counter.id}`}
            triggers={counter.withdrawalTriggers}
            max={limitFor(entitlements, 'withdrawalTriggers')}
            editable={triggersAllowed}
            problems={triggerProblems(problems, { kind: 'withdrawal' })}
            lockedHint={LOCKED_TRIGGERS}
            onChange={(withdrawalTriggers) => onChange({ ...counter, withdrawalTriggers })}
          />
        </section>
      </fieldset>

      {violations.length > 0 && (
        <Callout
          tone="pro"
          title="Dieses Element braucht Audience Live Pro"
          actions={
            <Button size="sm" onClick={onShowLicense}>
              Lizenz & Konto
            </Button>
          }
        >
          <ul>
            {violations.map((violation) => (
              <li key={JSON.stringify(violation)}>{describeViolation(violation)}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="details-actions">
        <Button icon={IconDuplicate} disabled={disabled || duplicateBlockedReason !== null} onClick={onDuplicate}>
          Duplizieren
        </Button>
        <Button icon={IconOverlays} onClick={onOpenOverlay}>
          Overlay öffnen
        </Button>
        {running && (
          <Button icon={IconRefresh} variant="danger-outline" disabled={disabled} onClick={() => setConfirm('reset')}>
            Runde zurücksetzen
          </Button>
        )}
        {total > 1 && (
          <Button icon={IconTrash} variant="danger-outline" disabled={disabled} onClick={() => setConfirm('delete')} aria-label={`${title} löschen`}>
            Löschen
          </Button>
        )}
      </div>
      {duplicateBlockedReason && <p className="details-hint">{duplicateBlockedReason}</p>}
      {total === 1 && <p className="details-hint">Ein Profil braucht mindestens ein Element, darum lässt sich das letzte nicht löschen.</p>}

      <ConfirmDialog
        open={confirm === 'reset'}
        title={`Runde von „${title}“ zurücksetzen?`}
        message="Alle Stimmen dieser Runde werden gelöscht und alle dürfen erneut abstimmen."
        confirmLabel="Ja, zurücksetzen"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          onReset();
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={`„${title}“ löschen?`}
        message="Das Element wird aus dem Profil entfernt, sobald du die Änderungen speicherst. Seine laufende Runde endet dann."
        confirmLabel="Ja, löschen"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          onDelete();
        }}
      />
    </Card>
  );
}
