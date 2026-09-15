import { useId, useState } from 'react';
import {
  MAX_OVERLAY_VIEW_GAP,
  MAX_OVERLAY_VIEW_SCALE,
  MAX_SCENE_ITEMS,
  MIN_OVERLAY_VIEW_GAP,
  MIN_OVERLAY_VIEW_SCALE,
  OVERLAY_LAYOUTS,
  type CounterDefinition,
  type OverlayAlignment,
  type OverlayLayout,
  type OverlaySceneItem
} from '../../shared/profiles';
import { Button, Callout, Field, IconPlus, Input, Select, cx } from '../components/ui';
import { COUNTER_TYPE_LABELS } from '../counters/counterText';
import { SceneItemList } from './SceneItemList';
import { moveItem, nextItemId, toggleItem, type SceneDraft } from './sceneModel';

const LAYOUT_LABELS: Record<OverlayLayout, string> = {
  auto: 'Automatisch',
  vertical: 'Untereinander',
  horizontal: 'Nebeneinander',
  grid: 'Raster'
};

const ALIGNMENTS: readonly OverlayAlignment[] = ['start', 'center', 'end'];

/** Keyed by vertical, then horizontal alignment. */
const POSITION_LABELS: Record<`${OverlayAlignment}-${OverlayAlignment}`, string> = {
  'start-start': 'Oben links',
  'start-center': 'Oben mittig',
  'start-end': 'Oben rechts',
  'center-start': 'Mitte links',
  'center-center': 'Mitte',
  'center-end': 'Mitte rechts',
  'end-start': 'Unten links',
  'end-center': 'Unten mittig',
  'end-end': 'Unten rechts'
};

