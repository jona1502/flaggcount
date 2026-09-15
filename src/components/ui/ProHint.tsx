import { useId, type ReactNode } from 'react';
import { Badge } from './Badge';

type ProHintProps = {
  title: string;
  children?: ReactNode;
  /** Usually a small link to the Pro page. */
  action?: ReactNode;
};

/**
 * One calm line about a Pro feature. Locked features stay explained without a large banner on every
 * setup page. Its title is its accessible name.
 */
export function ProHint({ title, children, action }: ProHintProps): React.JSX.Element {
  const titleId = useId();
  return (
    <div className="ui-pro-hint" role="note" aria-labelledby={titleId}>
      <Badge tone="pro">Pro</Badge>
      <p className="ui-pro-hint-text">
        <strong id={titleId}>{title}</strong>
        {children && <span> – {children}</span>}
      </p>
      {action}
    </div>
  );
}
