import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from './cx';

export type TabItem<Id extends string> = {
  id: Id;
  label: ReactNode;
};

type TabsProps<Id extends string> = {
  label: string;
  idPrefix: string;
  items: readonly TabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  className?: string;
};

/** Tab list with roving focus: arrow keys, Home and End move between tabs and select them. */
export function Tabs<Id extends string>({ label, idPrefix, items, value, onChange, className }: TabsProps<Id>): React.JSX.Element {
  const tabs = useRef(new Map<Id, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = items.findIndex((item) => item.id === value);
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const item = items[(next + items.length) % items.length];
    if (!item) return;
    onChange(item.id);
    tabs.current.get(item.id)?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={cx('ui-tabs', className)}>
      {items.map((item) => (
        <button
          key={item.id}
          ref={(element) => {
            if (element) tabs.current.set(item.id, element);
            else tabs.current.delete(item.id);
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${item.id}`}
          aria-selected={item.id === value}
          // Only the selected panel is rendered, so only its tab may point to it.
          aria-controls={item.id === value ? `${idPrefix}-panel-${item.id}` : undefined}
          tabIndex={item.id === value ? 0 : -1}
          className="ui-tab"
          onClick={() => onChange(item.id)}
          onKeyDown={onKeyDown}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children }: { idPrefix: string; id: string; children: ReactNode }): React.JSX.Element {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className="ui-tab-panel">
      {children}
    </div>
  );
}
