import { describe, expect, it } from 'vitest';
import {
  EntitlementError,
  FEATURES,
  FREE_ENTITLEMENTS,
  PRO_ENTITLEMENTS,
  PRO_LIMITS,
  canUse,
  checkCounters,
  checkSettings,
  effectiveCounters,
  effectiveProfile,
  entitlementsFor,
  isProfileUsable,
  limitFor,
  requireFeature,
  requireWithinLimit,
  requiredFeatures
} from './entitlements';
import { createDefaultSettings, createRedFlagCounter, type CounterDefinition, type Settings } from './profiles';
import { DEFAULT_OVERLAY_SETTINGS } from './settings';

const NOW = '2026-09-13T21:30:00.000Z';

function poll(id: string, options = 2, triggersPerOption = 1): CounterDefinition {
  return {
    id,
    name: 'Umfrage',
    mode: 'poll',
    target: null,
    options: Array.from({ length: options }, (_, option) => ({
      id: `o${option}`,
      label: `Option ${option}`,
      triggers: Array.from({ length: triggersPerOption }, (_, trigger) => ({
        kind: 'text' as const,
        value: `w${option}-${trigger}`,
        match: 'word' as const
      })),
      accentColor: '#112233'
    })),
    withdrawalTriggers: [],
    overlay: { ...DEFAULT_OVERLAY_SETTINGS }
  };
}

function withProfiles(count: number): Settings {
  const settings = createDefaultSettings(NOW);
  const [profile] = settings.profiles;
  return {
    ...settings,
    profiles: Array.from({ length: count }, (_, index) => ({ ...profile!, id: `p${index}`, name: `Profil ${index}` })),
    activeProfileId: 'p0'
  };
}

