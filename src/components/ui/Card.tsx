import { useId, type ReactNode } from 'react';
import { cx } from './cx';

type CardProps = {
  title?: ReactNode;
  description?: ReactNode;
  /** Buttons or badges shown next to the title. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
  /** `section` for landmarks with a title, `div` for purely visual grouping. */
  as?: 'section' | 'div' | 'article' | 'li';
  tone?: 'default' | 'raised' | 'accent' | 'muted';
};

export function Card({
  title,
  description,
  actions,
  children,
  className,
  headingLevel = 2,
  as: Element = 'section',
  tone = 'default'
}: CardProps): React.JSX.Element {
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Element className={cx('ui-card', tone !== 'default' && `ui-card--${tone}`, className)} aria-labelledby={title ? headingId : undefined}>
      {(title || actions) && (
        <header className="ui-card-header">
          <div className="ui-card-heading">
            {title && (
              <Heading id={headingId} className="ui-card-title">
                {title}
              </Heading>
            )}
            {description && <p className="ui-card-description">{description}</p>}
          </div>
          {actions && <div className="ui-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </Element>
  );
}
