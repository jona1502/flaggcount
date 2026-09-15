import { useEffect, useRef, useState } from 'react';
import { canUse } from '../../shared/entitlements';
import { DEFAULT_BOARD_LAYOUT } from '../../shared/overlayBoard';
import { AUTO_SCENE_ID, MAX_OVERLAY_VIEWS, type OverlaySceneItem } from '../../shared/profiles';
import { PageHeader } from '../app-shell/PageHeader';
import { Button, Card, ConfirmDialog, IconPlus, ProHint, useToast } from '../components/ui';
import { COUNTER_TYPE_LABELS } from '../counters/counterText';
import { LiveStage, type StageState } from '../live-view/LiveStage';
import { SceneEditor } from '../live-view/SceneEditor';
import { SceneItemList } from '../live-view/SceneItemList';
import { SceneStrip, type SceneCard } from '../live-view/SceneStrip';
import { draftOf, inputOf, moveItem, newSceneDraft, sameScene, sceneBoard, toggleItem, type SceneDraft } from '../live-view/sceneModel';
import { OverlayUrlField } from '../overlays/OverlayUrlField';
import type { PageProps } from './types';

/**
 * What the stream shows: one fixed live URL for OBS, a stage with the real overlay renderer, scenes that go
 * live with one click and an editor for their entries and arrangement.
 */
