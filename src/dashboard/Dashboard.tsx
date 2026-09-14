import { useMemo, useState } from 'react';
import type { AppError, AppState } from '../../shared/appState';
import type { FlagCountActions } from '../api/useFlagCount';
import { AppShell } from '../app-shell/AppShell';
import { createAppModel } from '../app-shell/appModel';
import { DESKTOP_PAGES, WEB_PAGES, type PageId, type Route } from '../app-shell/navigation';
import { Skeleton, ToastProvider } from '../components/ui';
import { CountersPage } from '../pages/CountersPage';
import { HistoryPage } from '../pages/HistoryPage';
import { LicensePage } from '../pages/LicensePage';
import { LivePage } from '../pages/LivePage';
import { OverlaysPage } from '../pages/OverlaysPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ProfilesPage } from '../pages/ProfilesPage';
import { SettingsPage } from '../pages/SettingsPage';
import type { PageProps } from '../pages/types';
import type { UpdaterController } from '../updater/useUpdater';

type DashboardProps = {
  state: AppState | null;
  error: AppError | null;
  pending: boolean;
  actions: FlagCountActions;
  onDismissError: () => void;
  onCopyText: (text: string) => Promise<void>;
  version?: string | null;
  updater?: UpdaterController;
  /** Only the web version has a login to sign out of. */
  onLogout?: () => void;
  /** Profiles, counters and FlagCount Pro are managed in the desktop app only. */
  proAvailable?: boolean;
};

const routeTo = (page: PageId): Route => ({ page }) as Route;

function LoadingPage(): React.JSX.Element {
  return (
    <div className="page" aria-busy="true">
      <p className="page-loading">Status wird geladen …</p>
      <Skeleton height="2.25rem" width="min(24rem, 60%)" />
      <div className="page-grid">
        <Skeleton height="10rem" radius="14px" />
        <Skeleton height="10rem" radius="14px" />
      </div>
    </div>
  );
}

/** The desktop app and the browser dashboard: app shell, navigation and the current page. */
export function Dashboard({
  state,
  error,
  pending,
  actions,
  onDismissError,
  onCopyText,
  version,
  updater,
  onLogout,
  proAvailable = false
}: DashboardProps): React.JSX.Element {
  const desktop = proAvailable;
  const pages = desktop ? DESKTOP_PAGES : WEB_PAGES;
  const [route, setRoute] = useState<Route>(() => routeTo(pages[0] as PageId));
  const current = pages.includes(route.page) ? route : routeTo(pages[0] as PageId);
  const model = useMemo(() => (state ? createAppModel(state) : null), [state]);

  const renderPage = (props: PageProps): React.JSX.Element => {
    switch (props.route.page) {
      case 'overview':
        return <OverviewPage {...props} />;
      case 'live':
        return <LivePage {...props} />;
      case 'counters':
        return <CountersPage {...props} />;
      case 'overlays':
        return <OverlaysPage {...props} />;
      case 'profiles':
        return <ProfilesPage {...props} />;
      case 'history':
        return <HistoryPage {...props} />;
      case 'license':
        return <LicensePage {...props} />;
      case 'settings':
        return <SettingsPage desktop={desktop} updater={updater} version={version} onLogout={onLogout} />;
    }
  };

  return (
    <ToastProvider>
      <AppShell
        pages={pages}
        current={current.page}
        onNavigate={setRoute}
        model={model}
        error={error}
        onDismissError={onDismissError}
        updater={updater}
        version={version}
        onLogout={onLogout}
        desktop={desktop}
      >
        {model ? (
          renderPage({ model, route: current, pending, actions, navigate: setRoute, onCopyText, desktop })
        ) : (
          <LoadingPage />
        )}
      </AppShell>
    </ToastProvider>
  );
}
