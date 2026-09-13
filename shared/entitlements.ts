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
export type Plan = 'free' | 'pro';

export type Entitlements = {
  plan: Plan;
  features: ReadonlySet<Feature>;
  limits: {
    profiles: number;
    counters: number;
    pollOptions: number;
    historyRecords: number;
    positiveTriggersPerOption: number;
    withdrawalTriggersPerCounter: number;
    localOverlays: number;
    publicOverlays: number;
  };
};

const FREE_FEATURES: ReadonlySet<Feature> = new Set();
const PRO_FEATURES: ReadonlySet<Feature> = new Set(FEATURES);

export const FREE_ENTITLEMENTS: Entitlements = {
  plan: 'free',
  features: FREE_FEATURES,
  limits: {
    profiles: 1,
    counters: 1,
    pollOptions: 1,
    historyRecords: 0,
    positiveTriggersPerOption: 0,
    withdrawalTriggersPerCounter: 0,
    localOverlays: 1,
    publicOverlays: 1
  }
};

export const PRO_ENTITLEMENTS: Entitlements = {
  plan: 'pro',
  features: PRO_FEATURES,
  limits: {
    profiles: 10,
    counters: 4,
    pollOptions: 6,
    historyRecords: 500,
    positiveTriggersPerOption: 8,
    withdrawalTriggersPerCounter: 4,
    localOverlays: 4,
    publicOverlays: 4
  }
};

export function canUse(entitlements: Entitlements, feature: Feature): boolean {
  return entitlements.features.has(feature);
}

export function limitFor<K extends keyof Entitlements['limits']>(entitlements: Entitlements, limit: K): number {
  return entitlements.limits[limit];
}

export function requireFeature(entitlements: Entitlements, feature: Feature): void {
  if (!canUse(entitlements, feature)) throw new EntitlementError(feature);
}

export class EntitlementError extends Error {
  readonly code = 'feature-not-entitled';
  constructor(readonly feature: Feature) {
    super(`Feature requires FlagCount Pro: ${feature}`);
    this.name = 'EntitlementError';
  }
}

export function entitlementsForPlan(plan: Plan): Entitlements {
  return plan === 'pro' ? PRO_ENTITLEMENTS : FREE_ENTITLEMENTS;
}

export type EntitlementViolation =
  | 'profiles-limit'
  | 'counters-limit'
  | 'poll-options-limit'
  | 'custom-triggers'
  | 'withdrawal-triggers-limit'
  | 'history-limit';

/** Checks a proposed profile collection before any write; returns the first user-actionable gate. */
export function validateProfileLimits(
  entitlements: Entitlements,
  profiles: ReadonlyArray<{ counters: ReadonlyArray<{ mode: 'single' | 'poll'; options: ReadonlyArray<{ triggers: ReadonlyArray<unknown> }>; withdrawalTriggers: ReadonlyArray<unknown> }> }>
): EntitlementViolation | null {
  if (profiles.length > entitlements.limits.profiles) return 'profiles-limit';
  for (const profile of profiles) {
    if (profile.counters.length > entitlements.limits.counters) return 'counters-limit';
    for (const counter of profile.counters) {
      if (counter.mode === 'poll' && counter.options.length > entitlements.limits.pollOptions) return 'poll-options-limit';
      if (counter.withdrawalTriggers.length > entitlements.limits.withdrawalTriggersPerCounter) {
        if (entitlements.limits.withdrawalTriggersPerCounter === 0) return 'custom-triggers';
        return 'withdrawal-triggers-limit';
      }
      for (const option of counter.options) {
        if (option.triggers.length > entitlements.limits.positiveTriggersPerOption) return 'custom-triggers';
      }
    }
  }
  return null;
}
