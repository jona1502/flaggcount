import { createRedFlagCounter, type CounterDefinition, type Settings, type StreamProfile } from './profiles';
import { RED_FLAG, WHITE_FLAG } from './voting/redFlag';
import { triggerKey, type Trigger } from './voting/triggers';

export type Plan = 'free' | 'pro';

/** Every product capability that is not part of FlagCount Free. The only source of truth for gates. */
export const FEATURES = [
  'custom-triggers',
  'multi-option-polls',
  'parallel-counters',
  'multiple-profiles',
  'history',
  'csv-export',
  'premium-templates',
  'custom-branding',
  'priority-support'
] as const;

export type Feature = (typeof FEATURES)[number];

export type PlanLimits = {
  profiles: number;
  /** Counters and polls running at the same time. */
  counters: number;
  /** Options per counter; Free only has the single red flag option. */
  pollOptions: number;
  optionTriggers: number;
  withdrawalTriggers: number;
  /** Local and online overlay URLs, one per counter. */
  overlayUrls: number;
  /** Stored aggregated rounds; Free keeps no history. */
  historyRecords: number;
  logoBytes: number;
  backgroundBytes: number;
};

export type LimitName = keyof PlanLimits;

export type Entitlements = {
  plan: Plan;
  features: ReadonlySet<Feature>;
  limits: Readonly<PlanLimits>;
};

const MEGABYTE = 1024 * 1024;

export const FREE_LIMITS: Readonly<PlanLimits> = Object.freeze({
  profiles: 1,
  counters: 1,
  pollOptions: 1,
  optionTriggers: 1,
  withdrawalTriggers: 1,
  overlayUrls: 1,
  historyRecords: 0,
  logoBytes: 0,
  backgroundBytes: 0
});

export const PRO_LIMITS: Readonly<PlanLimits> = Object.freeze({
  profiles: 10,
  counters: 4,
  pollOptions: 6,
  optionTriggers: 8,
  withdrawalTriggers: 4,
  overlayUrls: 4,
  historyRecords: 500,
  logoBytes: 2 * MEGABYTE,
  backgroundBytes: 5 * MEGABYTE
});

export const FREE_ENTITLEMENTS: Entitlements = Object.freeze({
  plan: 'free',
  features: new Set<Feature>(),
  limits: FREE_LIMITS
});

export const PRO_ENTITLEMENTS: Entitlements = Object.freeze({
  plan: 'pro',
  features: new Set<Feature>(FEATURES),
  limits: PRO_LIMITS
});

export function isFeature(value: unknown): value is Feature {
  return typeof value === 'string' && (FEATURES as readonly string[]).includes(value);
}

/**
 * Entitlements of a verified license. A license may grant fewer features than the plan offers;
 * unknown feature names from newer servers are ignored.
 */
export function entitlementsFor(plan: Plan, grantedFeatures: readonly string[] = FEATURES): Entitlements {
  if (plan === 'free') return FREE_ENTITLEMENTS;
  return { plan, features: new Set(grantedFeatures.filter(isFeature)), limits: PRO_LIMITS };
}

export function canUse(entitlements: Entitlements, feature: Feature): boolean {
  return entitlements.features.has(feature);
}

export function limitFor(entitlements: Entitlements, limit: LimitName): number {
  return entitlements.limits[limit];
}

/**
 * Pro features a Pro license does not grant. Free and complete Pro licenses have none; anything else is
 * explained to the streamer with a refresh action instead of silently hiding the feature.
 */
export function missingProFeatures(plan: Plan, grantedFeatures: readonly string[]): Feature[] {
  if (plan !== 'pro') return [];
  return FEATURES.filter((feature) => !grantedFeatures.includes(feature));
}

export type EntitlementViolation =
  | { kind: 'feature'; feature: Feature }
  | { kind: 'limit'; limit: LimitName; allowed: number; requested: number };

/** Thrown by write actions the current plan does not allow; the UI shows the matching Pro hint. */
export class EntitlementError extends Error {
  readonly code = 'pro-required';

  constructor(readonly violation: EntitlementViolation) {
    super(
      violation.kind === 'feature'
        ? `The feature ${violation.feature} requires FlagCount Pro`
        : `The limit ${violation.limit} allows ${violation.allowed}, requested ${violation.requested}`
    );
    this.name = 'EntitlementError';
  }
}

export function requireFeature(entitlements: Entitlements, feature: Feature): void {
  if (!canUse(entitlements, feature)) {
    throw new EntitlementError({ kind: 'feature', feature });
  }
}

export function requireWithinLimit(entitlements: Entitlements, limit: LimitName, requested: number): void {
  const allowed = limitFor(entitlements, limit);
  if (requested > allowed) {
    throw new EntitlementError({ kind: 'limit', limit, allowed, requested });
  }
}

