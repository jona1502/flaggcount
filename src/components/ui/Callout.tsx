import { useId, type ReactNode } from 'react';
import type { Tone } from './Badge';
import { cx } from './cx';
import { IconAlert, IconCheck, IconInfo, IconStar, type IconComponent } from './icons';

type CalloutTone = Extract<Tone, 'info' | 'success' | 'warning' | 'danger' | 'pro'>;

const ICONS: Record<CalloutTone, IconComponent> = {
  info: IconInfo,
  success: IconCheck,
  warning: IconAlert,
  danger: IconAlert,
  pro: IconStar
};

type CalloutProps = {
  tone?: CalloutTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** `alert` only for problems that need attention right now; everything else is a `note`. */
  role?: 'note' | 'alert' | 'status';
};

/** A highlighted explanation with an optional next step. Its title is its accessible name. */
export function Callout({ tone = 'info', title, children, actions, className, role = 'note' }: CalloutProps): React.JSX.Element {
  const titleId = useId();
  const Icon = ICONS[tone];
  return (
    <div className={cx('ui-callout', `ui-callout--${tone}`, className)} role={role} aria-labelledby={titleId}>
      <Icon className="ui-callout-icon" size={18} />
      <div className="ui-callout-body">
        <p id={titleId} className="ui-callout-title">
          {title}
        </p>
        {children && <div className="ui-callout-content">{children}</div>}
        {actions && <div className="ui-callout-actions">{actions}</div>}
      </div>
    </div>
  );
}
