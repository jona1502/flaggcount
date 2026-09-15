import { useEffect, useRef } from 'react';
import { Badge, Button, Callout, IconEye, IconLive } from '../components/ui';
import type { SceneBoard } from './sceneModel';

export type StageState = 'live' | 'hidden' | 'preview';

type LiveStageProps = {
  /** `/overlay/preview` of the running connection service; `null` while it starts. */
  previewUrl: string | null;
  board: SceneBoard;
  sceneName: string;
  state: StageState;
  /** Unsaved scenes cannot go live yet. */
  canGoLive: boolean;
  disabled: boolean;
  onGoLive: () => void;
  onToggleHidden: () => void;
};

/**
 * The scene exactly as the stream shows it: the real overlay renderer in a 16:9 frame. Unsaved changes are
 * posted to the frame, so the preview follows every edit before anything is saved.
 */
export function LiveStage({ previewUrl, board, sceneName, state, canGoLive, disabled, onGoLive, onToggleHidden }: LiveStageProps): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(board);
  latest.current = board;
  const origin = previewUrl ? new URL(previewUrl).origin : null;
  const boardKey = JSON.stringify(board);

  const post = (): void => {
    const target = frame.current?.contentWindow;
    if (!target || !origin) return;
    try {
      target.postMessage({ type: 'audience-live-preview', ...latest.current }, origin);
    } catch {
      // The frame is still loading; it asks for the scene once it is ready.
    }
  };

  useEffect(post, [boardKey, origin]);

  useEffect(() => {
    const onReady = (event: MessageEvent): void => {
      if (event.origin === origin && (event.data as { type?: unknown } | null)?.type === 'audience-live-preview-ready') post();
    };
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, [origin]);

  return (
    <section className="live-stage" data-state={state} aria-labelledby="live-stage-title">
      <header className="live-stage-header">
        <div>
          <p className="live-stage-eyebrow">{state === 'preview' ? 'Vorschau' : 'Im Live'}</p>
          <h2 id="live-stage-title" className="live-stage-title">
            {sceneName}
          </h2>
        </div>
        <div className="live-stage-actions">
          {state === 'live' && <Badge tone="success">● Live</Badge>}
          {state === 'hidden' && <Badge tone="warning">Ausgeblendet</Badge>}
          {state === 'preview' ? (
            <Button variant="primary" icon={IconLive} disabled={disabled || !canGoLive} onClick={onGoLive}>
              Live schalten
            </Button>
          ) : (
            <Button icon={IconEye} disabled={disabled} onClick={onToggleHidden}>
              {state === 'hidden' ? 'Overlay einblenden' : 'Overlay ausblenden'}
            </Button>
          )}
        </div>
      </header>
      {previewUrl ? (
        <div className="overlay-preview live-stage-frame">
          <iframe ref={frame} title="Vorschau der Szene" src={previewUrl} onLoad={post} />
        </div>
      ) : (
        <Callout tone="info" title="Die Vorschau folgt gleich">
          Sie erscheint, sobald der Verbindungsdienst läuft.
        </Callout>
      )}
    </section>
  );
}
