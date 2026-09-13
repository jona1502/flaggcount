import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  changeCounterMode,
  createPollCounter,
  createPollOption,
  findCounterProblems,
  type CounterProblem,
  type TriggerOwner
} from '../../shared/counterValidation';
import {
  canUse,
  checkCounters,
  entitlementsFor,
  limitFor,
  type EntitlementViolation,
  type LimitName
} from '../../shared/entitlements';
import type { LicenseState } from '../../shared/licensing';
import { MAX_NAME_LENGTH, MIN_POLL_OPTIONS, type CounterDefinition, type CounterMode, type PollOption } from '../../shared/profiles';
import { MAX_TARGET, MIN_TARGET } from '../../shared/voting';
import { parseTrigger, triggerKey, type Trigger, type TriggerKind, type TriggerMatch } from '../../shared/voting/triggers';
import { describeFeature } from '../pro/proFeatures';

type CounterEditorProps = {
  counters: CounterDefinition[];
  license: LicenseState;
  disabled: boolean;
  /** The profile is not covered by the plan and can only be viewed. */
  readOnly: boolean;
  onSave: (counters: CounterDefinition[]) => void;
  onShowPro: () => void;
};

const LIMIT_NAMES: Record<LimitName, string> = {
  profiles: 'Profile',
  counters: 'Zähler gleichzeitig',
  pollOptions: 'Optionen pro Abstimmung',
  optionTriggers: 'Auslöser pro Option',
  withdrawalTriggers: 'Rücknahme-Auslöser',
  overlayUrls: 'Overlay-Adressen',
  historyRecords: 'gespeicherte Runden',
  logoBytes: 'Bytes für das Logo',
  backgroundBytes: 'Bytes für den Hintergrund'
};

function ownerName(owner: TriggerOwner): string {
  return owner.kind === 'withdrawal' ? 'Zurücknehmen' : `Option „${owner.label || '?'}“`;
}

export function describeProblem(problem: CounterProblem): string {
  switch (problem.code) {
    case 'invalid-name':
      return `Der Name braucht 1 bis ${MAX_NAME_LENGTH} Zeichen.`;
    case 'invalid-target':
      return 'Das Stimmenziel muss eine ganze Zahl zwischen 1 und 100.000 sein.';
    case 'option-count':
      return `Eine Abstimmung braucht ${problem.min} bis ${problem.max} Optionen.`;
    case 'invalid-label':
      return `Jede Option braucht eine Bezeichnung mit 1 bis ${MAX_NAME_LENGTH} Zeichen.`;
    case 'invalid-color':
      return 'Eine Optionsfarbe ist ungültig.';
    case 'missing-trigger':
      return `Option „${problem.label || '?'}“ braucht mindestens einen Auslöser.`;
    case 'too-many-triggers':
      return `${ownerName(problem.owner)} hat mehr als ${problem.max} Auslöser.`;
    case 'invalid-trigger':
      return `„${problem.value}“ ist kein gültiger Auslöser.`;
    case 'duplicate-trigger':
      return `„${problem.value}“ gehört zu mehreren Stellen (${problem.owners.map(ownerName).join(', ')}). Ein Auslöser darf pro Zähler nur einmal vorkommen, sonst wäre eine Stimme mehrdeutig.`;
  }
}

export function describeViolation(violation: EntitlementViolation): string {
  return violation.kind === 'feature'
    ? `${describeFeature(violation.feature).title} gibt es mit FlagCount Pro.`
    : `Dein Tarif erlaubt höchstens ${violation.allowed} ${LIMIT_NAMES[violation.limit]}.`;
}

type TriggerListProps = {
  title: string;
  idPrefix: string;
  triggers: Trigger[];
  max: number;
  editable: boolean;
  onChange: (triggers: Trigger[]) => void;
};

