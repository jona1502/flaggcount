import { DEFAULT_OVERLAY_SETTINGS, isHexColor, parseOverlaySettings, type OverlaySettings, type SettingsV1 } from './settings';
import { RED_FLAG, WHITE_FLAG } from './voting/redFlag';
import { DEFAULT_TARGET, isValidTarget } from './voting/target';
import { parseTrigger, triggerKey, type Trigger } from './voting/triggers';
import { parseSavedLiveSource, type SavedLiveSource } from './live';

export const SETTINGS_SCHEMA_VERSION = 5;
/** Absolute upper bounds of the data model; the plan of the user may allow less. */
export const MAX_PROFILES = 10;
export const MAX_COUNTERS = 4;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;
export const MAX_OPTION_TRIGGERS = 8;
export const MAX_WITHDRAWAL_TRIGGERS = 4;
export const MAX_NAME_LENGTH = 60;
export const MAX_OVERLAY_VIEWS = 8;
/** Entries per scene; the same counter may appear more than once, e.g. large and small. */
export const MAX_SCENE_ITEMS = 6;
export const MIN_SCENE_ITEM_SCALE = 40;
export const MAX_SCENE_ITEM_SCALE = 160;
/** Scene id of the automatic scene with every running counter; also the default live scene. */
export const AUTO_SCENE_ID = 'all';
export const MIN_OVERLAY_VIEW_GAP = 0;
export const MAX_OVERLAY_VIEW_GAP = 64;
export const MIN_OVERLAY_VIEW_SCALE = 20;
export const MAX_OVERLAY_VIEW_SCALE = 100;
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

export const OVERLAY_LAYOUTS = ['auto', 'vertical', 'horizontal', 'grid'] as const;
export type OverlayLayout = (typeof OVERLAY_LAYOUTS)[number];
export const OVERLAY_ALIGNMENTS = ['start', 'center', 'end'] as const;
export type OverlayAlignment = (typeof OVERLAY_ALIGNMENTS)[number];

/** One entry of a scene. Its own id tells two entries of the same counter apart. */
export type OverlaySceneItem = {
  id: string;
  counterId: string;
  /** Size of this entry in percent. */
  scale: number;
};

/** A stable browser-source composition of counters from one profile, shown as a scene in the app. */
export type OverlayView = {
  id: string;
  name: string;
  items: OverlaySceneItem[];
  layout: OverlayLayout;
  gap: number;
  horizontalAlign: OverlayAlignment;
  verticalAlign: OverlayAlignment;
  scale: number;
  createdAt: string;
  updatedAt: string;
};
export type OverlayViewInput = Omit<OverlayView, 'id' | 'createdAt' | 'updatedAt'>;

