import { useRef, useState, type KeyboardEvent } from 'react';
import type { AppError, AppState } from '../../shared/appState';
import { effectiveProfile, entitlementsFor } from '../../shared/entitlements';
import { primaryCounter } from '../../shared/profiles';
import type { FlagCountActions } from '../api/useFlagCount';
import { LicensePanel } from '../pro/LicensePanel';
import { ProfilesPanel } from '../profiles/ProfilesPanel';
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
  /** Profiles and FlagCount Pro are managed in the desktop app only. */
  proAvailable?: boolean;
};

type Section = 'live' | 'profiles' | 'pro';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'profiles', label: 'Profile' },
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
  const tabs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({});
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

  const renderSection = (appState: AppState): React.JSX.Element => {
    if (current === 'pro') {
      return (
        <div role="tabpanel" id="section-pro" aria-labelledby="tab-pro">
          <LicensePanel
            license={appState.license}
            available={appState.sidecarRunning}
            pending={pending}
            onActivate={(code, replaceInstallationId) => void actions.activateLicense(code, replaceInstallationId)}
            onRefresh={() => void actions.refreshLicense()}
            onDeactivate={() => void actions.deactivateLicense()}
            onOpenPortal={() => void actions.openCustomerPortal()}
            onOpenProPage={() => void actions.openProPage()}
          />
        </div>
      );
    }
    if (current === 'profiles') {
      return (
        <div role="tabpanel" id="section-profiles" aria-labelledby="tab-profiles">
          <ProfilesPanel
            settings={appState.settings}
            license={appState.license}
            disabled={pending}
            onCreate={(name) => void actions.createProfile(name)}
            onDuplicate={(profileId) => void actions.duplicateProfile(profileId)}
            onRename={(profileId, name) => void actions.renameProfile(profileId, name)}
            onDelete={(profileId) => void actions.deleteProfile(profileId)}
            onSwitch={(profileId) => void actions.switchProfile(profileId)}
            onShowPro={() => setSection('pro')}
          />
        </div>
      );
    }

    // The profile that actually runs: after a downgrade that is the first one, not the chosen one.
    const running = effectiveProfile(appState.settings, entitlementsFor(appState.license.plan, appState.license.features));
    const counter = running.counters[0] ?? primaryCounter(appState.settings);
    return (
      <div
        className="dashboard-grid"
        {...(sections.length > 1 ? { role: 'tabpanel', id: 'section-live', 'aria-labelledby': 'tab-live' } : {})}
      >
        <ConnectionPanel
          connection={appState.connection}
          savedUsername={appState.settings.username}
          sidecarRunning={appState.sidecarRunning}
          pending={pending}
          onConnect={(username) => void actions.connect(username)}
          onDisconnect={() => void actions.disconnect()}
        />
        <VotesPanel
          votes={appState.votes}
          disabled={!appState.sidecarRunning || pending}
          onAddManualVote={() => void actions.addManualVote()}
          onRemoveManualVote={() => void actions.removeManualVote()}
          onSetTarget={(target) => void actions.setTarget(target)}
          onReset={() => void actions.resetVotes()}
        />
        <OverlayPanel
          overlayUrl={appState.overlayUrl}
          publicOverlayUrl={appState.publicOverlayUrl}
          settings={counter.overlay}
          disabled={pending}
          onCopy={onCopyText}
          onChangeSettings={(overlay) => void actions.setOverlaySettings(overlay)}
        />
      </div>
    );
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
              {item.id === 'pro' && state.license.plan === 'pro' && <span className="plan-badge">aktiv</span>}
            </button>
          ))}
        </nav>
      )}

      {state === null ? <p className="loading">Status wird geladen …</p> : renderSection(state)}
    </main>
  );
}
