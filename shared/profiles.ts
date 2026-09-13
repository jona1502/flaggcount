import { DEFAULT_OVERLAY_SETTINGS, isHexColor, parseOverlaySettings, type OverlaySettings, type SettingsV1 } from './settings';
import { RED_FLAG, WHITE_FLAG } from './voting/redFlag';
import { DEFAULT_TARGET, isValidTarget } from './voting/target';
import { parseTrigger, triggerKey, type Trigger } from './voting/triggers';

export const SETTINGS_SCHEMA_VERSION = 2;
/** Absolute upper bounds of the data model; the plan of the user may allow less. */
export const MAX_PROFILES = 10;
export const MAX_COUNTERS = 4;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;
export const MAX_OPTION_TRIGGERS = 8;
export const MAX_WITHDRAWAL_TRIGGERS = 4;
export const MAX_NAME_LENGTH = 60;
/** Generous upper bound: profile URLs are accepted and normalized when connecting. */
export const MAX_USERNAME_LENGTH = 100;

export const DEFAULT_PROFILE_ID = 'default';
export const RED_FLAG_COUNTER_ID = 'red-flags';
export const RED_FLAG_OPTION_ID = 'red-flag';

export type CounterMode = 'single' | 'poll';

export type PollOption = {
  id: string;
  label: string;
  triggers: Trigger[];
  accentColor: string;
};

/** A single counter has exactly one option; a poll has two to six. */
export type CounterDefinition = {
  id: string;
  name: string;
  mode: CounterMode;
  /** `null` counts without a target. */
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

/** Settings persisted between app starts. Votes are deliberately never stored. */
export type Settings = {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  /** Last TikTok username the user connected to; empty if none. */
  username: string;
  activeProfileId: string;
  /** Privacy-first product telemetry is disabled until the user explicitly opts in. */
  telemetryEnabled?: boolean;
  /** Never empty. */
  profiles: StreamProfile[];
};

/** How stored settings were turned into the current schema; anything but `none` must be written back. */
export type SettingsMigration = 'none' | 'from-v1' | 'replaced-invalid';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_TIMESTAMP_LENGTH = 40;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string => typeof value === 'string' && ID_PATTERN.test(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_TIMESTAMP_LENGTH && !Number.isNaN(Date.parse(value));

function parseName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  const length = [...name].length;
  return length >= 1 && length <= MAX_NAME_LENGTH ? name : null;
}

function hasUniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function parseList<T>(value: unknown, min: number, max: number, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return null;
  }
  const parsed: T[] = [];
  for (const item of value) {
    const result = parse(item);
    if (result === null) return null;
    parsed.push(result);
  }
  return parsed;
}

/** The counter every installation starts with, matching FlagCount 0.2: 🚩 votes, 🏳️ withdraws. */
export function createRedFlagCounter(
  target: number = DEFAULT_TARGET,
  overlay: OverlaySettings = DEFAULT_OVERLAY_SETTINGS
): CounterDefinition {
  return {
    id: RED_FLAG_COUNTER_ID,
    name: 'Rote Flaggen',
    mode: 'single',
    target,
    options: [
      {
        id: RED_FLAG_OPTION_ID,
        label: 'Rote Flagge',
        triggers: [{ kind: 'emoji', value: RED_FLAG, match: 'contains' }],
        accentColor: overlay.accentColor
      }
    ],
    withdrawalTriggers: [{ kind: 'emoji', value: `${WHITE_FLAG}️`, match: 'contains' }],
    overlay: { ...overlay }
  };
}

