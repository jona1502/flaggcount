import { vi } from 'vitest';
import type { AppState } from '../../shared/appState';
import { FEATURES, type Feature } from '../../shared/entitlements';
import { FREE_LICENSE_STATE, type LicenseState } from '../../shared/licensing';
import { migrateSettingsV1, type CounterDefinition, type Settings, type StreamProfile } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../shared/settings';
import type { CounterSnapshot } from '../../shared/voting';
import type { FlagCountActions } from '../api/useFlagCount';

export const OVERLAY_URL = 'http://127.0.0.1:3847/overlay';
export const PUBLIC_OVERLAY_URL = 'https://overlay.example.test/o/abcdefghijklmnopqrstuv';
export const NOW = '2026-01-01T00:00:00.000Z';

const proLicense: LicenseState = {
  ...FREE_LICENSE_STATE,
  plan: 'pro',
  status: 'active',
  // A made-up support reference; fixtures never contain activation codes.
  reference: 'FC-TESTLICENSE',
  expiresAt: '2026-02-01T00:00:00.000Z',
  refreshAfter: '2026-01-08T00:00:00.000Z',
  features: [...FEATURES]
};

const without = (...missing: Feature[]): Feature[] => FEATURES.filter((feature) => !missing.includes(feature));

/**
 * The license situations the desktop UI has to explain:
 * - `free`: no license, everything Free works without an account.
 * - `pro`: an active license with every Pro feature.
 * - `grace`: Pro still works, the last payment failed.
 * - `offline`: Pro works from the stored entitlement, the license server was not reachable.
 * - `expired`: Pro ended on this computer; stored Pro profiles and counters stay but do not run.
 * - `proWithoutPolls`: the server reports Pro, but the entitlement lacks `multi-option-polls`.
 */
export const LICENSES = {
  free: FREE_LICENSE_STATE,
  pro: proLicense,
  grace: { ...proLicense, status: 'grace' },
  offline: { ...proLicense, needsRefresh: true, lastError: 'network' },
  expired: { ...FREE_LICENSE_STATE, status: 'expired', reference: 'FC-TESTLICENSE', expiresAt: '2025-12-01T00:00:00.000Z', needsRefresh: true },
  proWithoutPolls: { ...proLicense, features: without('multi-option-polls') }
} satisfies Record<string, LicenseState>;

export function createSettings(counters?: CounterDefinition[], extraProfiles: StreamProfile[] = []): Settings {
  const settings = migrateSettingsV1({ username: '', target: 10, overlay: { ...DEFAULT_OVERLAY_SETTINGS } }, NOW);
  const [profile] = settings.profiles as [StreamProfile];
  return {
    ...settings,
    profiles: [counters ? { ...profile, counters } : profile, ...extraProfiles]
  };
}

export function createProfile(id: string, name: string, counters: CounterDefinition[]): StreamProfile {
  return { id, name, counters, createdAt: NOW, updatedAt: NOW };
}

/** A two-option poll as a Pro user would create it. */
export function teamPoll(id = 'teams', name = 'Team-Wahl'): CounterDefinition {
  return {
    id,
    name,
    mode: 'poll',
    target: null,
    options: [
      { id: 'red', label: 'Rot', triggers: [{ kind: 'text', value: 'rot', match: 'word' }], accentColor: '#e82634' },
      { id: 'blue', label: 'Blau', triggers: [{ kind: 'text', value: 'blau', match: 'word' }], accentColor: '#2f80ed' }
    ],
    withdrawalTriggers: [],
    overlay: { ...DEFAULT_OVERLAY_SETTINGS }
  };
}

export function snapshotOf(counter: CounterDefinition, counts: number[] = []): CounterSnapshot {
  const options = counter.options.map((option, index) => ({ optionId: option.id, label: option.label, count: counts[index] ?? 0 }));
  const totalCount = options.reduce((sum, option) => sum + option.count, 0);
  return {
    counterId: counter.id,
    name: counter.name,
    mode: counter.mode,
    options,
    totalCount,
    target: counter.target,
    targetReached: counter.target !== null && totalCount >= counter.target,
    roundId: `round-${counter.id}`
  };
}

/** A consistent state: snapshots follow the counters of the active profile unless given explicitly. */
export function createAppState(overrides: Partial<AppState> = {}): AppState {
  const settings = overrides.settings ?? createSettings();
  const active = settings.profiles.find((profile) => profile.id === settings.activeProfileId) ?? settings.profiles[0];
  const counters = overrides.counters ?? (active?.counters ?? []).map((counter) => snapshotOf(counter));
  const first = counters[0];
  return {
    sidecarRunning: true,
    connection: { status: 'disconnected', username: null },
    votes: {
      count: first?.totalCount ?? 0,
      target: first?.target ?? 10,
      roundId: first?.roundId ?? 'round-1',
      targetReached: first?.targetReached ?? false
    },
    overlayUrl: OVERLAY_URL,
    publicOverlayUrl: null,
    license: LICENSES.free,
    ...overrides,
    settings,
    counters
  };
}

export function createActions() {
  return {
    connect: vi.fn(async (_username: string) => undefined),
    disconnect: vi.fn(async () => undefined),
    addManualVote: vi.fn(async (_counterId?: string, _optionId?: string) => undefined),
    removeManualVote: vi.fn(async (_counterId?: string, _optionId?: string) => undefined),
    resetVotes: vi.fn(async (_counterId?: string) => undefined),
    setTarget: vi.fn(async (_target: number) => undefined),
    setOverlaySettings: vi.fn(async (_overlay: OverlaySettings) => undefined),
    setCounterOverlaySettings: vi.fn(async (_counterId: string, _overlay: OverlaySettings) => undefined),
    importOverlayAsset: vi.fn(async () => '0123456789abcdef0123456789abcdef.png'),
    clearHistory: vi.fn(async () => undefined),
    exportHistoryCsv: vi.fn(async () => 'history.csv'),
    activateLicense: vi.fn(async (_code: string, _replace?: string) => undefined),
    refreshLicense: vi.fn(async () => undefined),
    deactivateLicense: vi.fn(async () => undefined),
    openCustomerPortal: vi.fn(async () => undefined),
    openProPage: vi.fn(async () => undefined),
    createProfile: vi.fn(async (_name: string) => undefined),
    duplicateProfile: vi.fn(async (_profileId: string) => undefined),
    renameProfile: vi.fn(async (_profileId: string, _name: string) => undefined),
    deleteProfile: vi.fn(async (_profileId: string) => undefined),
    switchProfile: vi.fn(async (_profileId: string) => undefined),
    saveCounters: vi.fn(async (_counters: CounterDefinition[]) => undefined)
  } satisfies FlagCountActions;
}
