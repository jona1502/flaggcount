import { MAX_COUNTERS, MAX_NAME_LENGTH, MAX_POLL_OPTIONS, type CounterDefinition, type CounterMode } from './profiles';
import { DEFAULT_OVERLAY_SETTINGS, isHexColor, parseOverlaySettings, type OverlaySettings } from './settings';
import { isValidTarget } from './voting/target';
import type { CounterSnapshot } from './voting/VotingEngine';

/** Scope of the overlay that shows every running counter at once. */
export const OVERVIEW_SCOPE = 'all';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_COUNT = 1_000_000_000;

export type BoardOption = {
  optionId: string;
  label: string;
  count: number;
  color: string;
};

/** Everything an overlay needs to draw one counter: aggregated counts and its design, nothing else. */
export type CounterView = {
  counterId: string;
  name: string;
  mode: CounterMode;
  options: BoardOption[];
  totalCount: number;
  target: number | null;
  targetReached: boolean;
  overlay: OverlaySettings;
};

export type BoardAccess =
  | { status: 'ok'; counters: CounterView[] }
  /** The plan does not include this overlay; FlagCount Pro does. */
  | { status: 'pro-required' }
  | { status: 'not-found' };

export function isBoardScope(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function buildCounterViews(snapshots: readonly CounterSnapshot[], definitions: readonly CounterDefinition[]): CounterView[] {
  return snapshots.map((snapshot) => {
    const definition = definitions.find((candidate) => candidate.id === snapshot.counterId);
    const overlay = definition?.overlay ?? DEFAULT_OVERLAY_SETTINGS;
    return {
      counterId: snapshot.counterId,
      name: snapshot.name,
      mode: snapshot.mode,
      options: snapshot.options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
        count: option.count,
        color: definition?.options.find((candidate) => candidate.id === option.optionId)?.accentColor ?? overlay.accentColor
      })),
      totalCount: snapshot.totalCount,
      target: snapshot.target,
      targetReached: snapshot.targetReached,
      overlay: { ...overlay }
    };
  });
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;

const isLabel = (value: unknown): value is string => typeof value === 'string' && [...value].length <= MAX_NAME_LENGTH;

function parseOption(value: unknown): BoardOption | null {
  if (typeof value !== 'object' || value === null) return null;
  const { optionId, label, count, color } = value as Record<string, unknown>;
  if (!isBoardScope(optionId) || !isLabel(label) || !isCount(count) || !isHexColor(color)) return null;
  return { optionId, label, count, color: color.toLowerCase() };
}

function parseView(value: unknown): CounterView | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const { counterId, name, mode, totalCount, target, targetReached, options } = record;
  const overlay = parseOverlaySettings(record['overlay']);
  const valid =
    isBoardScope(counterId) &&
    isLabel(name) &&
    (mode === 'single' || mode === 'poll') &&
    isCount(totalCount) &&
    (target === null || (typeof target === 'number' && isValidTarget(target))) &&
    typeof targetReached === 'boolean' &&
    overlay !== null &&
    Array.isArray(options) &&
    options.length >= 1 &&
    options.length <= MAX_POLL_OPTIONS;
  if (!valid) return null;

  const parsedOptions: BoardOption[] = [];
  for (const option of options as unknown[]) {
    const parsed = parseOption(option);
    if (!parsed) return null;
    parsedOptions.push(parsed);
  }
  return { counterId, name, mode, options: parsedOptions, totalCount, target, targetReached, overlay };
}

/** Reads counter views from untrusted input, e.g. a relay update. An empty list clears an overlay. */
export function parseCounterViews(value: unknown): CounterView[] | null {
  if (!Array.isArray(value) || value.length > MAX_COUNTERS) return null;
  const views: CounterView[] = [];
  for (const item of value) {
    const view = parseView(item);
    if (!view) return null;
    views.push(view);
  }
  return views;
}
