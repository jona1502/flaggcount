import type { CounterDefinition } from '../../shared/profiles';
import { Badge, IconButton, IconChevronDown, IconChevronUp, IconCounters, IconPoll, cx, type Tone } from '../components/ui';
import { COUNTER_TYPE_LABELS } from './counterText';

export type CounterListItem = {
  counter: CounterDefinition;
  status: { tone: Tone; label: string };
  overlay: { tone: Tone; label: string };
  changed: boolean;
};

type CounterListProps = {
  items: CounterListItem[];
  selectedId: string | undefined;
  disabled: boolean;
  onSelect: (counterId: string) => void;
  onMove: (counterId: string, offset: -1 | 1) => void;
};

function summary(counter: CounterDefinition): string {
  const triggers = counter.options.reduce((sum, option) => sum + option.triggers.length, 0);
  const parts = [
    COUNTER_TYPE_LABELS[counter.mode],
    ...(counter.mode === 'poll' ? [`${counter.options.length} Optionen`] : []),
    `${triggers} ${triggers === 1 ? 'Auslöser' : 'Auslöser'}`,
    counter.target === null ? 'ohne Ziel' : `Ziel ${new Intl.NumberFormat('de-DE').format(counter.target)}`
  ];
  return parts.join(' · ');
}

/** The elements of the profile in their order; the first one is also the classic overlay. */
export function CounterList({ items, selectedId, disabled, onSelect, onMove }: CounterListProps): React.JSX.Element {
  return (
    <ol className="counter-list" aria-label="Elemente im Profil">
      {items.map(({ counter, status, overlay, changed }, index) => {
        const selected = counter.id === selectedId;
        const name = counter.name.trim() || `Element ${index + 1}`;
        const Icon = counter.mode === 'poll' ? IconPoll : IconCounters;
        return (
          <li key={counter.id} className={cx('counter-list-item', selected && 'is-selected')}>
            <button type="button" className="counter-list-select" aria-pressed={selected} onClick={() => onSelect(counter.id)}>
              <span className="counter-list-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <span className="counter-list-text">
                <span className="counter-list-name">{name}</span>
                <span className="counter-list-meta">{summary(counter)}</span>
              </span>
            </button>
            <div className="counter-list-badges">
              <Badge tone={status.tone}>{status.label}</Badge>
              <Badge tone={overlay.tone}>{overlay.label}</Badge>
              {changed && <Badge tone="warning">Ungespeichert</Badge>}
            </div>
            {items.length > 1 && (
              <div className="counter-list-order">
                <IconButton
                  size="sm"
                  icon={IconChevronUp}
                  label={`${name} nach oben verschieben`}
                  disabled={disabled || index === 0}
                  onClick={() => onMove(counter.id, -1)}
                />
                <IconButton
                  size="sm"
                  icon={IconChevronDown}
                  label={`${name} nach unten verschieben`}
                  disabled={disabled || index === items.length - 1}
                  onClick={() => onMove(counter.id, 1)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
