import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppError } from '../../shared/appState';
import { ErrorBanner } from '../dashboard/ErrorBanner';
import { UpdateNotice } from '../updater/UpdateNotice';
import type { UpdaterController } from '../updater/useUpdater';
import type { AppModel } from './appModel';
import type { Navigate, PageId } from './navigation';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';

type AppShellProps = {
  pages: readonly PageId[];
  current: PageId;
  onNavigate: Navigate;
  model: AppModel | null;
  error: AppError | null;
  onDismissError: () => void;
  updater?: UpdaterController;
  version?: string | null;
  onLogout?: () => void;
  desktop: boolean;
  children: ReactNode;
};

/** Sidebar, global notices, the current page and the status bar. */
export function AppShell({
  pages,
  current,
  onNavigate,
  model,
  error,
  onDismissError,
  updater,
  version,
  onLogout,
  desktop,
  children
}: AppShellProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const main = useRef<HTMLElement>(null);
  const previousPage = useRef(current);

  // After navigating, focus the new page title so keyboard and screen reader users start there.
  useEffect(() => {
    if (previousPage.current === current) return;
    previousPage.current = current;
    main.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [current]);

  const updateAvailable = updater && (updater.status === 'available' || updater.status === 'downloading');
  const badges: Partial<Record<PageId, string>> = model && desktop ? { license: model.isPro ? 'Pro' : 'Free' } : {};

  return (
    <div className="fc-app app-shell">
      <a className="shell-skip-link" href="#fc-main">
        Zum Inhalt springen
      </a>
      <Sidebar
        pages={pages}
        current={current}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        badges={badges}
        onLogout={onLogout}
      />
      <div className="shell-main">
        <main id="fc-main" ref={main} className="shell-content" tabIndex={-1}>
          {/* Critical notices stay visible on every page. */}
          {updateAvailable && <UpdateNotice updater={updater} />}
          <ErrorBanner error={error} onDismiss={onDismissError} />
          {children}
        </main>
        <StatusBar model={model} version={version} onNavigate={onNavigate} desktop={desktop} />
      </div>
    </div>
  );
}
