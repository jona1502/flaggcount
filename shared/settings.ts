export const OVERLAY_POSITIONS = ['top', 'center', 'bottom'] as const;
export const FLAG_ANIMATIONS = ['none', 'wave', 'bounce', 'pulse'] as const;
export const TARGET_EFFECTS = ['none', 'glow', 'confetti'] as const;
export const MIN_OVERLAY_SIZE = 20;
export const MAX_OVERLAY_SIZE = 100;

export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];
/** `wave` runs continuously; `bounce` and `pulse` play on every new vote. */
export type FlagAnimation = (typeof FLAG_ANIMATIONS)[number];
/** Plays once the target is reached. */
export type TargetEffect = (typeof TARGET_EFFECTS)[number];

export type OverlaySettings = {
  /** Panel behind the numbers; off for a fully transparent overlay. */
  showBackground: boolean;
  showProgress: boolean;
  /** Progress bar and highlights, `#rrggbb`. */
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  /** Opacity of the background panel in percent. */
  backgroundOpacity: number;
  position: OverlayPosition;
  /** Share of the streaming source the overlay may fill, in percent. */
  size: number;
  flagAnimation: FlagAnimation;
  targetEffect: TargetEffect;
};

/** Settings persisted between app starts. Votes are deliberately never stored. */
export type Settings = {
  /** Last TikTok username the user connected to; empty if none. */
  username: string;
  target: number;
  overlay: OverlaySettings;
};

/** Matches the original overlay, so nothing changes until the streamer customizes it. */
export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  showBackground: true,
  showProgress: true,
  accentColor: '#e82634',
  textColor: '#ffffff',
  backgroundColor: '#0c0c10',
  backgroundOpacity: 80,
  position: 'center',
  size: 92,
  flagAnimation: 'none',
  targetEffect: 'none'
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const isBoolean = (value: unknown): boolean => typeof value === 'boolean';
const isColor = (value: unknown): boolean => typeof value === 'string' && HEX_COLOR.test(value);
const isIntegerIn =
  (min: number, max: number) =>
  (value: unknown): boolean =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const isOneOf =
  (options: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === 'string' && options.includes(value);

const OVERLAY_FIELDS: { [Key in keyof OverlaySettings]: (value: unknown) => boolean } = {
  showBackground: isBoolean,
  showProgress: isBoolean,
  accentColor: isColor,
  textColor: isColor,
  backgroundColor: isColor,
  backgroundOpacity: isIntegerIn(0, 100),
  position: isOneOf(OVERLAY_POSITIONS),
  size: isIntegerIn(MIN_OVERLAY_SIZE, MAX_OVERLAY_SIZE),
  flagAnimation: isOneOf(FLAG_ANIMATIONS),
  targetEffect: isOneOf(TARGET_EFFECTS)
};

/**
 * Reads overlay settings from untrusted input. Missing fields get their defaults, so settings
 * saved by older versions and updates from older apps keep working; invalid values reject the whole object.
 */
export function parseOverlaySettings(value: unknown): OverlaySettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const parsed: Record<string, unknown> = { ...DEFAULT_OVERLAY_SETTINGS };
  for (const [key, isValid] of Object.entries(OVERLAY_FIELDS)) {
    const field = record[key];
    if (field === undefined) continue;
    if (!isValid(field)) return null;
    parsed[key] = isColor(field) ? (field as string).toLowerCase() : field;
  }
  return parsed as OverlaySettings;
}
