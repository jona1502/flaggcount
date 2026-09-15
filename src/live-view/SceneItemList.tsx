import { MAX_SCENE_ITEM_SCALE, MIN_SCENE_ITEM_SCALE } from '../../shared/profiles';
import { Badge, Button, IconButton, IconChevronDown, IconChevronUp, IconEye, IconTrash, cx } from '../components/ui';

export type SceneItemRow = {
  id: string;
  label: string;
  detail: string;
  hidden: boolean;
  /** Shown as a size slider when the list can change sizes. */
  scale?: number;
};

type SceneItemListProps = {
  rows: SceneItemRow[];
  disabled: boolean;
  onToggle: (id: string) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  onRemove?: (id: string) => void;
  onScale?: (id: string, scale: number) => void;
};

/** The elements of a scene in their order: show or hide each one and move it up or down. */
export function SceneItemList({ rows, disabled, onToggle, onMove, onRemove, onScale }: SceneItemListProps): React.JSX.Element {
  return (
    <ol className="scene-items">
      {rows.map((row, index) => (
        <li key={row.id} className={cx('scene-item', row.hidden && 'is-hidden')}>
          <span className="scene-item-text">
            <span className="scene-item-name">{row.label}</span>
            <span className="scene-item-detail">{row.detail}</span>
          </span>
          <div className="scene-item-tools">
            {row.hidden && <Badge tone="warning">Ausgeblendet</Badge>}
            <Button
              size="sm"
              variant="ghost"
              icon={IconEye}
              disabled={disabled}
              aria-label={`${row.label} ${row.hidden ? 'einblenden' : 'ausblenden'}`}
              onClick={() => onToggle(row.id)}
            >
              {row.hidden ? 'Einblenden' : 'Ausblenden'}
            </Button>
            <IconButton size="sm" icon={IconChevronUp} label={`${row.label} nach oben`} disabled={disabled || index === 0} onClick={() => onMove(row.id, -1)} />
            <IconButton
              size="sm"
              icon={IconChevronDown}
              label={`${row.label} nach unten`}
              disabled={disabled || index === rows.length - 1}
              onClick={() => onMove(row.id, 1)}
            />
            {onRemove && (
              <IconButton
                size="sm"
                variant="danger-outline"
                icon={IconTrash}
                label={`${row.label} entfernen`}
                disabled={disabled || rows.length === 1}
                onClick={() => onRemove(row.id)}
              />
            )}
          </div>
          {onScale && row.scale !== undefined && (
            <label className="scene-item-size">
              <span className="visually-hidden">Größe von {row.label}</span>
              <input
                type="range"
                min={MIN_SCENE_ITEM_SCALE}
                max={MAX_SCENE_ITEM_SCALE}
                step={10}
                value={row.scale}
                disabled={disabled}
                onChange={(event) => onScale(row.id, Number(event.target.value))}
              />
              <span className="scene-range-value" aria-hidden="true">
                {row.scale} %
              </span>
            </label>
          )}
        </li>
      ))}
    </ol>
  );
}
