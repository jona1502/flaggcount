import type { CSSProperties } from 'react';
import { appendPollOption, type CounterProblem } from '../../shared/counterValidation';
import { MAX_NAME_LENGTH, MAX_POLL_OPTIONS, MIN_POLL_OPTIONS, type CounterDefinition, type PollOption } from '../../shared/profiles';
import { Button, Field, IconButton, IconPlus, IconTrash, Input } from '../components/ui';
import { fieldProblem, optionLabelProblem, triggerProblems } from './counterText';
import { TriggerEditor } from './TriggerEditor';

type PollOptionsEditorProps = {
  counter: CounterDefinition;
  idPrefix: string;
  problems: readonly CounterProblem[];
  optionLimit: number;
  triggerLimit: number;
  triggersEditable: boolean;
  /** The wizard edits labels and triggers in separate steps; the detail view shows both. */
  showLabels?: boolean;
  showTriggers?: boolean;
  onChange: (counter: CounterDefinition) => void;
};

/** Two to six options of a poll, each with label, color and its own chat triggers. */
export function PollOptionsEditor({
  counter,
  idPrefix,
  problems,
  optionLimit,
  triggerLimit,
  triggersEditable,
  showLabels = true,
  showTriggers = true,
  onChange
}: PollOptionsEditorProps): React.JSX.Element {
  const maxOptions = Math.min(optionLimit, MAX_POLL_OPTIONS);
  const updateOption = (index: number, change: (option: PollOption) => PollOption): void =>
    onChange({ ...counter, options: counter.options.map((option, position) => (position === index ? change(option) : option)) });
  const countProblem = fieldProblem(problems, 'option-count');

  return (
    <div className="option-editor-block">
      <ol className="option-editor-list">
        {counter.options.map((option, index) => {
          const optionName = option.label.trim() || `Option ${index + 1}`;
          return (
            <li key={option.id} className="option-editor" style={{ '--option-color': option.accentColor } as CSSProperties}>
              {showLabels ? (
                <div className="option-editor-fields">
                  <Field
                    id={`${idPrefix}-option-label-${option.id}`}
                    label={`Bezeichnung von Option ${index + 1}`}
                    error={optionLabelProblem(problems, option.id)}
                  >
                    <Input
                      value={option.label}
                      maxLength={MAX_NAME_LENGTH}
                      onChange={(event) => updateOption(index, (current) => ({ ...current, label: event.target.value }))}
                    />
                  </Field>
                  <Field id={`${idPrefix}-option-color-${option.id}`} label={`Farbe von Option ${index + 1}`} className="option-color-field">
                    <input
                      type="color"
                      className="option-color-input"
                      value={option.accentColor}
                      onChange={(event) => updateOption(index, (current) => ({ ...current, accentColor: event.target.value }))}
                    />
                  </Field>
                  {counter.options.length > MIN_POLL_OPTIONS && (
                    <IconButton
                      className="option-remove"
                      variant="danger-outline"
                      icon={IconTrash}
                      label={`${optionName} entfernen`}
                      onClick={() => onChange({ ...counter, options: counter.options.filter((_, position) => position !== index) })}
                    />
                  )}
                </div>
              ) : (
                <p className="option-editor-name">
                  <span className="option-dot" aria-hidden="true" />
                  {optionName}
                </p>
              )}
              {showTriggers && (
                <TriggerEditor
                  title={`Stimme für ${optionName}`}
                  idPrefix={`${idPrefix}-option-${option.id}`}
                  triggers={option.triggers}
                  max={triggerLimit}
                  editable={triggersEditable}
                  problems={triggerProblems(problems, { kind: 'option', optionId: option.id })}
                  lockedHint="Eigene Emojis und Begriffe gibt es mit FlagCount Pro."
                  onChange={(triggers) => updateOption(index, (current) => ({ ...current, triggers }))}
                />
              )}
            </li>
          );
        })}
      </ol>

      {showLabels && (
        <div className="option-editor-footer">
          <span className="ui-field-hint">
            {counter.options.length} von {maxOptions} Optionen
          </span>
          {counter.options.length < maxOptions && (
            <Button icon={IconPlus} size="sm" aria-label={`Option zu ${counter.name.trim() || 'Abstimmung'} hinzufügen`} onClick={() => onChange(appendPollOption(counter))}>
              Option hinzufügen
            </Button>
          )}
        </div>
      )}
      {countProblem && <p className="ui-field-error">{countProblem}</p>}
    </div>
  );
}
