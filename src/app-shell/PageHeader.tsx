import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Small status next to the title, e.g. the plan. */
  badge?: ReactNode;
  /** The primary action of the page comes last. */
  actions?: ReactNode;
};

export function PageHeader({ title, description, badge, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <header className="page-header">
      <div className="page-header-text">
        <div className="page-title-row">
          {/* Focus lands here after navigating, so screen readers announce the new page. */}
          <h1 className="page-title" tabIndex={-1}>
            {title}
          </h1>
          {badge}
        </div>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
