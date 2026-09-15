import { canUse } from '../../shared/entitlements';
import { AUTO_SCENE_ID } from '../../shared/profiles';
import type { AppModel } from '../app-shell/appModel';
import { Button, Card, Field, IconEye, IconStage, Select } from '../components/ui';

type LiveSceneCardProps = {
  model: AppModel;
  disabled: boolean;
  onSwitch: (sceneId: string) => void;
  onToggleHidden: () => void;
  onOpen: () => void;
};

/** Switches or hides the live overlay during a stream without leaving the overview. */
export function LiveSceneCard({ model, disabled, onSwitch, onToggleHidden, onOpen }: LiveSceneCardProps): React.JSX.Element {
  const { running, entitlements } = model;
  const scenes = canUse(entitlements, 'parallel-counters') ? running.overlayViews : [];
  const liveId = scenes.some((scene) => scene.id === running.liveSceneId) ? running.liveSceneId : AUTO_SCENE_ID;

  return (
    <Card
      title="Im Live"
      description={running.liveHidden ? 'Das Live-Overlay ist gerade ausgeblendet.' : 'Diese Szene zeigt die Live-URL gerade im Stream.'}
      actions={
        <Button size="sm" variant="ghost" icon={IconStage} onClick={onOpen}>
          Szenen bearbeiten
        </Button>
      }
    >
      <div className="live-scene-row">
        {scenes.length > 0 && (
          <Field id="overview-live-scene" label="Szene">
            <Select value={liveId} disabled={disabled} onChange={(event) => onSwitch(event.target.value)}>
              <option value={AUTO_SCENE_ID}>Automatisch</option>
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button icon={IconEye} disabled={disabled} onClick={onToggleHidden}>
          {running.liveHidden ? 'Overlay einblenden' : 'Overlay ausblenden'}
        </Button>
      </div>
    </Card>
  );
}
