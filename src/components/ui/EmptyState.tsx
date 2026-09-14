import type { ReactNode } from 'react';
import type { IconComponent } from './icons';

type EmptyStateProps = {
  icon?: IconComponent;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
};

export function EmptyState({ icon: Icon, title, description, action, headingLevel = 3 }: EmptyStateProps): React.JSX.Element {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="ui-empty">
      {Icon && (
        <span className="ui-empty-icon">
          <Icon size={26} />
        </span>
      )}
      <Heading className="ui-empty-title">{title}</Heading>
      {description && <p className="ui-empty-description">{description}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
