import { useRef, useState } from 'react';
import { canUse } from '../../shared/entitlements';
import type { OverlaySettings } from '../../shared/settings';
import { PageHeader } from '../app-shell/PageHeader';
import { Button, Callout, IconPlus, IconStage, ProHint, useToast } from '../components/ui';
import { OverlayEditor } from '../overlays/OverlayEditor';
import { OverlayTargetCard } from '../overlays/OverlayTargetCard';
import { overlayTargets } from '../overlays/overlayTargets';
import type { PageProps } from './types';

/** An overlay for every counter and poll plus the combined view, each with its own design and URLs. */
export function OverlaysPage({ model, route, pending, actions, navigate, onCopyText, desktop }: PageProps): React.JSX.Element {
  const { state, entitlements, running, runningCounters, isPro } = model;
  const targets = overlayTargets(state, entitlements, running.counters, runningCounters, running.overlayViews);
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

  // Focus the new editor without jumping; scroll only when its title is out of sight, e.g. in a narrow window.
  const select = (targetId: string): void => {
    setSelectedId(targetId);
    requestAnimationFrame(() => {
      const title = editorTitle.current;
      if (!title) return;
      title.focus({ preventScroll: true });
      const { top } = title.getBoundingClientRect();
      if (top < 0 || top > window.innerHeight * 0.6) title.closest('.overlay-editor')?.scrollIntoView?.({ block: 'start' });
    });
  };

  return (
    <div className="page overlays-page">
      <PageHeader
        title="Overlays"
        description="Jedes Element hat ein eigenes Overlay. Gestalte es und kopiere die URL für OBS oder TikTok LIVE Studio."
        actions={
          desktop && (
            <Button icon={IconStage} onClick={() => navigate({ page: 'stage' })}>
              Live-Ansicht öffnen
            </Button>
          )
        }
      />

      {desktop && !isPro && (
        <ProHint
          title="Ein Overlay pro Element mit Pro"
          action={
            <Button size="sm" variant="ghost" onClick={() => navigate({ page: 'license' })}>
              Pro ansehen
            </Button>
          }
        >
          Jeder Zähler ein eigenes Overlay, dazu Gesamtansichten, Premium-Vorlagen und eigenes Branding.
        </ProHint>
      )}

      {state.overlayUrl === null && (
        <Callout tone="info" title="Overlay-URLs folgen gleich">
          Die Overlay-URL ist verfügbar, sobald der Verbindungsdienst läuft.
        </Callout>
      )}

      {/* The list stays next to the editor, so choosing another overlay changes what is on screen right away. */}
      <div className="overlays-workspace">
        <div className="overlays-list">
          <section className="overlay-gallery-section" aria-labelledby="single-overlays-title">
            <h2 id="single-overlays-title">Einzel-Overlays</h2>
            <ul className="overlay-gallery" aria-label="Einzel-Overlays">
              {targets.filter((target) => target.kind === 'counter').map((target) => (
                <OverlayTargetCard
                  key={target.id}
                  target={target}
                  selected={target.id === selected?.id}
                  isPro={isPro}
                  onSelect={() => select(target.id)}
                  onCopy={(url) => void copy(url)}
                />
              ))}
            </ul>
          </section>

          <section className="overlay-gallery-section" aria-labelledby="combined-overlays-title">
            <div className="overlay-gallery-heading">
              <div><h2 id="combined-overlays-title">Szenen</h2><p>Mehrere Elemente in einer Browser-Source – zusammengestellt und live geschaltet in der Live-Ansicht.</p></div>
            </div>
            {/* With a single element the combined views have nothing to put side by side. */}
            {desktop && isPro && running.counters.length < 2 && (
              <Callout
                tone="info"
                title="Für die gemeinsame Anzeige fehlt ein zweites Element"
                actions={
                  <Button size="sm" icon={IconPlus} onClick={() => navigate({ page: 'counters', create: true })}>
                    Neues Element
                  </Button>
                }
              >
                Die Gesamtansicht und eigene Szenen zeigen mehrere Zähler und Abstimmungen in einer Browser-Source. Das Profil „{running.name}“ hat
                gerade nur ein Element.
              </Callout>
            )}
            <ul className="overlay-gallery" aria-label="Gemeinsame Overlay-Ansichten">
              {targets.filter((target) => target.kind !== 'counter').map((target) => (
                <OverlayTargetCard
                  key={target.id}
                  target={target}
                  selected={target.id === selected?.id}
                  isPro={isPro}
                  onSelect={() => (target.kind === 'view' ? navigate({ page: 'stage', sceneId: target.id }) : select(target.id))}
                  onCopy={(url) => void copy(url)}
                />
              ))}
            </ul>
          </section>
        </div>

        <div className="overlays-detail">
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
      </div>
    </div>
  );
}
