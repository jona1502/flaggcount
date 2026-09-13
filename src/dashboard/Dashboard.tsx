import { useRef, useState, type KeyboardEvent } from 'react';
import type { AppError, AppState } from '../../shared/appState';
import { primaryCounter } from '../../shared/profiles';
import type { FlagCountActions } from '../api/useFlagCount';
import { LicensePanel } from '../pro/LicensePanel';
import { ConnectionPanel } from './ConnectionPanel';
import { ErrorBanner } from './ErrorBanner';
import { OverlayPanel } from './OverlayPanel';
import { VotesPanel } from './VotesPanel';
import { UpdateNotice } from '../updater/UpdateNotice';
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
  /** FlagCount Pro is managed in the desktop app only. */
  proAvailable?: boolean;
};

type Section = 'live' | 'pro';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'pro', label: 'Pro' }
];

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
  const [section, setSection] = useState<Section>('live');
  const tabs = useRef<Record<Section, HTMLButtonElement | null>>({ live: null, pro: null });
  const sections = proAvailable ? SECTIONS : SECTIONS.filter((item) => item.id === 'live');
  const current = sections.some((item) => item.id === section) ? section : 'live';

  // Arrow keys move between tabs, as in any tab list.
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = sections.findIndex((item) => item.id === current);
    const next = sections[(index + (event.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length];
    if (!next) return;
    setSection(next.id);
    tabs.current[next.id]?.focus();
  };

  return (
    <main className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-mark" aria-hidden="true">
            🚩
          </span>
          <h1>FlagCount</h1>
        </div>
        {(version || updater || onLogout) && (
          <div className="header-tools">
            <div className="version-actions">
              {version && <span className="version">Version {version}</span>}
              {updater && (
                <button
                  type="button"
                  className="text-button"
                  disabled={updater.status === 'checking' || updater.status === 'downloading'}
                  onClick={() => void updater.checkForUpdates()}
                >
                  Nach Updates suchen
                </button>
              )}
              {onLogout && (
                <button type="button" className="text-button" onClick={onLogout}>
                  Abmelden
                </button>
              )}
            </div>
            {updater && <UpdateNotice updater={updater} />}
          </div>
        )}
      </header>

      <ErrorBanner error={error} onDismiss={onDismissError} />

      {state !== null && sections.length > 1 && (
        <nav className="app-tabs" role="tablist" aria-label="Bereiche">
          {sections.map((item) => (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[item.id] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              className="app-tab"
              aria-selected={current === item.id}
              aria-controls={`section-${item.id}`}
              tabIndex={current === item.id ? 0 : -1}
              onClick={() => setSection(item.id)}
              onKeyDown={moveFocus}
            >
              {item.label}
              {item.id === 'pro' && state.license.plan === 'pro' && (
                <span className="plan-badge" aria-label="aktiv">
                  aktiv
                </span>
              )}
            </button>
          ))}
        </nav>
      )}

      {state === null ? (
        <p className="loading">Status wird geladen …</p>
      ) : current === 'pro' ? (
        <div role="tabpanel" id="section-pro" aria-labelledby="tab-pro">
          <LicensePanel
            license={state.license}
            available={state.sidecarRunning}
            pending={pending}
            onActivate={(code, replaceInstallationId) => void actions.activateLicense(code, replaceInstallationId)}
            onRefresh={() => void actions.refreshLicense()}
            onDeactivate={() => void actions.deactivateLicense()}
            onOpenPortal={() => void actions.openCustomerPortal()}
            onOpenProPage={() => void actions.openProPage()}
          />
        </div>
      ) : (
        <div
          className="dashboard-grid"
          {...(sections.length > 1 ? { role: 'tabpanel', id: 'section-live', 'aria-labelledby': 'tab-live' } : {})}
        >
          <ConnectionPanel
            connection={state.connection}
            savedUsername={state.settings.username}
            sidecarRunning={state.sidecarRunning}
            pending={pending}
            onConnect={(username) => void actions.connect(username)}
            onDisconnect={() => void actions.disconnect()}
          />
          <VotesPanel
            votes={state.votes}
            disabled={!state.sidecarRunning || pending}
            onAddManualVote={() => void actions.addManualVote()}
            onRemoveManualVote={() => void actions.removeManualVote()}
            onSetTarget={(target) => void actions.setTarget(target)}
            onReset={() => void actions.resetVotes()}
          />
          <OverlayPanel
            overlayUrl={state.overlayUrl}
            publicOverlayUrl={state.publicOverlayUrl}
            settings={primaryCounter(state.settings).overlay}
            disabled={pending}
            onCopy={onCopyText}
            onChangeSettings={(overlay) => void actions.setOverlaySettings(overlay)}
          />
        </div>
      )}
    </main>
  );
}
