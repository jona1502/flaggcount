import type { CSSProperties } from 'react';
import { Badge, Button, IconButton, IconCopy, IconEye, IconPalette, cx, type Tone } from '../components/ui';
import type { OverlayTarget, OverlayTargetStatus } from './overlayTargets';

export function statusBadge(status: OverlayTargetStatus, isPro: boolean): { tone: Tone; label: string } {
  switch (status) {
    case 'ready':
      return { tone: 'success', label: 'Bereit' };
    case 'pro-required':
      return isPro ? { tone: 'warning', label: 'Nicht freigegeben' } : { tone: 'pro', label: 'Pro erforderlich' };
    case 'paused':
      return { tone: 'warning', label: 'Pausiert' };
    case 'service-unavailable':
      return { tone: 'neutral', label: 'Dienst startet' };
  }
}

export function targetTypeLabel(target: OverlayTarget): string {
  if (target.kind === 'board') return 'Alle Elemente';
  if (target.kind === 'view') return `${target.view?.items.length ?? 0} Elemente`;
  return target.mode === 'poll' ? 'Abstimmung' : 'Einfacher Zähler';
}

type OverlayTargetCardProps = {
  target: OverlayTarget;
  selected: boolean;
  isPro: boolean;
  onSelect: () => void;
  onCopy: (url: string) => void;
};

/** A small mock-up of the overlay with its status and the most common actions. */
export function OverlayTargetCard({ target, selected, isPro, onSelect, onCopy }: OverlayTargetCardProps): React.JSX.Element {
  const badge = statusBadge(target.status, isPro);
  const swatch = target.overlay
    ? ({
        '--swatch-accent': target.overlay.accentColor,
        '--swatch-text': target.overlay.textColor,
        '--swatch-panel': target.overlay.showBackground ? target.overlay.backgroundColor : 'transparent'
      } as CSSProperties)
    : undefined;

  return (
    <li className={cx('overlay-card', selected && 'is-selected')} data-status={target.status}>
      <div className="overlay-swatch" style={swatch} aria-hidden="true" data-kind={target.kind}>
        {target.kind !== 'counter' ? (
          <span className="overlay-swatch-board">
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : (
          <span className="overlay-swatch-panel">
            <span className="overlay-swatch-count">{target.mode === 'poll' ? 'A · B' : '12'}</span>
            <span className="overlay-swatch-bar" />
          </span>
        )}
      </div>
      <div className="overlay-card-body">
        <h3 className="overlay-card-title">{target.label}</h3>
        <p className="overlay-card-type">{targetTypeLabel(target)}</p>
        <div className="overlay-card-badges">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {target.publicUrl && <Badge tone="info">Online-URL</Badge>}
        </div>
      </div>
      <div className="overlay-card-actions">
        <Button
          size="sm"
          variant={selected ? 'primary' : 'secondary'}
          icon={target.kind === 'board' ? IconEye : IconPalette}
          aria-pressed={selected}
          aria-label={`${target.label} ${target.kind === 'board' ? 'ansehen' : 'bearbeiten'}`}
          onClick={onSelect}
        >
          {target.kind === 'board' ? 'Ansehen' : 'Bearbeiten'}
        </Button>
        {target.localUrl && (
          <IconButton size="sm" variant="secondary" icon={IconCopy} label={`Lokale URL von ${target.label} kopieren`} onClick={() => onCopy(target.localUrl!)} />
        )}
      </div>
    </li>
  );
}
