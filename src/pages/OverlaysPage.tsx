import { useRef, useState } from 'react';
import { canUse } from '../../shared/entitlements';
import type { OverlaySettings } from '../../shared/settings';
import { PageHeader } from '../app-shell/PageHeader';
import { Button, Callout, ConfirmDialog, IconPlus, useToast } from '../components/ui';
import { OverlayComposer } from '../overlays/OverlayComposer';
import { OverlayEditor } from '../overlays/OverlayEditor';
import { OverlayTargetCard } from '../overlays/OverlayTargetCard';
import { overlayTargets } from '../overlays/overlayTargets';
import type { PageProps } from './types';

/** An overlay for every counter and poll plus the combined view, each with its own design and URLs. */
export function OverlaysPage({ model, route, pending, actions, navigate, onCopyText, desktop }: PageProps): React.JSX.Element {
  const { state, entitlements, running, runningCounters, isPro } = model;
  const targets = overlayTargets(state, entitlements, running.counters, runningCounters, running.overlayViews);
  const [selectedId, setSelectedId] = useState(route.page === 'overlays' && route.target ? route.target : targets[0]?.id);
  const [composer, setComposer] = useState<null | { mode: 'create' } | { mode: 'edit'; viewId: string }>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selected = targets.find((target) => target.id === selectedId) ?? targets[0];
  const editorTitle = useRef<HTMLHeadingElement>(null);
  const toast = useToast();

  const copy = async (url: string): Promise<boolean> => {
    try {
      await onCopyText(url);
      toast({ title: 'URL kopiert', description: 'Füge sie jetzt in OBS oder TikTok LIVE Studio ein.' });
      return true;
    } catch {
      toast({ tone: 'danger', title: 'Kopieren fehlgeschlagen', description: 'Bitte markiere die URL und kopiere sie manuell.' });
      return false;
    }
  };

  // Every change carries the id of the element it belongs to, so designs never leak between counters.
  const saveDesign = (counterId: string, overlay: OverlaySettings): void => {
    if (desktop) void actions.setCounterOverlaySettings(counterId, overlay);
    else void actions.setOverlaySettings(overlay);
  };

  const editable = selected?.kind === 'counter' && (desktop || selected.id === running.counters[0]?.id);

  return (
    <div className="page overlays-page">
      <PageHeader
        title="Overlays"
        description="Jedes Element hat ein eigenes Overlay. Gestalte es und kopiere die URL für OBS oder TikTok LIVE Studio."
        actions={
          <Button
            variant="primary"
            icon={IconPlus}
            disabled={!desktop || !isPro || running.overlayViews.length >= 4}
            onClick={() => setComposer({ mode: 'create' })}
          >
            Neue Overlay-Ansicht
          </Button>
        }
      />

      {desktop && !isPro && (
        <Callout
          tone="pro"
          title="Ein Overlay pro Element mit Pro"
          actions={
            <Button size="sm" onClick={() => navigate({ page: 'license' })}>
              Pro ansehen
            </Button>
          }
        >
          FlagCount Free hat ein vollständiges Overlay. Mit Pro bekommt jeder Zähler ein eigenes, dazu eine Gesamtansicht, Premium-Vorlagen und
          eigenes Branding.
        </Callout>
      )}

      {state.overlayUrl === null && (
        <Callout tone="info" title="Overlay-URLs folgen gleich">
          Die Overlay-URL ist verfügbar, sobald der Verbindungsdienst läuft.
        </Callout>
      )}

      <section className="overlay-gallery-section" aria-labelledby="single-overlays-title">
        <h2 id="single-overlays-title">Einzel-Overlays</h2>
        <ul className="overlay-gallery" aria-label="Einzel-Overlays">
        {targets.filter((target) => target.kind === 'counter').map((target) => (
          <OverlayTargetCard
            key={target.id}
            target={target}
            selected={target.id === selected?.id}
            isPro={isPro}
            onSelect={() => {
              setSelectedId(target.id);
              requestAnimationFrame(() => editorTitle.current?.focus());
            }}
            onCopy={(url) => void copy(url)}
          />
        ))}
        </ul>
      </section>

      <section className="overlay-gallery-section" aria-labelledby="combined-overlays-title">
        <div className="overlay-gallery-heading">
          <div><h2 id="combined-overlays-title">Gemeinsame Ansichten</h2><p>Mehrere Elemente über eine einzige Browser-Source anzeigen.</p></div>
          <span>{running.overlayViews.length} von 4 eigenen Ansichten</span>
        </div>
        <ul className="overlay-gallery" aria-label="Gemeinsame Overlay-Ansichten">
          {targets.filter((target) => target.kind !== 'counter').map((target) => (
            <OverlayTargetCard
              key={target.id}
              target={target}
              selected={target.id === selected?.id}
              isPro={isPro}
              onSelect={() => {
                setSelectedId(target.id);
                if (target.kind === 'view') setComposer({ mode: 'edit', viewId: target.id });
                else requestAnimationFrame(() => editorTitle.current?.focus());
              }}
              onCopy={(url) => void copy(url)}
            />
          ))}
        </ul>
      </section>

      {selected?.kind === 'view' && (
        <div className="overlay-view-actions" aria-label={`Aktionen für ${selected.label}`}>
          <Button onClick={() => setComposer({ mode: 'edit', viewId: selected.id })}>Bearbeiten</Button>
          <Button onClick={() => void actions.duplicateOverlayView(selected.id)}>Duplizieren</Button>
          <Button variant="danger-outline" onClick={() => setDeleteId(selected.id)}>Löschen</Button>
        </div>
      )}

      {selected && (
        <OverlayEditor
          key={selected.id}
          ref={editorTitle}
          target={selected}
          isPro={isPro}
          editable={editable}
          pending={pending}
          premiumThemesAllowed={canUse(entitlements, 'premium-templates')}
          onImportAsset={canUse(entitlements, 'custom-branding') ? actions.importOverlayAsset : undefined}
          onChange={(overlay) => saveDesign(selected.id, overlay)}
          onCopy={copy}
        />
      )}

      <OverlayComposer
        open={composer !== null}
        counters={running.counters}
        view={composer?.mode === 'edit' ? running.overlayViews.find((view) => view.id === composer.viewId) : null}
        pending={pending}
        onClose={() => setComposer(null)}
        onSave={(input) => {
          if (composer?.mode === 'edit') {
            void actions.updateOverlayView(composer.viewId, input).then(() => setComposer(null));
          } else {
            void actions.createOverlayView(input).then((id) => {
              if (id) setSelectedId(id);
              setComposer(null);
            });
          }
        }}
      />
      <ConfirmDialog
        open={deleteId !== null}
        title="Overlay-Ansicht löschen?"
        message="Die Browser-Source dieser Ansicht funktioniert danach nicht mehr. Zähler und Abstimmungen bleiben erhalten."
        confirmLabel="Ansicht löschen"
        busy={pending}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          void actions.deleteOverlayView(deleteId).then(() => {
            setDeleteId(null);
            setSelectedId('all');
          });
        }}
      />
    </div>
  );
}