function TriggerList({ title, idPrefix, triggers, max, editable, onChange }: TriggerListProps): React.JSX.Element {
  const [kind, setKind] = useState<TriggerKind>('emoji');
  const [value, setValue] = useState('');
  const [match, setMatch] = useState<TriggerMatch>('word');
  const [error, setError] = useState<string | null>(null);

  const add = (): void => {
    const trigger = parseTrigger({ kind, value, match: kind === 'emoji' ? 'contains' : match });
    if (!trigger) {
      setError(
        kind === 'emoji'
          ? 'Ein Emoji-Auslöser darf nur Emojis ohne Leerzeichen enthalten.'
          : 'Ein Text-Auslöser braucht 1 bis 40 Zeichen.'
      );
      return;
    }
    if (triggers.some((existing) => triggerKey(existing) === triggerKey(trigger))) {
      setError('Diesen Auslöser gibt es hier schon.');
      return;
    }
    setError(null);
    setValue('');
    onChange([...triggers, trigger]);
  };

  const addOnEnter = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  };

  return (
    <div className="trigger-list" role="group" aria-labelledby={`${idPrefix}-title`}>
      <span id={`${idPrefix}-title`} className="trigger-title">
        {title}
      </span>
      <ul className="trigger-chips">
        {triggers.map((trigger) => (
          <li key={`${trigger.kind}:${trigger.value}:${trigger.match}`} className="trigger-chip">
            <span>{trigger.value}</span>
            <span className="hint">{trigger.kind === 'emoji' ? 'Emoji' : trigger.match === 'word' ? 'ganzes Wort' : 'enthält'}</span>
            {editable && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Auslöser ${trigger.value} entfernen (${title})`}
                onClick={() => onChange(triggers.filter((existing) => existing !== trigger))}
              >
                ×
              </button>
            )}
          </li>
        ))}
        {triggers.length === 0 && <li className="hint">Keine</li>}
      </ul>
      {editable ? (
        triggers.length < max && (
          <div className="trigger-add">
            <label htmlFor={`${idPrefix}-kind`} className="visually-hidden">
              Art des neuen Auslösers ({title})
            </label>
            <select id={`${idPrefix}-kind`} value={kind} onChange={(event) => setKind(event.target.value as TriggerKind)}>
              <option value="emoji">Emoji</option>
              <option value="text">Text</option>
            </select>
            <label htmlFor={`${idPrefix}-value`} className="visually-hidden">
              Neuer Auslöser ({title})
            </label>
            <input
              id={`${idPrefix}-value`}
              value={value}
              maxLength={40}
              placeholder={kind === 'emoji' ? '🔥' : 'z. B. ja'}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={addOnEnter}
            />
            {kind === 'text' && (
              <>
                <label htmlFor={`${idPrefix}-match`} className="visually-hidden">
                  Vergleich ({title})
                </label>
                <select id={`${idPrefix}-match`} value={match} onChange={(event) => setMatch(event.target.value as TriggerMatch)}>
                  <option value="word">ganzes Wort</option>
                  <option value="contains">enthält</option>
                </select>
              </>
            )}
            <button type="button" className="button secondary" aria-label={`Auslöser hinzufügen (${title})`} onClick={add}>
              Hinzufügen
            </button>
          </div>
        )
      ) : (
        <p className="hint">
          <span className="pro-tag">Pro</span> Eigene Emojis und Begriffe
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Counters and polls of the running profile, validated live before they can be saved. */
export function CounterEditor({ counters, license, disabled, readOnly, onSave, onShowPro }: CounterEditorProps): React.JSX.Element {
  const source = JSON.stringify(counters);
  const [draft, setDraft] = useState<CounterDefinition[]>(() => JSON.parse(source) as CounterDefinition[]);

  // Saved or switched counters replace the draft.
  useEffect(() => {
    setDraft(JSON.parse(source) as CounterDefinition[]);
  }, [source]);

  const entitlements = entitlementsFor(license.plan, license.features);
  const counterLimit = limitFor(entitlements, 'counters');
  const optionLimit = limitFor(entitlements, 'pollOptions');
  const pollsAllowed = canUse(entitlements, 'multi-option-polls');
  const triggersAllowed = canUse(entitlements, 'custom-triggers');

  const dirty = JSON.stringify(draft) !== source;
  const problems = draft.map(findCounterProblems);
  const violations = checkCounters(draft, entitlements);
  const canSave = dirty && !readOnly && !disabled && violations.length === 0 && problems.every((list) => list.length === 0);

  const updateCounter = (index: number, change: (counter: CounterDefinition) => CounterDefinition): void =>
    setDraft((current) => current.map((counter, position) => (position === index ? change(counter) : counter)));
  const updateOption = (counterIndex: number, optionIndex: number, change: (option: PollOption) => PollOption): void =>
    updateCounter(counterIndex, (counter) => ({
      ...counter,
      options: counter.options.map((option, position) => (position === optionIndex ? change(option) : option))
    }));

  return (
    <section className="panel counter-editor" aria-labelledby="counters-heading">
      <div className="panel-heading">
        <h2 id="counters-heading">Zähler und Abstimmungen</h2>
        <span className="limit-note">
          {draft.length} von {counterLimit} {counterLimit === 1 ? 'Zähler' : 'Zählern'}
        </span>
      </div>
      <p className="hint">Jede Person hat pro Zähler und Runde genau eine Stimme und kann bei Abstimmungen umentscheiden.</p>
      {readOnly && (
        <p className="hint">Dieses Profil ist nur mit FlagCount Pro nutzbar. Du kannst es ansehen, aber nicht ändern.</p>
      )}

      {draft.map((counter, counterIndex) => {
        const title = counter.name.trim() || `Zähler ${counterIndex + 1}`;
        return (
          <fieldset key={counter.id} className="counter-card" disabled={disabled || readOnly}>
            <legend>{title}</legend>
            <div className="counter-fields">
              <div>
                <label htmlFor={`counter-name-${counter.id}`}>Name</label>
                <input
                  id={`counter-name-${counter.id}`}
                  value={counter.name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) => updateCounter(counterIndex, (current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div>
                <label htmlFor={`counter-mode-${counter.id}`}>Art</label>
                <select
                  id={`counter-mode-${counter.id}`}
                  value={counter.mode}
                  onChange={(event) => updateCounter(counterIndex, (current) => changeCounterMode(current, event.target.value as CounterMode))}
                >
                  <option value="single">Einzelner Zähler</option>
                  <option value="poll" disabled={!pollsAllowed && counter.mode !== 'poll'}>
                    {pollsAllowed ? 'Abstimmung mit Optionen' : 'Abstimmung mit Optionen (Pro)'}
                  </option>
                </select>
              </div>
              <div>
                <label htmlFor={`counter-target-${counter.id}`}>Stimmenziel</label>
                <div className="input-row">
                  <input
                    id={`counter-target-${counter.id}`}
                    type="number"
                    min={MIN_TARGET}
                    max={MAX_TARGET}
                    value={counter.target ?? ''}
                    disabled={counter.target === null}
                    onChange={(event) => updateCounter(counterIndex, (current) => ({ ...current, target: Number(event.target.value) }))}
                  />
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={counter.target === null}
                      onChange={(event) =>
                        updateCounter(counterIndex, (current) => ({ ...current, target: event.target.checked ? null : 100 }))
                      }
                    />
                    Ohne Ziel
                  </label>
                </div>
              </div>
            </div>

            <div className="option-list">
              {counter.options.map((option, optionIndex) => {
                const optionName = option.label.trim() || `Option ${optionIndex + 1}`;
                return (
                  <div key={option.id} className="option-card">
                    {counter.mode === 'poll' && (
                      <div className="counter-fields">
                        <div>
                          <label htmlFor={`option-label-${option.id}`}>Bezeichnung von Option {optionIndex + 1}</label>
                          <input
                            id={`option-label-${option.id}`}
                            value={option.label}
                            maxLength={MAX_NAME_LENGTH}
                            onChange={(event) => updateOption(counterIndex, optionIndex, (current) => ({ ...current, label: event.target.value }))}
                          />
                        </div>
                        <div>
                          <label htmlFor={`option-color-${option.id}`}>Farbe von Option {optionIndex + 1}</label>
                          <input
                            id={`option-color-${option.id}`}
                            type="color"
                            value={option.accentColor}
                            onChange={(event) =>
                              updateOption(counterIndex, optionIndex, (current) => ({ ...current, accentColor: event.target.value }))
                            }
                          />
                        </div>
                      </div>
                    )}
                    <TriggerList
                      title={counter.mode === 'poll' ? `Stimme für ${optionName}` : `Stimme für ${title}`}
                      idPrefix={`option-${option.id}`}
                      triggers={option.triggers}
                      max={limitFor(entitlements, 'optionTriggers')}
                      editable={triggersAllowed && !readOnly}
                      onChange={(triggers) => updateOption(counterIndex, optionIndex, (current) => ({ ...current, triggers }))}
                    />
                    {counter.mode === 'poll' && counter.options.length > MIN_POLL_OPTIONS && (
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={`${optionName} entfernen`}
                        onClick={() =>
                          updateCounter(counterIndex, (current) => ({
                            ...current,
                            options: current.options.filter((_, position) => position !== optionIndex)
                          }))
                        }
                      >
                        Option entfernen
                      </button>
                    )}
                  </div>
                );
              })}
              {counter.mode === 'poll' && counter.options.length < optionLimit && (
                <button
                  type="button"
                  className="button secondary"
                  aria-label={`Option zu ${title} hinzufügen`}
                  onClick={() =>
                    updateCounter(counterIndex, (current) => ({
                      ...current,
                      options: [...current.options, createPollOption(current.options.length)]
                    }))
                  }
                >
                  Option hinzufügen
                </button>
              )}
            </div>

            <TriggerList
              title={`Stimme zurücknehmen bei ${title}`}
              idPrefix={`withdraw-${counter.id}`}
              triggers={counter.withdrawalTriggers}
              max={limitFor(entitlements, 'withdrawalTriggers')}
              editable={triggersAllowed && !readOnly}
              onChange={(withdrawalTriggers) => updateCounter(counterIndex, (current) => ({ ...current, withdrawalTriggers }))}
            />

            {(problems[counterIndex]?.length ?? 0) > 0 && (
              <ul className="problem-list" aria-label={`Probleme bei ${title}`}>
                {problems[counterIndex]?.map((problem) => (
                  <li key={JSON.stringify(problem)} className="field-error">
                    {describeProblem(problem)}
                  </li>
                ))}
              </ul>
            )}

            {draft.length > 1 && (
              <button
                type="button"
                className="button danger-outline"
                aria-label={`${title} entfernen`}
                onClick={() => setDraft((current) => current.filter((_, position) => position !== counterIndex))}
              >
                Zähler entfernen
              </button>
            )}
          </fieldset>
        );
      })}

      <div className="editor-actions">
        {draft.length < counterLimit && !readOnly && (
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={() => setDraft((current) => [...current, createPollCounter(`Abstimmung ${current.length + 1}`)])}
          >
            Abstimmung hinzufügen
          </button>
        )}
        <button type="button" className="button primary" disabled={!canSave} onClick={() => onSave(draft)}>
          Zähler speichern
        </button>
        <button type="button" className="button secondary" disabled={!dirty} onClick={() => setDraft(JSON.parse(source) as CounterDefinition[])}>
          Änderungen verwerfen
        </button>
      </div>

      {violations.length > 0 ? (
        <div className="pro-hint">
          <span className="pro-tag">Pro</span>
          <ul className="plain-list">
            {violations.map((violation) => (
              <li key={JSON.stringify(violation)}>{describeViolation(violation)}</li>
            ))}
          </ul>
          <button type="button" className="button secondary" onClick={onShowPro}>
            Mehr zu Pro
          </button>
        </div>
      ) : (
        license.plan !== 'pro' && (
          <div className="pro-hint">
            <span className="pro-tag">Pro</span>
            <p>Eigene Emojis und Begriffe, Abstimmungen mit bis zu sechs Optionen und bis zu vier Zähler gleichzeitig gibt es mit FlagCount Pro.</p>
            <button type="button" className="button secondary" onClick={onShowPro}>
              Mehr zu Pro
            </button>
          </div>
        )
      )}
    </section>
  );
}