/** Moves the settings of FlagCount 0.2 into one profile with a single red flag counter. */
export function migrateSettingsV1(settings: SettingsV1, now: string): Settings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    username: settings.username,
    activeProfileId: DEFAULT_PROFILE_ID,
    telemetryEnabled: settings.telemetryEnabled === true,
    profiles: [
      {
        id: DEFAULT_PROFILE_ID,
        name: 'Standard',
        counters: [createRedFlagCounter(settings.target, settings.overlay)],
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

export function createDefaultSettings(now: string): Settings {
  return migrateSettingsV1(parseSettingsV1(null), now);
}

function parseUsername(value: unknown): string {
  if (typeof value !== 'string') return '';
  const username = value.trim();
  return [...username].length <= MAX_USERNAME_LENGTH ? username : '';
}

/** Keeps every valid field of 0.2 settings and falls back to the default for the rest. */
export function parseSettingsV1(value: unknown): SettingsV1 {
  const record = isRecord(value) ? value : {};
  const target = record['target'];
  return {
    username: parseUsername(record['username']),
    target: typeof target === 'number' && isValidTarget(target) ? target : DEFAULT_TARGET,
    overlay: parseOverlaySettings(record['overlay']) ?? { ...DEFAULT_OVERLAY_SETTINGS },
    telemetryEnabled: record['telemetryEnabled'] === true
  };
}

function parsePollOption(value: unknown): PollOption | null {
  if (!isRecord(value)) return null;
  const { id, accentColor } = value;
  const label = parseName(value['label']);
  const triggers = parseList(value['triggers'], 1, MAX_OPTION_TRIGGERS, parseTrigger);
  if (!isId(id) || label === null || triggers === null || !isHexColor(accentColor)) {
    return null;
  }
  return { id, label, triggers, accentColor: accentColor.toLowerCase() };
}

/**
 * Reads a counter from untrusted input. Besides the structure it rejects options with the same id
 * and triggers that would match the same messages twice within the counter, including withdrawals.
 */
export function parseCounterDefinition(value: unknown): CounterDefinition | null {
  if (!isRecord(value)) return null;
  const { id, mode, target } = value;
  const name = parseName(value['name']);
  if (!isId(id) || name === null || (mode !== 'single' && mode !== 'poll')) {
    return null;
  }
  if (target !== null && !(typeof target === 'number' && isValidTarget(target))) {
    return null;
  }

  const [minOptions, maxOptions] = mode === 'single' ? [1, 1] : [MIN_POLL_OPTIONS, MAX_POLL_OPTIONS];
  const options = parseList(value['options'], minOptions, maxOptions, parsePollOption);
  const withdrawalTriggers = parseList(value['withdrawalTriggers'], 0, MAX_WITHDRAWAL_TRIGGERS, parseTrigger);
  const overlay = parseOverlaySettings(value['overlay']);
  if (options === null || withdrawalTriggers === null || overlay === null || !hasUniqueIds(options)) {
    return null;
  }

  const triggers = [...options.flatMap((option) => option.triggers), ...withdrawalTriggers];
  if (new Set(triggers.map(triggerKey)).size !== triggers.length) {
    return null;
  }

  return { id, name, mode, target, options, withdrawalTriggers, overlay };
}

/** The counters of one profile, as sent to the voting engine. */
export function parseCounterDefinitions(value: unknown): CounterDefinition[] | null {
  const counters = parseList(value, 1, MAX_COUNTERS, parseCounterDefinition);
  return counters && hasUniqueIds(counters) ? counters : null;
}

export function parseStreamProfile(value: unknown): StreamProfile | null {
  if (!isRecord(value)) return null;
  const { id, createdAt, updatedAt } = value;
  const name = parseName(value['name']);
  const counters = parseCounterDefinitions(value['counters']);
  if (!isId(id) || name === null || counters === null || !isTimestamp(createdAt) || !isTimestamp(updatedAt)) {
    return null;
  }
  return { id, name, counters, createdAt, updatedAt };
}

function parseSettingsV2(record: UnknownRecord): Settings | null {
  const profiles = parseList(record['profiles'], 1, MAX_PROFILES, parseStreamProfile);
  if (profiles === null || !hasUniqueIds(profiles)) {
    return null;
  }
  const activeProfileId = record['activeProfileId'];
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    username: parseUsername(record['username']),
    telemetryEnabled: record['telemetryEnabled'] === true,
    activeProfileId: profiles.some((profile) => profile.id === activeProfileId)
      ? (activeProfileId as string)
      : (profiles[0] as StreamProfile).id,
    profiles
  };
}

/**
 * Reads stored settings of any version. Settings of 0.2 are migrated; a damaged current document is
 * replaced by a fresh profile that keeps whatever 0.2 fields are still readable. Callers keep a backup
 * of the original before they write the result back.
 */
export function parseSettings(value: unknown, now: string): { settings: Settings; migration: SettingsMigration } {
  if (isRecord(value) && value['schemaVersion'] !== undefined) {
    const settings = value['schemaVersion'] === SETTINGS_SCHEMA_VERSION ? parseSettingsV2(value) : null;
    if (settings) {
      return { settings, migration: 'none' };
    }
    return { settings: migrateSettingsV1(parseSettingsV1(value), now), migration: 'replaced-invalid' };
  }
  return { settings: migrateSettingsV1(parseSettingsV1(value), now), migration: 'from-v1' };
}

export function activeProfile(settings: Settings): StreamProfile {
  return settings.profiles.find((profile) => profile.id === settings.activeProfileId) ?? (settings.profiles[0] as StreamProfile);
}

/** The first counter of the active profile: the one the dashboard and the overlay show today. */
export function primaryCounter(settings: Settings): CounterDefinition {
  return activeProfile(settings).counters[0] as CounterDefinition;
}

export function updatePrimaryCounter(
  settings: Settings,
  change: (counter: CounterDefinition) => CounterDefinition,
  now: string
): Settings {
  const profile = activeProfile(settings);
  const [first, ...rest] = profile.counters;
  if (!first) return settings;
  const updated: StreamProfile = { ...profile, counters: [change(first), ...rest], updatedAt: now };
  return {
    ...settings,
    profiles: settings.profiles.map((candidate) => (candidate === profile ? updated : candidate))
  };
}
