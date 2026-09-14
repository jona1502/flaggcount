import { useEffect, useState } from 'react';
import type { CounterDefinition, OverlayLayout, OverlayView, OverlayViewInput } from '../../shared/profiles';
import { Button, Dialog, Field, IconButton, IconChevronDown, IconChevronUp, Input, Select } from '../components/ui';

const DEFAULT_INPUT: OverlayViewInput = {
  name: '',
  counterIds: [],
  layout: 'auto',
  gap: 18,
  horizontalAlign: 'center',
  verticalAlign: 'center',
  scale: 92
};

type OverlayComposerProps = {
  open: boolean;
  counters: readonly CounterDefinition[];
  view?: OverlayView | null;
  pending: boolean;
  onClose: () => void;
  onSave: (input: OverlayViewInput) => void;
};

const labels: Record<OverlayLayout, string> = {
  auto: 'Automatisch',
  vertical: 'Untereinander',
  horizontal: 'Nebeneinander',
  grid: 'Raster'
};

export function OverlayComposer({ open, counters, view, pending, onClose, onSave }: OverlayComposerProps): React.JSX.Element | null {
  const [draft, setDraft] = useState<OverlayViewInput>(DEFAULT_INPUT);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setDraft(
      view
        ? {
            name: view.name,
            counterIds: [...view.counterIds],
            layout: view.layout,
            gap: view.gap,
            horizontalAlign: view.horizontalAlign,
            verticalAlign: view.verticalAlign,
            scale: view.scale
          }
        : { ...DEFAULT_INPUT, counterIds: counters[0] ? [counters[0].id] : [] }
    );
  }, [open, view, counters]);

  if (!open) return null;
  const nameError = submitted && !draft.name.trim() ? 'Bitte gib der Ansicht einen Namen.' : null;
  const counterError = submitted && draft.counterIds.length === 0 ? 'Wähle mindestens ein Element aus.' : null;
  const move = (index: number, direction: -1 | 1): void => {
    const next = [...draft.counterIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setDraft({ ...draft, counterIds: next });
  };

  const submit = (): void => {
    setSubmitted(true);
    if (!draft.name.trim() || draft.counterIds.length === 0) return;
    onSave({ ...draft, name: draft.name.trim() });
  };

  return (
    <Dialog
      open
      title={view ? 'Overlay-Ansicht bearbeiten' : 'Neue Overlay-Ansicht'}
      description="Wähle, welche Zähler und Abstimmungen gemeinsam in einer Browser Source erscheinen."
      onClose={onClose}
      size="lg"
      className="overlay-composer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" loading={pending} onClick={submit}>{view ? 'Änderungen speichern' : 'Ansicht erstellen'}</Button>
        </>
      }
    >
      <div className="overlay-composer-form">
        <Field id="overlay-view-name" label="Name" error={nameError}>
          <Input
            value={draft.name}
            maxLength={60}
            placeholder="z. B. Hauptszene"
            data-autofocus
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </Field>

        <fieldset className="overlay-composer-elements" aria-describedby={counterError ? 'overlay-elements-error' : undefined}>
          <legend>Elemente auswählen</legend>
          <p className="ui-field-hint">Alle gewählten Elemente werden live in derselben Overlay-URL angezeigt.</p>
          <div className="overlay-composer-checks">
            {counters.map((counter) => {
              const checked = draft.counterIds.includes(counter.id);
              return (
                <label key={counter.id} className="overlay-composer-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setDraft({
                      ...draft,
                      counterIds: checked
                        ? draft.counterIds.filter((id) => id !== counter.id)
                        : [...draft.counterIds, counter.id]
                    })}
                  />
                  <span><strong>{counter.name}</strong><small>{counter.mode === 'poll' ? 'Abstimmung' : 'Einfacher Zähler'}</small></span>
                </label>
              );
            })}
          </div>
          {counterError && <p id="overlay-elements-error" className="ui-field-error">{counterError}</p>}
        </fieldset>

        {draft.counterIds.length > 1 && (
          <div className="overlay-composer-order">
            <h3>Reihenfolge</h3>
            <ol>
              {draft.counterIds.map((id, index) => {
                const counter = counters.find((candidate) => candidate.id === id);
                return (
                  <li key={id}>
                    <span>{counter?.name ?? id}</span>
                    <span>
                      <IconButton icon={IconChevronUp} label={`${counter?.name ?? id} nach oben`} disabled={index === 0} onClick={() => move(index, -1)} />
                      <IconButton icon={IconChevronDown} label={`${counter?.name ?? id} nach unten`} disabled={index === draft.counterIds.length - 1} onClick={() => move(index, 1)} />
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className="overlay-composer-layout">
          <Field id="overlay-view-layout" label="Layout">
            <Select value={draft.layout} onChange={(event) => setDraft({ ...draft, layout: event.target.value as OverlayLayout })}>
              {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field id="overlay-view-gap" label="Abstand" hint={`${draft.gap} px`}>
            <Input type="range" min={0} max={64} value={draft.gap} onChange={(event) => setDraft({ ...draft, gap: Number(event.target.value) })} />
          </Field>
          <Field id="overlay-view-scale" label="Größe" hint={`${draft.scale} %`}>
            <Input type="range" min={20} max={100} value={draft.scale} onChange={(event) => setDraft({ ...draft, scale: Number(event.target.value) })} />
          </Field>
          <Field id="overlay-view-horizontal" label="Horizontal ausrichten">
            <Select value={draft.horizontalAlign} onChange={(event) => setDraft({ ...draft, horizontalAlign: event.target.value as OverlayViewInput['horizontalAlign'] })}>
              <option value="start">Links</option><option value="center">Mitte</option><option value="end">Rechts</option>
            </Select>
          </Field>
          <Field id="overlay-view-vertical" label="Vertikal ausrichten">
            <Select value={draft.verticalAlign} onChange={(event) => setDraft({ ...draft, verticalAlign: event.target.value as OverlayViewInput['verticalAlign'] })}>
              <option value="start">Oben</option><option value="center">Mitte</option><option value="end">Unten</option>
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
