import type { OverlaySettings, Settings } from './settings';

export type Trigger = {
  kind: 'emoji' | 'text';
  value: string;
  match: 'contains' | 'word';
};

export type PollOption = {
  id: string;
  label: string;
  triggers: Trigger[];
  accentColor: string;
};

export type CounterDefinition = {
  id: string;
  name: string;
  mode: 'single' | 'poll';
  target: number | null;
  options: PollOption[];
  withdrawalTriggers: Trigger[];
  overlay: OverlaySettings;
};

export type StreamProfile = {
  id: string;
  name: string;
  counters: CounterDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type SettingsDocumentV2 = {
  schemaVersion: 2;
  username: string;
  telemetryEnabled: boolean;
  activeProfileId: string;
  profiles: StreamProfile[];
};

export const DEFAULT_PROFILE_ID = 'default-profile';
export const DEFAULT_COUNTER_ID = 'red-flags';
export const MAX_PROFILE_NAME_LENGTH = 60;
export const MAX_COUNTERS = 4;
export const MAX_PROFILES = 10;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const WORD_TRIGGER = /\S/;

export function createDefaultCounter(settings: Pick<Settings, 'target' | 'overlay'>): CounterDefinition {
  return {
    id: DEFAULT_COUNTER_ID,
    name: 'Rote Flaggen',
    mode: 'single',
    target: settings.target,
    options: [
      {
        id: 'red-flags',
        label: 'Rote Flaggen',
        triggers: [{ kind: 'emoji', value: '🚩', match: 'contains' }],
        accentColor: settings.overlay.accentColor
      }
    ],
    withdrawalTriggers: [{ kind: 'emoji', value: '🏳️', match: 'contains' }],
    overlay: { ...settings.overlay }
  };
}

export function migrateSettingsV1(settings: Settings, now = new Date().toISOString()): SettingsDocumentV2 {
  const profile: StreamProfile = {
    id: DEFAULT_PROFILE_ID,
    name: 'Standard',
    counters: [createDefaultCounter(settings)],
    createdAt: now,
    updatedAt: now
  };
  return {
    schemaVersion: 2,
    username: settings.username,
    telemetryEnabled: settings.telemetryEnabled,
    activeProfileId: profile.id,
    profiles: [profile]
  };
}

function isTrigger(value: unknown): value is Trigger {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const trigger = value as Record<string, unknown>;
  return (
    (trigger.kind === 'emoji' || trigger.kind === 'text') &&
    typeof trigger.value === 'string' &&
    WORD_TRIGGER.test(trigger.value.trim()) &&
    trigger.value.trim() === trigger.value &&
    (trigger.match === 'contains' || trigger.match === 'word')
  );
}

function hasDuplicateTriggers(triggers: Trigger[]): boolean {
  const keys = triggers.map((trigger) => `${trigger.kind}:${trigger.match}:${trigger.value.normalize('NFC').toLocaleLowerCase()}`);
  return new Set(keys).size !== keys.length;
}

function isOption(value: unknown): value is PollOption {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const option = value as Record<string, unknown>;
  const triggers = option.triggers;
  return (
    typeof option.id === 'string' && option.id.length > 0 &&
    typeof option.label === 'string' && option.label.trim().length > 0 &&
    typeof option.accentColor === 'string' && HEX_COLOR.test(option.accentColor) &&
    Array.isArray(triggers) && triggers.length > 0 && triggers.every(isTrigger) && !hasDuplicateTriggers(triggers)
  );
}

function isCounter(value: unknown): value is CounterDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const counter = value as Record<string, unknown>;
  const options = counter.options;
  const withdrawals = counter.withdrawalTriggers;
  if (
    typeof counter.id !== 'string' || !counter.id ||
    typeof counter.name !== 'string' || counter.name.trim().length === 0 ||
    !['single', 'poll'].includes(String(counter.mode)) ||
    (counter.target !== null && (typeof counter.target !== 'number' || !Number.isInteger(counter.target) || counter.target < 1)) ||
    !Array.isArray(options) || !Array.isArray(withdrawals) || !withdrawals.every(isTrigger) || hasDuplicateTriggers(withdrawals) ||
    !options.every(isOption)
  ) return false;
  const optionTriggerKeys = options.flatMap((option) => option.triggers.map((trigger) => `${trigger.kind}:${trigger.match}:${trigger.value.normalize('NFC').toLocaleLowerCase()}`));
  if (new Set(optionTriggerKeys).size !== optionTriggerKeys.length) return false;
  if (counter.mode === 'single' && options.length !== 1) return false;
  return counter.mode === 'poll' ? options.length >= 2 && options.length <= 6 : true;
}

function isProfile(value: unknown): value is StreamProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.id === 'string' && profile.id.length > 0 &&
    typeof profile.name === 'string' && profile.name.trim() === profile.name &&
    profile.name.length >= 1 && profile.name.length <= MAX_PROFILE_NAME_LENGTH &&
    Array.isArray(profile.counters) && profile.counters.length >= 1 && profile.counters.length <= MAX_COUNTERS &&
    profile.counters.every(isCounter) && typeof profile.createdAt === 'string' && typeof profile.updatedAt === 'string'
  );
}

export function parseSettingsDocument(value: unknown, fallback: Settings): SettingsDocumentV2 {
  if (typeof value === 'object' && value !== null && (value as Record<string, unknown>).schemaVersion === 2) {
    const document = value as Record<string, unknown>;
    const profiles = document.profiles;
    const keys = Object.keys(document);
    if (
      typeof document.username === 'string' &&
      typeof document.telemetryEnabled === 'boolean' &&
      typeof document.activeProfileId === 'string' &&
      keys.every((key) => ['schemaVersion', 'username', 'telemetryEnabled', 'activeProfileId', 'profiles'].includes(key)) &&
      Array.isArray(profiles) && profiles.length >= 1 && profiles.length <= MAX_PROFILES &&
      profiles.every(isProfile) && profiles.some((profile) => profile.id === document.activeProfileId)
    ) {
      return value as SettingsDocumentV2;
    }
  }
  return migrateSettingsV1(fallback);
}
