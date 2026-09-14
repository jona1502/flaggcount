import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { parseTrigger, triggerKey, type Trigger, type TriggerKind, type TriggerMatch } from '../../shared/voting/triggers';
import { Badge, Button, IconButton, IconClose, IconPlus, Input, Select } from '../components/ui';
import { describeTrigger } from './counterText';

type TriggerEditorProps = {
  title: string;
  idPrefix: string;
  triggers: Trigger[];
  max: number;
  /** Without custom triggers the list is shown but cannot change. */
  editable: boolean;
  /** Validation problems of this list, e.g. a trigger that also belongs to another option. */
  problems?: string[];
  lockedHint?: ReactNode;
  emptyText?: string;
  onChange: (triggers: Trigger[]) => void;
};

/** Chat triggers as removable chips plus a small form to add emoji or text triggers. */
export function TriggerEditor({
  title,
  idPrefix,
  triggers,
  max,
  editable,
  problems = [],
  lockedHint,
  emptyText = 'Keine Auslöser',
  onChange
}: TriggerEditorProps): React.JSX.Element {
  const [kind, setKind] = useState<TriggerKind>('emoji');
  const [value, setValue] = useState('');
  const [match, setMatch] = useState<TriggerMatch>('word');
  const [error, setError] = useState<string | null>(null);

  const add = (): void => {
    const trigger = parseTrigger({ kind, value, match: kind === 'emoji' ? 'contains' : match });
    if (!trigger) {
      setError(kind === 'emoji' ? 'Ein Emoji-Auslöser darf nur Emojis ohne Leerzeichen enthalten.' : 'Ein Text-Auslöser braucht 1 bis 40 Zeichen.');
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

  const messages = [...(error ? [error] : []), ...problems];
  const messagesId = `${idPrefix}-messages`;

  return (
    <div className="trigger-editor" role="group" aria-labelledby={`${idPrefix}-title`} data-invalid={messages.length > 0 || undefined}>
      <div className="trigger-editor-head">
        <span id={`${idPrefix}-title`} className="trigger-editor-title">
          {title}
        </span>
        <span className="trigger-editor-count">
          {triggers.length} von {max}
        </span>
      </div>

      <ul className="trigger-chips">
        {triggers.map((trigger) => (
          <li key={`${trigger.kind}:${trigger.value}:${trigger.match}`} className="trigger-chip">
            <span className="trigger-chip-value">{trigger.value}</span>
            <span className="trigger-chip-kind">{describeTrigger(trigger)}</span>
            {editable && (
              <IconButton
                size="sm"
                icon={IconClose}
                label={`Auslöser ${trigger.value} entfernen (${title})`}
                onClick={() => onChange(triggers.filter((existing) => existing !== trigger))}
              />
            )}
          </li>
        ))}
        {triggers.length === 0 && <li className="trigger-chip-empty">{emptyText}</li>}
      </ul>

      {editable ? (
        triggers.length < max ? (
          <div className="trigger-add">
            <label htmlFor={`${idPrefix}-kind`} className="visually-hidden">
              Art des neuen Auslösers ({title})
            </label>
            <Select
              id={`${idPrefix}-kind`}
              className="trigger-add-kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as TriggerKind);
                setError(null);
              }}
            >
              <option value="emoji">Emoji</option>
              <option value="text">Text</option>
            </Select>
            <label htmlFor={`${idPrefix}-value`} className="visually-hidden">
              Neuer Auslöser ({title})
            </label>
            <Input
              id={`${idPrefix}-value`}
              className="trigger-add-value"
              value={value}
              maxLength={40}
              placeholder={kind === 'emoji' ? 'z. B. 🔥' : 'z. B. ja'}
              aria-invalid={error ? true : undefined}
              aria-describedby={messages.length > 0 ? messagesId : undefined}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={addOnEnter}
            />
            {kind === 'text' && (
              <>
                <label htmlFor={`${idPrefix}-match`} className="visually-hidden">
                  Vergleich ({title})
                </label>
                <Select
                  id={`${idPrefix}-match`}
                  className="trigger-add-match"
                  value={match}
                  onChange={(event) => setMatch(event.target.value as TriggerMatch)}
                >
                  <option value="word">ganzes Wort</option>
                  <option value="contains">enthält</option>
                </Select>
              </>
            )}
            <Button icon={IconPlus} aria-label={`Auslöser hinzufügen (${title})`} onClick={add}>
              Hinzufügen
            </Button>
          </div>
        ) : (
          <p className="ui-field-hint">Höchstens {max} Auslöser.</p>
        )
      ) : (
        lockedHint && (
          <p className="trigger-locked">
            <Badge tone="pro" srLabel="Pro erforderlich">
              Pro
            </Badge>{' '}
            {lockedHint}
          </p>
        )
      )}

      {messages.length > 0 && (
        <div id={messagesId} className="trigger-messages">
          {messages.map((message) => (
            <p key={message} className="ui-field-error">
              {message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
