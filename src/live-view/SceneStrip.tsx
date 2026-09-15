import { Badge, Button, IconLive, cx } from '../components/ui';

export type SceneCard = {
  id: string;
  name: string;
  detail: string;
  live: boolean;
};

type SceneStripProps = {
  scenes: SceneCard[];
  selectedId: string;
  hidden: boolean;
  disabled: boolean;
  onSelect: (sceneId: string) => void;
  onGoLive: (sceneId: string) => void;
};

/** Every scene with a one-click switch. Choosing a scene to edit and putting it live stay separate actions. */
export function SceneStrip({ scenes, selectedId, hidden, disabled, onSelect, onGoLive }: SceneStripProps): React.JSX.Element {
  return (
    <ul className="scene-strip" aria-label="Szenen">
      {scenes.map((scene) => {
        const selected = scene.id === selectedId;
        return (
          <li key={scene.id} className={cx('scene-card', selected && 'is-selected')} data-live={scene.live}>
            <button type="button" className="scene-card-select" aria-pressed={selected} onClick={() => onSelect(scene.id)}>
              <span className="scene-card-name">{scene.name}</span>{' '}
              <span className="scene-card-detail">{scene.detail}</span>
            </button>
            <div className="scene-card-actions">
              {scene.live ? (
                <Badge tone={hidden ? 'warning' : 'success'}>{hidden ? 'Ausgeblendet' : '● Live'}</Badge>
              ) : (
                <Button size="sm" icon={IconLive} disabled={disabled} aria-label={`${scene.name} live schalten`} onClick={() => onGoLive(scene.id)}>
                  Live
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
