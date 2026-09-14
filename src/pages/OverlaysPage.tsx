import { useRef, useState } from 'react';
import { canUse } from '../../shared/entitlements';
import type { OverlaySettings } from '../../shared/settings';
import { PageHeader } from '../app-shell/PageHeader';
import { Button, Callout, useToast } from '../components/ui';
import { OverlayEditor } from '../overlays/OverlayEditor';
import { OverlayTargetCard } from '../overlays/OverlayTargetCard';
import { overlayTargets } from '../overlays/overlayTargets';
import type { PageProps } from './types';

/** An overlay for every counter and poll plus the combined view, each with its own design and URLs. */
export function OverlaysPage({ model, route, pending, actions, navigate, onCopyText, desktop }: PageProps): React.JSX.Element {
  const { state, entitlements, running, runningCounters, isPro } = model;
  const targets = overlayTargets(state, entitlements, running.counters, runningCounters);
  const [selectedId, setSelectedId] = useState(route.page === 'overlays' && route.target ? route.target : targets[0]?.id);
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

      <ul className="overlay-gallery" aria-label="Overlays">
        {targets.map((target) => (
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
    </div>
  );
}