const sameTriggers = (triggers: readonly Trigger[], expected: readonly string[]): boolean =>
  triggers.length === expected.length && triggers.every((trigger, index) => triggerKey(trigger) === expected[index]);

const RED_FLAG_KEYS = [triggerKey({ kind: 'emoji', value: RED_FLAG, match: 'contains' })];
const WHITE_FLAG_KEYS = [triggerKey({ kind: 'emoji', value: WHITE_FLAG, match: 'contains' })];

/** Features a counter needs beyond the Free red flag counter. Names, targets and the basic design stay Free. */
export function requiredFeatures(counter: CounterDefinition): Feature[] {
  const features: Feature[] = [];
  if (counter.overlay.theme !== 'standard') features.push('premium-templates');
  if (counter.overlay.font !== 'system' || counter.overlay.logoAsset !== null || counter.overlay.backgroundAsset !== null) {
    features.push('custom-branding');
  }
  if (counter.mode === 'poll') {
    features.push('multi-option-polls');
  }
  const customTriggers =
    counter.options.some((option) => !sameTriggers(option.triggers, RED_FLAG_KEYS)) ||
    !(counter.withdrawalTriggers.length === 0 || sameTriggers(counter.withdrawalTriggers, WHITE_FLAG_KEYS));
  if (customTriggers) {
    features.push('custom-triggers');
  }
  return features;
}

function limitViolation(entitlements: Entitlements, limit: LimitName, requested: number): EntitlementViolation[] {
  const allowed = limitFor(entitlements, limit);
  return requested > allowed ? [{ kind: 'limit', limit, allowed, requested }] : [];
}

/** Everything that keeps these counters from running on the given plan; empty if they are allowed. */
export function checkCounters(counters: readonly CounterDefinition[], entitlements: Entitlements): EntitlementViolation[] {
  const violations: EntitlementViolation[] = [];
  if (counters.length > 1 && !canUse(entitlements, 'parallel-counters')) {
    violations.push({ kind: 'feature', feature: 'parallel-counters' });
  }
  violations.push(...limitViolation(entitlements, 'counters', counters.length));

  for (const counter of counters) {
    for (const feature of requiredFeatures(counter)) {
      if (!canUse(entitlements, feature)) violations.push({ kind: 'feature', feature });
    }
    violations.push(...limitViolation(entitlements, 'pollOptions', counter.options.length));
    violations.push(...limitViolation(entitlements, 'withdrawalTriggers', counter.withdrawalTriggers.length));
    const mostTriggers = Math.max(0, ...counter.options.map((option) => option.triggers.length));
    violations.push(...limitViolation(entitlements, 'optionTriggers', mostTriggers));
  }

  // The same missing feature is reported once.
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = JSON.stringify(violation);
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

export function checkSettings(settings: Settings, entitlements: Entitlements): EntitlementViolation[] {
  const violations: EntitlementViolation[] = [];
  if (settings.profiles.length > 1 && !canUse(entitlements, 'multiple-profiles')) {
    violations.push({ kind: 'feature', feature: 'multiple-profiles' });
  }
  violations.push(...limitViolation(entitlements, 'profiles', settings.profiles.length));
  for (const profile of settings.profiles) {
    violations.push(...checkCounters(profile.counters, entitlements));
  }
  return violations;
}

/**
 * Only the first profiles up to the plan's limit are usable; after a downgrade the others stay stored
 * but inactive until Pro is active again. The Free profile is always the first one.
 */
export function isProfileUsable(settings: Settings, profileId: string, entitlements: Entitlements): boolean {
  const index = settings.profiles.findIndex((profile) => profile.id === profileId);
  return index >= 0 && index < limitFor(entitlements, 'profiles');
}

export function effectiveProfile(settings: Settings, entitlements: Entitlements): StreamProfile {
  const active = settings.profiles.find((profile) => profile.id === settings.activeProfileId);
  if (active && isProfileUsable(settings, active.id, entitlements)) return active;
  return settings.profiles[0] as StreamProfile;
}

/**
 * The counters that may actually run. Nothing is deleted: counters the plan does not cover are
 * skipped, and if none is left the Free red flag counter runs with the first counter's target and design.
 */
export function effectiveCounters(counters: readonly CounterDefinition[], entitlements: Entitlements): CounterDefinition[] {
  if (checkCounters(counters, entitlements).length === 0) {
    return [...counters];
  }
  const allowed = counters
    .filter((counter) => checkCounters([counter], entitlements).length === 0)
    .slice(0, limitFor(entitlements, 'counters'));
  if (allowed.length > 0) {
    return allowed;
  }
  const first = counters[0];
  return [createRedFlagCounter(first?.target ?? undefined, first?.overlay)];
}