describe('plans', () => {
  it('keeps every Pro feature out of Free', () => {
    for (const feature of FEATURES) {
      expect(canUse(FREE_ENTITLEMENTS, feature)).toBe(false);
      expect(canUse(PRO_ENTITLEMENTS, feature)).toBe(true);
    }
  });

  it('defines the limits of the plan', () => {
    expect(FREE_ENTITLEMENTS.limits).toEqual({
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
    expect(PRO_LIMITS).toEqual({
      profiles: 10,
      counters: 4,
      pollOptions: 6,
      optionTriggers: 8,
      withdrawalTriggers: 4,
      overlayUrls: 4,
      historyRecords: 500,
      logoBytes: 2 * 1024 * 1024,
      backgroundBytes: 5 * 1024 * 1024
    });
    expect(Object.isFrozen(FREE_ENTITLEMENTS.limits)).toBe(true);
  });

  it('grants only the known features a license lists', () => {
    const partial = entitlementsFor('pro', ['history', 'future-feature']);

    expect(canUse(partial, 'history')).toBe(true);
    expect(canUse(partial, 'csv-export')).toBe(false);
    expect(limitFor(partial, 'profiles')).toBe(10);
    expect(entitlementsFor('free', FEATURES)).toBe(FREE_ENTITLEMENTS);
  });

  it('throws a typed error for missing features and exceeded limits', () => {
    expect(() => requireFeature(PRO_ENTITLEMENTS, 'history')).not.toThrow();
    expect(() => requireFeature(FREE_ENTITLEMENTS, 'history')).toThrow(EntitlementError);
    expect(() => requireWithinLimit(PRO_ENTITLEMENTS, 'profiles', 10)).not.toThrow();

    try {
      requireWithinLimit(PRO_ENTITLEMENTS, 'profiles', 11);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EntitlementError);
      expect((error as EntitlementError).violation).toEqual({ kind: 'limit', limit: 'profiles', allowed: 10, requested: 11 });
    }
  });
});

describe('checkCounters', () => {
  it('allows the red flag counter with any name, target and basic design on Free', () => {
    const counter = { ...createRedFlagCounter(7, { ...DEFAULT_OVERLAY_SETTINGS, size: 40 }), name: 'Meine Flaggen' };

    expect(requiredFeatures(counter)).toEqual([]);
    expect(checkCounters([counter], FREE_ENTITLEMENTS)).toEqual([]);
    expect(checkCounters([{ ...counter, withdrawalTriggers: [] }], FREE_ENTITLEMENTS)).toEqual([]);
  });

  it('requires Pro for polls, custom triggers and parallel counters', () => {
    const customFlag = createRedFlagCounter();
    customFlag.options[0]!.triggers = [{ kind: 'emoji', value: '🔥', match: 'contains' }];

    expect(requiredFeatures(poll('poll'))).toEqual(['multi-option-polls', 'custom-triggers']);
    expect(checkCounters([customFlag], FREE_ENTITLEMENTS)).toEqual([{ kind: 'feature', feature: 'custom-triggers' }]);
    expect(checkCounters([createRedFlagCounter(), { ...createRedFlagCounter(), id: 'second' }], FREE_ENTITLEMENTS)).toEqual([
      { kind: 'feature', feature: 'parallel-counters' },
      { kind: 'limit', limit: 'counters', allowed: 1, requested: 2 }
    ]);
  });

  it('accepts Pro configurations exactly up to each limit', () => {
    const atLimit = [poll('a', 6, 8), poll('b'), poll('c'), poll('d')];
    atLimit[0]!.withdrawalTriggers = ['x1', 'x2', 'x3', 'x4'].map((value) => ({ kind: 'text', value, match: 'word' }));

    expect(checkCounters(atLimit, PRO_ENTITLEMENTS)).toEqual([]);
    expect(checkCounters([...atLimit, poll('e')], PRO_ENTITLEMENTS)).toEqual([
      { kind: 'limit', limit: 'counters', allowed: 4, requested: 5 }
    ]);
    expect(checkCounters([poll('a', 7)], PRO_ENTITLEMENTS)).toContainEqual({
      kind: 'limit',
      limit: 'pollOptions',
      allowed: 6,
      requested: 7
    });
    expect(checkCounters([poll('a', 2, 9)], PRO_ENTITLEMENTS)).toContainEqual({
      kind: 'limit',
      limit: 'optionTriggers',
      allowed: 8,
      requested: 9
    });
  });
});

describe('profiles', () => {
  it('allows one profile on Free and ten on Pro', () => {
    expect(checkSettings(withProfiles(1), FREE_ENTITLEMENTS)).toEqual([]);
    expect(checkSettings(withProfiles(2), FREE_ENTITLEMENTS)).toContainEqual({ kind: 'feature', feature: 'multiple-profiles' });
    expect(checkSettings(withProfiles(10), PRO_ENTITLEMENTS)).toEqual([]);
    expect(checkSettings(withProfiles(11), PRO_ENTITLEMENTS)).toEqual([
      { kind: 'limit', limit: 'profiles', allowed: 10, requested: 11 }
    ]);
  });

  it('keeps extra profiles after a downgrade but only uses the first one', () => {
    const settings = { ...withProfiles(3), activeProfileId: 'p2' };

    expect(isProfileUsable(settings, 'p2', PRO_ENTITLEMENTS)).toBe(true);
    expect(isProfileUsable(settings, 'p2', FREE_ENTITLEMENTS)).toBe(false);
    expect(isProfileUsable(settings, 'missing', PRO_ENTITLEMENTS)).toBe(false);
    expect(effectiveProfile(settings, PRO_ENTITLEMENTS).id).toBe('p2');
    expect(effectiveProfile(settings, FREE_ENTITLEMENTS).id).toBe('p0');
    expect(settings.profiles).toHaveLength(3);
  });
});

describe('effectiveCounters', () => {
  it('runs allowed configurations unchanged', () => {
    const counters = [createRedFlagCounter(), poll('poll')];

    expect(effectiveCounters(counters, PRO_ENTITLEMENTS)).toEqual(counters);
  });

  it('falls back to what Free covers without deleting anything', () => {
    const flags = { ...createRedFlagCounter(30), id: 'flags' };
    const counters = [poll('poll'), flags, poll('other')];

    expect(effectiveCounters(counters, FREE_ENTITLEMENTS)).toEqual([flags]);
    expect(counters).toHaveLength(3);
  });

  it('runs the red flag counter with the first counter’s target and design if nothing else is allowed', () => {
    const overlay = { ...DEFAULT_OVERLAY_SETTINGS, accentColor: '#00ff88' };
    const onlyPolls = [{ ...poll('poll'), target: 12, overlay }];

    expect(effectiveCounters(onlyPolls, FREE_ENTITLEMENTS)).toEqual([createRedFlagCounter(12, overlay)]);
    expect(effectiveCounters([poll('poll')], FREE_ENTITLEMENTS)).toEqual([createRedFlagCounter(100, DEFAULT_OVERLAY_SETTINGS)]);
  });
});