export type StreamProfile = {
  id: string;
  name: string;
  counters: CounterDefinition[];
  overlayViews: OverlayView[];
  /** The scene shown under `/overlay/live`: `all` or the id of one of `overlayViews`. */
  liveSceneId: string;
  /** Hides the live overlay without forgetting the live scene. */
  liveHidden: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Settings persisted between app starts. Votes are deliberately never stored. */
export type Settings = {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  /** Last TikTok username the user connected to; empty if none. */
  username: string;
  liveSource: SavedLiveSource;
  activeProfileId: string;
  /** Never empty. */
  profiles: StreamProfile[];
};

/** How stored settings were turned into the current schema; anything but `none` must be written back. */
export type SettingsMigration = 'none' | 'from-v1' | 'from-v2' | 'from-v3' | 'from-v4' | 'replaced-invalid';

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
    liveSource: { platform: 'tiktok', channelInput: settings.username },
    activeProfileId: DEFAULT_PROFILE_ID,
    profiles: [
      {
        id: DEFAULT_PROFILE_ID,
        name: 'Standard',
        counters: [createRedFlagCounter(settings.target, settings.overlay)],
        overlayViews: [],
        liveSceneId: AUTO_SCENE_ID,
        liveHidden: false,
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
    overlay: parseOverlaySettings(record['overlay']) ?? { ...DEFAULT_OVERLAY_SETTINGS }
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

function parseSceneItem(value: unknown, counterIds?: ReadonlySet<string>): OverlaySceneItem | null {
  if (!isRecord(value)) return null;
  const { id, counterId, scale } = value;
  if (!isId(id) || !isId(counterId) || (counterIds !== undefined && !counterIds.has(counterId))) return null;
  if (typeof scale !== 'number' || !Number.isInteger(scale) || scale < MIN_SCENE_ITEM_SCALE || scale > MAX_SCENE_ITEM_SCALE) return null;
  return { id, counterId, scale };
}

/**
 * Entries of a scene. Up to schema 4 a view listed each counter once in `counterIds`; those become entries
 * `i-1`, `i-2`, … at full size, exactly like the Rust migration.
 */
function parseSceneItems(value: UnknownRecord, counterIds?: ReadonlySet<string>): OverlaySceneItem[] | null {
  const legacy = value['counterIds'];
  const raw = Array.isArray(value['items'])
    ? value['items']
    : Array.isArray(legacy) && new Set(legacy).size === legacy.length
      ? legacy.map((counterId: unknown, index) => ({ id: `i-${index + 1}`, counterId, scale: 100 }))
      : null;
  const items = raw && parseList(raw, 1, MAX_SCENE_ITEMS, (item) => parseSceneItem(item, counterIds));
  return items && hasUniqueIds(items) ? items : null;
}

export function parseOverlayView(value: unknown, counterIds?: ReadonlySet<string>): OverlayView | null {
  if (!isRecord(value)) return null;
  const { id, layout, gap, horizontalAlign, verticalAlign, scale, createdAt, updatedAt } = value;
  const name = parseName(value['name']);
  const items = parseSceneItems(value, counterIds);
  if (
    !isId(id) ||
    id === AUTO_SCENE_ID ||
    counterIds?.has(id) === true ||
    name === null ||
    items === null ||
    !(OVERLAY_LAYOUTS as readonly unknown[]).includes(layout) ||
    !(OVERLAY_ALIGNMENTS as readonly unknown[]).includes(horizontalAlign) ||
    !(OVERLAY_ALIGNMENTS as readonly unknown[]).includes(verticalAlign) ||
    typeof gap !== 'number' ||
    !Number.isInteger(gap) ||
    gap < MIN_OVERLAY_VIEW_GAP ||
    gap > MAX_OVERLAY_VIEW_GAP ||
    typeof scale !== 'number' ||
    !Number.isInteger(scale) ||
    scale < MIN_OVERLAY_VIEW_SCALE ||
    scale > MAX_OVERLAY_VIEW_SCALE ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    return null;
  }
  return {
    id,
    name,
    items,
    layout: layout as OverlayLayout,
    gap,
    horizontalAlign: horizontalAlign as OverlayAlignment,
    verticalAlign: verticalAlign as OverlayAlignment,
    scale,
    createdAt,
    updatedAt
  };
}

export function parseStreamProfile(value: unknown): StreamProfile | null {
  if (!isRecord(value)) return null;
  const { id, createdAt, updatedAt } = value;
  const name = parseName(value['name']);
  const counters = parseCounterDefinitions(value['counters']);
  const counterIds = new Set(counters?.map((counter) => counter.id) ?? []);
  const rawViews = value['overlayViews'] ?? [];
  const overlayViews = parseList(rawViews, 0, MAX_OVERLAY_VIEWS, (view) => parseOverlayView(view, counterIds));
  if (!isId(id) || name === null || counters === null || overlayViews === null || !hasUniqueIds(overlayViews) || !isTimestamp(createdAt) || !isTimestamp(updatedAt)) {
    return null;
  }
  // A live scene that no longer exists falls back to the automatic scene instead of breaking the profile.
  const requestedScene = value['liveSceneId'];
  const liveSceneId =
    typeof requestedScene === 'string' && overlayViews.some((view) => view.id === requestedScene) ? requestedScene : AUTO_SCENE_ID;
  const liveHidden = value['liveHidden'] === true;
  return { id, name, counters, overlayViews, liveSceneId, liveHidden, createdAt, updatedAt };
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
    liveSource: parseSavedLiveSource(record['liveSource'], parseUsername(record['username'])),
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
    const version = value['schemaVersion'];
    const settings = version === SETTINGS_SCHEMA_VERSION || version === 4 || version === 3 || version === 2 ? parseSettingsV2(value) : null;
    if (settings) {
      const migration: SettingsMigration = version === 2 ? 'from-v2' : version === 3 ? 'from-v3' : version === 4 ? 'from-v4' : 'none';
      return { settings, migration };
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