type SceneEditorProps = {
  draft: SceneDraft;
  counters: readonly CounterDefinition[];
  /** The scene runs in the live overlay right now. */
  live: boolean;
  dirty: boolean;
  pending: boolean;
  onChange: (draft: SceneDraft) => void;
  /** Set while the saved scene has no other unsaved changes: showing, hiding and order then apply at once. */
  onQuickItems?: (items: OverlaySceneItem[]) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

/** Entries, arrangement and size of one scene. Names, sizes and layout reach the stream after saving. */
export function SceneEditor({
  draft,
  counters,
  live,
  dirty,
  pending,
  onChange,
  onQuickItems,
  onSave,
  onDiscard,
  onDuplicate,
  onDelete
}: SceneEditorProps): React.JSX.Element {
  const fieldId = useId();
  const [adding, setAdding] = useState(counters[0]?.id ?? '');
  const update = (patch: Partial<SceneDraft>): void => onChange({ ...draft, ...patch });
  // Showing, hiding and moving elements are live controls: they apply at once unless other changes wait.
  const changeOrder = (items: OverlaySceneItem[]): void => (onQuickItems ? onQuickItems(items) : update({ items }));
  const counterOf = (counterId: string): CounterDefinition | undefined => counters.find((counter) => counter.id === counterId);
  // Entries of the same counter get a running number, so their controls stay distinguishable.
  const labelOf = (index: number): string => {
    const item = draft.items[index];
    if (!item) return '';
    const name = counterOf(item.counterId)?.name ?? 'Unbekanntes Element';
    const same = draft.items.filter((candidate) => candidate.counterId === item.counterId);
    return same.length > 1 ? `${name} (${same.indexOf(item) + 1})` : name;
  };
  const nameError = draft.name.trim() ? null : 'Bitte gib der Szene einen Namen.';
  const full = draft.items.length >= MAX_SCENE_ITEMS;
  const canSave = dirty && !pending && nameError === null && draft.items.length > 0;

  return (
    <section className="scene-editor" aria-labelledby="scene-editor-title">
      <header className="scene-editor-header">
        <h2 id="scene-editor-title" className="scene-editor-title">
          {draft.id ? 'Szene bearbeiten' : 'Neue Szene'}
        </h2>
        {(onDuplicate || onDelete) && (
          <div className="scene-editor-tools">
            {onDuplicate && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={onDuplicate}>
                Duplizieren
              </Button>
            )}
            {onDelete && (
              <Button size="sm" variant="danger-outline" disabled={pending} onClick={onDelete}>
                Löschen
              </Button>
            )}
          </div>
        )}
      </header>

      {live && (
        <Callout tone="warning" title="Diese Szene ist gerade live">
          Änderungen erscheinen nach dem Speichern sofort im Stream.
        </Callout>
      )}

      <Field id={`${fieldId}-name`} label="Name" error={nameError}>
        <Input value={draft.name} maxLength={60} onChange={(event) => update({ name: event.target.value })} />
      </Field>

      <fieldset className="scene-editor-group">
        <legend>Elemente</legend>
        <SceneItemList
          rows={draft.items.map((item, index) => {
            const counter = counterOf(item.counterId);
            return {
              id: item.id,
              label: labelOf(index),
              detail: counter ? COUNTER_TYPE_LABELS[counter.mode] : '',
              hidden: item.hidden === true,
              scale: item.scale
            };
          })}
          disabled={pending}
          onToggle={(id) => changeOrder(toggleItem(draft.items, id))}
          onMove={(id, offset) => changeOrder(moveItem(draft.items, id, offset))}
          onRemove={(id) => update({ items: draft.items.filter((item) => item.id !== id) })}
          onScale={(id, scale) => update({ items: draft.items.map((item) => (item.id === id ? { ...item, scale } : item)) })}
        />
        <p className="ui-field-hint">
          {onQuickItems
            ? 'Ein- und Ausblenden und die Reihenfolge wirken sofort im Stream.'
            : 'Ein- und Ausblenden und die Reihenfolge werden mit dem Speichern übernommen.'}
        </p>
        <div className="scene-add">
          <Field id={`${fieldId}-add`} label="Element hinzufügen" hint="Dasselbe Element darf mehrmals vorkommen, zum Beispiel groß und klein.">
            <Select value={adding} onChange={(event) => setAdding(event.target.value)}>
              {counters.map((counter) => (
                <option key={counter.id} value={counter.id}>
                  {counter.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            icon={IconPlus}
            disabled={!adding || full}
            onClick={() => update({ items: [...draft.items, { id: nextItemId(draft.items), counterId: adding, scale: 100 }] })}
          >
            Hinzufügen
          </Button>
        </div>
        {full && <p className="ui-field-hint">Eine Szene zeigt höchstens {MAX_SCENE_ITEMS} Elemente.</p>}
      </fieldset>

      <fieldset className="scene-editor-group">
        <legend>Anordnung</legend>
        <Field id={`${fieldId}-layout`} label="Layout">
          <Select value={draft.layout} onChange={(event) => update({ layout: event.target.value as OverlayLayout })}>
            {OVERLAY_LAYOUTS.map((layout) => (
              <option key={layout} value={layout}>
                {LAYOUT_LABELS[layout]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="scene-position-field">
          <p id={`${fieldId}-position`} className="ui-field-label">
            Position im Bild
          </p>
          <div className="scene-position" role="group" aria-labelledby={`${fieldId}-position`}>
            {ALIGNMENTS.map((vertical) =>
              ALIGNMENTS.map((horizontal) => {
                const key = `${vertical}-${horizontal}` as const;
                const checked = draft.verticalAlign === vertical && draft.horizontalAlign === horizontal;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={checked}
                    aria-label={POSITION_LABELS[key]}
                    title={POSITION_LABELS[key]}
                    className={cx('scene-position-cell', checked && 'is-checked')}
                    onClick={() => update({ verticalAlign: vertical, horizontalAlign: horizontal })}
                  >
                    <span aria-hidden="true" />
                  </button>
                );
              })
            )}
          </div>
        </div>
        <label className="scene-range">
          Gesamtgröße
          <span className="scene-range-row">
            <input
              type="range"
              min={MIN_OVERLAY_VIEW_SCALE}
              max={MAX_OVERLAY_VIEW_SCALE}
              step={5}
              value={draft.scale}
              onChange={(event) => update({ scale: Number(event.target.value) })}
            />
            <span className="scene-range-value" aria-hidden="true">
              {draft.scale} %
            </span>
          </span>
        </label>
        <label className="scene-range">
          Abstand
          <span className="scene-range-row">
            <input
              type="range"
              min={MIN_OVERLAY_VIEW_GAP}
              max={MAX_OVERLAY_VIEW_GAP}
              step={4}
              value={draft.gap}
              onChange={(event) => update({ gap: Number(event.target.value) })}
            />
            <span className="scene-range-value" aria-hidden="true">
              {draft.gap} px
            </span>
          </span>
        </label>
      </fieldset>

      <footer className="scene-editor-footer">
        <Button variant="ghost" disabled={pending || (draft.id !== null && !dirty)} onClick={onDiscard}>
          {draft.id ? 'Verwerfen' : 'Abbrechen'}
        </Button>
        <Button variant="primary" disabled={!canSave} loading={pending && dirty} onClick={onSave}>
          {draft.id ? 'Speichern' : 'Szene erstellen'}
        </Button>
      </footer>
    </section>
  );
}
