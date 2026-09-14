import { useEffect, useState } from 'react';
import { duplicateCounter, findCounterProblems } from '../../shared/counterValidation';
import { checkCounters, limitFor, missingProFeatures } from '../../shared/entitlements';
import type { CounterDefinition } from '../../shared/profiles';
import { PageHeader } from '../app-shell/PageHeader';
import { Badge, Button, Callout, IconLive, IconOverlays, IconPlus, IconRefresh, useToast, type Tone } from '../components/ui';
import { CounterDetails } from '../counters/CounterDetails';
import { CounterList, type CounterListItem } from '../counters/CounterList';
import { CreateCounterWizard } from '../counters/CreateCounterWizard';
import { describeViolation } from '../counters/counterText';
import { describeFeature } from '../pro/proFeatures';
import type { PageProps } from './types';

const copyOf = (counters: readonly CounterDefinition[]): CounterDefinition[] => JSON.parse(JSON.stringify(counters)) as CounterDefinition[];

/** Create, edit, duplicate, sort and delete the counters and polls of the running profile. */
export function CountersPage({ model, route, pending, error, actions, navigate, onUnsavedChanges }: PageProps): React.JSX.Element {
  const { state, entitlements, running, runningCounters, isPro } = model;
  const saved = running.counters;
  const source = JSON.stringify(saved);
  const deepLink = route.page === 'counters' ? route : null;
  const toast = useToast();

  const [draft, setDraft] = useState(() => copyOf(saved));
  const [selectedId, setSelectedId] = useState<string | undefined>(deepLink?.counterId ?? saved[0]?.id);
  const [wizardOpen, setWizardOpen] = useState(deepLink?.create === true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [savingFrom, setSavingFrom] = useState<string | null>(null);

  // Saved or switched counters replace the draft.
  useEffect(() => {
    setDraft(copyOf(JSON.parse(source) as CounterDefinition[]));
  }, [source]);

  const dirty = JSON.stringify(draft) !== source;
  useEffect(() => onUnsavedChanges(dirty), [dirty, onUnsavedChanges]);
  useEffect(() => () => onUnsavedChanges(false), [onUnsavedChanges]);

  // A created counter counts as done once the backend reports it as part of the profile.
  useEffect(() => {
    if (!creatingId) return;
    const created = saved.find((counter) => counter.id === creatingId);
    if (!created) return;
    setCreatingId(null);
    setCreatedId(created.id);
    setSelectedId(created.id);
    setWizardOpen(false);
    toast({ title: `„${created.name}“ wurde erstellt`, description: 'Es läuft jetzt in der Live-Steuerung.' });
  }, [creatingId, saved, toast]);

  useEffect(() => {
    if (savingFrom === null || source === savingFrom) return;
    setSavingFrom(null);
    toast({ title: 'Änderungen gespeichert' });
  }, [savingFrom, source, toast]);

  // A failed save or creation is reported by the backend error; nothing is confirmed then.
  useEffect(() => {
    if (!error) return;
    setSavingFrom(null);
    setCreatingId(null);
  }, [error]);

  const counterLimit = limitFor(entitlements, 'counters');
  const overlayLimit = limitFor(entitlements, 'overlayUrls');
  const effectiveIds = new Set(runningCounters.map((counter) => counter.id));
  const liveIds = new Set(state.counters.map((snapshot) => snapshot.counterId));
  const missing = missingProFeatures(state.license.plan, state.license.features);

  const items: CounterListItem[] = draft.map((counter, index) => {
    const stored = saved.find((candidate) => candidate.id === counter.id);
    const status: { tone: Tone; label: string } = !stored
      ? { tone: 'info', label: 'Neu' }
      : !effectiveIds.has(counter.id)
        ? { tone: 'warning', label: 'Pausiert' }
        : liveIds.has(counter.id)
          ? { tone: 'success', label: 'Läuft' }
          : { tone: 'neutral', label: 'Bereit' };
    const overlay: { tone: Tone; label: string } =
      index < overlayLimit ? { tone: 'neutral', label: 'Eigenes Overlay' } : { tone: 'pro', label: 'Overlay mit Pro' };
    return { counter, status, overlay, changed: JSON.stringify(stored) !== JSON.stringify(counter) };
  });

  const selectedIndex = Math.max(0, draft.findIndex((counter) => counter.id === selectedId));
  const selected = draft[selectedIndex];
  const hasProblems = draft.some((counter) => findCounterProblems(counter).length > 0);
  const violations = checkCounters(draft, entitlements);
  const canSave = dirty && !pending && !hasProblems && violations.length === 0;

  const update = (next: CounterDefinition): void => setDraft((current) => current.map((counter) => (counter.id === next.id ? next : counter)));
  const move = (counterId: string, offset: -1 | 1): void =>
    setDraft((current) => {
      const from = current.findIndex((counter) => counter.id === counterId);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const reordered = [...current];
      [reordered[from], reordered[to]] = [reordered[to] as CounterDefinition, reordered[from] as CounterDefinition];
      return reordered;
    });

  return (
    <div className="page counters-page">
      <PageHeader
        title="Zähler & Abstimmungen"
        description={`Elemente des Profils „${running.name}“. Änderungen werden erst mit „Änderungen speichern“ übernommen.`}
        badge={
          <Badge tone="neutral">
            {draft.length} von {counterLimit} {counterLimit === 1 ? 'Element' : 'Elementen'}
          </Badge>
        }
        actions={
          <Button variant="primary" icon={IconPlus} disabled={dirty} onClick={() => setWizardOpen(true)}>
            Neues Element
          </Button>
        }
      />

      {missing.length > 0 && (
        <Callout
          tone="warning"
          title="Pro-Funktionen fehlen"
          actions={
            <>
              <Button size="sm" icon={IconRefresh} loading={pending} onClick={() => void actions.refreshLicense()}>
                Lizenzstatus aktualisieren
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate({ page: 'license' })}>
                Lizenz & Konto
              </Button>
            </>
          }
        >
          <p>Deine Lizenz meldet FlagCount Pro, diese Funktionen sind aber nicht freigegeben:</p>
          <ul>
            {missing.map((feature) => (
              <li key={feature}>{describeFeature(feature).title}</li>
            ))}
          </ul>
          <p>Aktualisiere den Lizenzstatus. Bleibt es dabei, hilft der Support mit deiner Lizenzreferenz weiter.</p>
        </Callout>
      )}

      {!isPro && (
        <Callout
          tone="pro"
          title="Mehr mit FlagCount Pro"
          actions={
            <Button size="sm" onClick={() => navigate({ page: 'license' })}>
              Pro ansehen
            </Button>
          }
        >
          Abstimmungen mit bis zu sechs Optionen, eigene Emojis und Begriffe sowie bis zu vier Zähler gleichzeitig – jeweils mit eigenem Overlay.
        </Callout>
      )}

      {createdId && selected?.id === createdId && (
        <Callout
          tone="success"
          title="Element erstellt und gespeichert"
          actions={
            <>
              <Button size="sm" icon={IconLive} onClick={() => navigate({ page: 'live' })}>
                Live-Steuerung öffnen
              </Button>
              <Button size="sm" icon={IconOverlays} onClick={() => navigate({ page: 'overlays', target: createdId })}>
                Overlay einrichten
              </Button>
            </>
          }
        >
          Es erscheint jetzt in der Live-Steuerung und hat ein eigenes Overlay.
        </Callout>
      )}

      <div className="counters-layout">
        <CounterList items={items} selectedId={selected?.id} disabled={pending} onSelect={setSelectedId} onMove={move} />
        {selected && (
          <CounterDetails
            key={selected.id}
            counter={selected}
            index={selectedIndex}
            total={draft.length}
            entitlements={entitlements}
            problems={findCounterProblems(selected)}
            violations={checkCounters([selected], entitlements)}
            running={liveIds.has(selected.id)}
            duplicateBlockedReason={
              draft.length >= counterLimit
                ? `Dein Tarif erlaubt höchstens ${counterLimit} ${counterLimit === 1 ? 'Element' : 'Elemente'} gleichzeitig.`
                : null
            }
            disabled={pending}
            onChange={update}
            onDuplicate={() => {
              const copy = duplicateCounter(selected);
              setDraft((current) => [...current, copy]);
              setSelectedId(copy.id);
            }}
            onDelete={() => {
              setDraft((current) => current.filter((counter) => counter.id !== selected.id));
              setSelectedId(draft.find((counter) => counter.id !== selected.id)?.id);
            }}
            onReset={() => void actions.resetVotes(selected.id)}
            onOpenOverlay={() => navigate({ page: 'overlays', target: selected.id })}
            onShowLicense={() => navigate({ page: 'license' })}
          />
        )}
      </div>

      {dirty && (
        <div className="save-bar" role="region" aria-label="Ungespeicherte Änderungen">
          <div className="save-bar-text">
            <strong>Ungespeicherte Änderungen</strong>
            <span>
              {violations.length > 0
                ? violations.map(describeViolation).join(' ')
                : hasProblems
                  ? 'Bitte korrigiere die markierten Felder.'
                  : 'Speichere, damit die Live-Steuerung und die Overlays die Änderungen übernehmen.'}
            </span>
          </div>
          <Button variant="ghost" disabled={pending} onClick={() => setDraft(copyOf(saved))}>
            Änderungen verwerfen
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            loading={pending && savingFrom !== null}
            onClick={() => {
              setSavingFrom(source);
              void actions.saveCounters(draft);
            }}
          >
            Änderungen speichern
          </Button>
        </div>
      )}

      {wizardOpen && (
        <CreateCounterWizard
          existing={saved}
          entitlements={entitlements}
          busy={pending}
          error={error}
          onCancel={() => setWizardOpen(false)}
          onCreate={(counter) => {
            setCreatingId(counter.id);
            void actions.saveCounters([...saved, counter]);
          }}
          onShowLicense={() => {
            setWizardOpen(false);
            navigate({ page: 'license' });
          }}
        />
      )}
    </div>
  );
}
