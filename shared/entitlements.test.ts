import { describe, expect, it } from 'vitest';
import {
  EntitlementError,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  canUse,
  entitlementsForPlan,
  limitFor,
  requireFeature
  ,validateProfileLimits
} from './entitlements';

describe('shared entitlements', () => {
  it('keeps the existing free workflow useful and ungated', () => {
    expect(FREE_ENTITLEMENTS.limits.counters).toBe(1);
    expect(FREE_ENTITLEMENTS.limits.profiles).toBe(1);
    expect(FREE_ENTITLEMENTS.limits.historyRecords).toBe(0);
    expect(canUse(FREE_ENTITLEMENTS, 'custom-triggers')).toBe(false);
    expect(canUse(FREE_ENTITLEMENTS, 'parallel-counters')).toBe(false);
    expect(limitFor(FREE_ENTITLEMENTS, 'publicOverlays')).toBe(1);
  });

  it('defines every Pro feature and its published limits centrally', () => {
    expect(PRO_ENTITLEMENTS.features.size).toBe(9);
    expect(PRO_ENTITLEMENTS.limits).toEqual({
      profiles: 10,
      counters: 4,
      pollOptions: 6,
      historyRecords: 500,
      positiveTriggersPerOption: 8,
      withdrawalTriggersPerCounter: 4,
      localOverlays: 4,
      publicOverlays: 4
    });
    expect(entitlementsForPlan('pro')).toBe(PRO_ENTITLEMENTS);
    expect(entitlementsForPlan('free')).toBe(FREE_ENTITLEMENTS);
  });

  it('throws a machine-readable error for gated writes', () => {
    expect(() => requireFeature(FREE_ENTITLEMENTS, 'csv-export')).toThrow(EntitlementError);
    try {
      requireFeature(FREE_ENTITLEMENTS, 'csv-export');
    } catch (error) {
      expect(error).toMatchObject({ code: 'feature-not-entitled', feature: 'csv-export' });
    }
    expect(() => requireFeature(PRO_ENTITLEMENTS, 'csv-export')).not.toThrow();
  });

  it('checks proposed profile collections against the same limits', () => {
    const freeProfile = { counters: [{ mode: 'poll' as const, options: [{ triggers: [{}] }, { triggers: [{}] }], withdrawalTriggers: [] }] };
    expect(validateProfileLimits(FREE_ENTITLEMENTS, [freeProfile])).toBe('poll-options-limit');
    expect(validateProfileLimits(PRO_ENTITLEMENTS, [freeProfile])).toBeNull();
    const tooMany = Array.from({ length: 5 }, () => ({ mode: 'single' as const, options: [{ triggers: [] }], withdrawalTriggers: [] }));
    expect(validateProfileLimits(PRO_ENTITLEMENTS, [{ counters: tooMany }])).toBe('counters-limit');
  });
});