export function LiveViewPage({ model, route, pending, actions, navigate, onCopyText, onUnsavedChanges }: PageProps): React.JSX.Element {
  const { state, entitlements, running, runningCounters, isPro } = model;
  const scenesAllowed = canUse(entitlements, 'parallel-counters');
  const scenes = scenesAllowed ? running.overlayViews : [];
  const liveId = scenesAllowed ? running.liveSceneId : AUTO_SCENE_ID;
  const toast = useToast();

  const initialId = route.page === 'stage' && route.sceneId ? route.sceneId : liveId;
  const [selectedId, setSelectedId] = useState(initialId);
  const [draft, setDraft] = useState<SceneDraft | null>(() => {
    const scene = scenes.find((candidate) => candidate.id === initialId);
    return scene ? draftOf(scene) : null;
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saved = scenes.find((scene) => scene.id === selectedId) ?? null;
  const savedKey = JSON.stringify(saved);
  // A saved or newly created scene replaces the draft once the backend reports it.
  useEffect(() => {
    if (saved) setDraft(draftOf(saved));
  }, [savedKey]);

  const dirty = draft !== null && (draft.id === null || saved === null || !sameScene(draft, draftOf(saved)));
  useEffect(() => onUnsavedChanges(dirty), [dirty, onUnsavedChanges]);
  useEffect(() => () => onUnsavedChanges(false), [onUnsavedChanges]);

  // Switching is confirmed once the backend reports the new live scene, never optimistically.
  const previousLive = useRef(liveId);
  useEffect(() => {
    if (previousLive.current === liveId) return;
    previousLive.current = liveId;
    const name = scenes.find((scene) => scene.id === liveId)?.name ?? 'Automatisch';
    toast({ title: `„${name}“ ist jetzt live` });
  }, [liveId]);

  const select = (sceneId: string): void => {
    setSelectedId(sceneId);
    const scene = scenes.find((candidate) => candidate.id === sceneId);
    setDraft(scene ? draftOf(scene) : null);
  };

  const startNew = (): void => {
    setSelectedId('');
    setDraft(newSceneDraft(running.counters, scenes.length + 1));
  };

  // The automatic scene lists every running element. Hiding or moving one keeps that choice as the scene
  // "Alle Elemente", which takes over the live overlay if the automatic scene was live.
  const automaticItems: OverlaySceneItem[] = (scenesAllowed ? runningCounters : runningCounters.slice(0, 1)).map((counter, index) => ({
    id: `i-${index + 1}`,
    counterId: counter.id,
    scale: 100
  }));
  const customizeAutomatic = (items: OverlaySceneItem[]): void => {
    const wasLive = liveId === AUTO_SCENE_ID;
    void actions
      .createOverlayView({
        name: 'Alle Elemente',
        items,
        layout: 'vertical',
        gap: DEFAULT_BOARD_LAYOUT.gap,
        horizontalAlign: 'center',
        verticalAlign: 'center',
        scale: DEFAULT_BOARD_LAYOUT.scale
      })
      .then((id) => {
        if (!id) return;
        setSelectedId(id);
        toast({ title: '„Alle Elemente“ als Szene gespeichert' });
        if (wasLive) void actions.setLiveScene(id);
      });
  };

  const save = (): void => {
    if (!draft) return;
    const input = inputOf(draft);
    if (draft.id) {
      void actions.updateOverlayView(draft.id, input);
      return;
    }
    void actions.createOverlayView(input).then((id) => {
      if (id) setSelectedId(id);
    });
  };

  const copy = async (url: string): Promise<boolean> => {
    try {
      await onCopyText(url);
      toast({ title: 'URL kopiert', description: 'Füge sie einmal als Browserquelle in OBS oder TikTok LIVE Studio ein.' });
      return true;
    } catch {
      toast({ tone: 'danger', title: 'Kopieren fehlgeschlagen', description: 'Bitte markiere die URL und kopiere sie manuell.' });
      return false;
    }
  };

  const cards: SceneCard[] = [
    {
      id: AUTO_SCENE_ID,
      name: 'Automatisch',
      detail: scenesAllowed ? 'Alle laufenden Elemente' : 'Dein Free-Element',
      live: liveId === AUTO_SCENE_ID
    },
    ...scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      detail: `${scene.items.length} ${scene.items.length === 1 ? 'Element' : 'Elemente'}`,
      live: liveId === scene.id
    }))
  ];

  const shownLive = draft ? draft.id !== null && draft.id === liveId : selectedId === AUTO_SCENE_ID && liveId === AUTO_SCENE_ID;
  const stageState: StageState = shownLive ? (running.liveHidden ? 'hidden' : 'live') : 'preview';
  const sceneName = draft ? draft.name.trim() || 'Neue Szene' : 'Automatisch';
  const board = sceneBoard(draft, state.counters, running.counters, scenesAllowed);
  const disabled = !state.sidecarRunning || pending;
  const canCreate = scenesAllowed && scenes.length < MAX_OVERLAY_VIEWS;

  return (
    <div className="page live-view-page">
      <PageHeader
        title="Live-Ansicht"
        description="Stell zusammen, was im Stream zu sehen ist, und schalte Szenen mit einem Klick live."
        actions={
          <Button variant="primary" icon={IconPlus} disabled={!canCreate || pending} onClick={startNew}>
            Neue Szene
          </Button>
        }
      />

      {!isPro && (
        <ProHint
          title="Szenen mit Audience Live Pro"
          action={
            <Button size="sm" variant="ghost" onClick={() => navigate({ page: 'license' })}>
              Pro ansehen
            </Button>
          }
        >
          Mehrere Elemente zusammen, dasselbe Element mehrfach und Umschalten mitten im Live.
        </ProHint>
      )}

      <Card
        title="Live-URL"
        description="Einmal in OBS oder TikTok LIVE Studio als Browserquelle mit 1280 × 720 einfügen – danach schaltest du nur noch hier um."
      >
        <div className="overlay-editor-urls">
          <OverlayUrlField
            id="live-local-url"
            label="Lokale Live-URL"
            hint="Für OBS auf diesem Computer."
            url={state.overlayUrl ? `${state.overlayUrl}/live` : null}
            unavailableText="Verfügbar, sobald der Verbindungsdienst läuft."
            onCopy={copy}
          />
          <OverlayUrlField
            id="live-online-url"
            label="Online-Live-URL"
            hint="Für TikTok LIVE Studio und andere Geräte."
            url={state.counterOverlayUrls?.['live'] ?? null}
            unavailableText={isPro ? 'Erscheint, sobald der Online-Dienst erreichbar ist.' : 'Die Online-URL gehört zu Audience Live Pro.'}
            onCopy={copy}
          />
        </div>
      </Card>

      <div className="live-view-layout">
        <div className="live-view-main">
          <LiveStage
            previewUrl={state.overlayUrl ? `${state.overlayUrl}/preview` : null}
            board={board}
            sceneName={sceneName}
            state={stageState}
            canGoLive={draft === null ? selectedId === AUTO_SCENE_ID : draft.id !== null && !dirty}
            disabled={disabled}
            onGoLive={() => void actions.setLiveScene(draft?.id ?? AUTO_SCENE_ID)}
            onToggleHidden={() => void actions.setLiveHidden(!running.liveHidden)}
          />
          <SceneStrip
            scenes={cards}
            selectedId={selectedId}
            hidden={running.liveHidden}
            disabled={disabled}
            onSelect={select}
            onGoLive={(sceneId) => void actions.setLiveScene(sceneId)}
          />
        </div>

        <div className="live-view-side">
          {draft ? (
            <SceneEditor
              key={draft.id ?? 'new'}
              draft={draft}
              counters={running.counters}
              live={draft.id !== null && draft.id === liveId}
              dirty={dirty}
              pending={pending}
              onChange={setDraft}
              onQuickItems={draft.id && !dirty ? (items) => void actions.updateOverlayView(draft.id as string, inputOf({ ...draft, items })) : undefined}
              onSave={save}
              onDiscard={() => (draft.id && saved ? setDraft(draftOf(saved)) : select(liveId))}
              onDuplicate={
                draft.id && canCreate
                  ? () =>
                      void actions.duplicateOverlayView(draft.id as string).then((id) => {
                        if (id) setSelectedId(id);
                      })
                  : undefined
              }
              onDelete={draft.id ? () => setConfirmDelete(true) : undefined}
            />
          ) : (
            <Card
              title="Automatische Szene"
              description={
                scenesAllowed
                  ? 'Zeigt alle laufenden Elemente untereinander. Blendest du eins aus oder änderst die Reihenfolge, wird daraus die Szene „Alle Elemente“.'
                  : 'Zeigt dein Free-Element.'
              }
            >
              <SceneItemList
                rows={automaticItems.map((item) => {
                  const counter = runningCounters.find((candidate) => candidate.id === item.counterId);
                  return { id: item.id, label: counter?.name ?? '', detail: counter ? COUNTER_TYPE_LABELS[counter.mode] : '', hidden: false };
                })}
                disabled={!canCreate || pending}
                onToggle={(id) => customizeAutomatic(toggleItem(automaticItems, id))}
                onMove={(id, offset) => customizeAutomatic(moveItem(automaticItems, id, offset))}
              />
              {scenesAllowed && !canCreate && <p className="ui-field-hint">Alle {MAX_OVERLAY_VIEWS} Szenen sind belegt.</p>}
              {scenesAllowed ? (
                <div className="card-row">
                  <Button icon={IconPlus} disabled={!canCreate || pending} onClick={startNew}>
                    Eigene Szene erstellen
                  </Button>
                </div>
              ) : (
                <p className="card-text">Mit Audience Live Pro stellst du eigene Szenen zusammen und schaltest sie im Live um.</p>
              )}
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`„${draft?.name ?? ''}“ löschen?`}
        message="Die Szene wird entfernt. Ist sie gerade live, zeigt das Live-Overlay danach die automatische Szene."
        confirmLabel="Szene löschen"
        busy={pending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          const sceneId = draft?.id;
          setConfirmDelete(false);
          if (sceneId) void actions.deleteOverlayView(sceneId).then(() => select(AUTO_SCENE_ID));
        }}
      />
    </div>
  );
}
