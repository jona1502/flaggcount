import type { ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'pro';

type BadgeProps = {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  /** Extra text for screen readers, e.g. "Pro erforderlich" for a short "Pro" badge. */
  srLabel?: string;
};

export function Badge({ tone = 'neutral', children, className, srLabel }: BadgeProps): React.JSX.Element {
  return (
    <span className={cx('ui-badge', `ui-badge--${tone}`, className)}>
      {srLabel ? <span aria-hidden="true">{children}</span> : children}
      {srLabel && <span className="visually-hidden">{srLabel}</span>}
    </span>
  );
}

type StatusDotProps = {
  tone: Tone;
  /** Animated for states in progress; motion is removed for `prefers-reduced-motion`. */
  pulse?: boolean;
  label?: string;
};

/** A colored dot; the state is always also spelled out by `label` or the surrounding text. */
export function StatusDot({ tone, pulse = false, label }: StatusDotProps): React.JSX.Element {
  return (
    <span className="ui-status">
      <span className={cx('ui-status-dot', `ui-status-dot--${tone}`, pulse && 'ui-status-dot--pulse')} aria-hidden="true" />
      {label && <span className="ui-status-label">{label}</span>}
    </span>
  );
}
