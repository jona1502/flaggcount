import { describe, expect, it } from 'vitest';
import {
  MAX_COUNTERS,
  MAX_NAME_LENGTH,
  MAX_PROFILES,
  activeProfile,
  createDefaultSettings,
  createRedFlagCounter,
  migrateSettingsV1,
  parseCounterDefinition,
  parseCounterDefinitions,
  parseSettings,
  primaryCounter,
  updatePrimaryCounter,
  type CounterDefinition
} from './profiles';
import { DEFAULT_OVERLAY_SETTINGS } from './settings';

const NOW = '2026-09-13T21:30:00.123Z';
const LATER = '2026-09-14T08:00:00.000Z';

function poll(optionCount: number): CounterDefinition {
  return {
    id: 'poll',
    name: 'Umfrage',
    mode: 'poll',
    target: null,
    options: Array.from({ length: optionCount }, (_, index) => ({
      id: `option-${index}`,
      label: `Option ${index}`,
      triggers: [{ kind: 'text', value: `wahl${index}`, match: 'word' }],
      accentColor: '#112233'
    })),
    withdrawalTriggers: [],
    overlay: { ...DEFAULT_OVERLAY_SETTINGS }
  };
}

describe('settings migration', () => {
  it('moves the 0.2 settings into one profile with the red flag counter', () => {
    const overlay = { ...DEFAULT_OVERLAY_SETTINGS, showBackground: false, accentColor: '#00ff88' };

    const { settings, migration } = parseSettings({ username: 'streamer', target: 250, overlay }, NOW);

    expect(migration).toBe('from-v1');
    expect(settings).toEqual({
      schemaVersion: 2,
      username: 'streamer',
      activeProfileId: 'default',
      telemetryEnabled: false,
      profiles: [
        {
          id: 'default',
          name: 'Standard',
          counters: [
            {
              id: 'red-flags',
              name: 'Rote Flaggen',
              mode: 'single',
              target: 250,
              options: [
                {
                  id: 'red-flag',
                  label: 'Rote Flagge',
                  triggers: [{ kind: 'emoji', value: '🚩', match: 'contains' }],
                  accentColor: '#00ff88'
                }
              ],
              withdrawalTriggers: [{ kind: 'emoji', value: '🏳️', match: 'contains' }],
              overlay
            }
          ],
          createdAt: NOW,
          updatedAt: NOW
        }
      ]
    });
  });

  it('is idempotent: migrated settings load unchanged', () => {
    const { settings } = parseSettings({ target: 12 }, NOW);

    const reloaded = parseSettings(JSON.parse(JSON.stringify(settings)), LATER);

    expect(reloaded).toEqual({ settings, migration: 'none' });
  });

  it('replaces damaged documents but keeps readable 0.2 values', () => {
    for (const profiles of [[], 'broken', [{ id: 'x' }], Array(MAX_PROFILES + 1).fill(activeProfile(createDefaultSettings(NOW)))]) {
      const { settings, migration } = parseSettings({ schemaVersion: 2, username: 'streamer', target: 30, profiles }, NOW);

      expect(migration).toBe('replaced-invalid');
      expect(settings.username).toBe('streamer');
      expect(primaryCounter(settings).target).toBe(30);
    }
    expect(parseSettings({ schemaVersion: 3 }, NOW).migration).toBe('replaced-invalid');
    expect(parseSettings(null, NOW)).toEqual({ settings: createDefaultSettings(NOW), migration: 'from-v1' });
  });

  it('falls back to the first profile when the active one is missing', () => {
    const settings = { ...createDefaultSettings(NOW), activeProfileId: 'gone' };

    expect(parseSettings(settings, NOW).settings.activeProfileId).toBe('default');
  });

  it('rejects duplicate profile ids', () => {
    const settings = createDefaultSettings(NOW);
    const document = { ...settings, profiles: [...settings.profiles, ...settings.profiles] };

    expect(parseSettings(document, NOW).migration).toBe('replaced-invalid');
  });
});

describe('parseCounterDefinition', () => {
  it('accepts the red flag counter and polls with two to six options', () => {
    expect(parseCounterDefinition(createRedFlagCounter())).toEqual(createRedFlagCounter());
    expect(parseCounterDefinition(poll(2))).toEqual(poll(2));
    expect(parseCounterDefinition(poll(6))).toEqual(poll(6));
  });

  it.each([
    ['a poll with one option', poll(1)],
    ['a poll with seven options', poll(7)],
    ['a single counter with two options', { ...createRedFlagCounter(), options: poll(2).options }],
    ['an empty name', { ...poll(2), name: '  ' }],
    ['an oversized name', { ...poll(2), name: 'x'.repeat(MAX_NAME_LENGTH + 1) }],
    ['an invalid target', { ...poll(2), target: 0 }],
    ['an invalid id', { ...poll(2), id: 'mit leerzeichen' }],
    ['an option without triggers', { ...poll(2), options: [{ ...poll(2).options[0], triggers: [] }, poll(2).options[1]] }],
    ['duplicate option ids', { ...poll(2), options: [poll(2).options[0], poll(2).options[0]] }],
    ['a missing overlay', { ...poll(2), overlay: undefined }]
  ])('rejects %s', (_name, counter) => {
    expect(parseCounterDefinition(counter)).toBeNull();
  });

  it('rejects triggers that belong to more than one option', () => {
    const counter = poll(2);
    const [first, second] = counter.options as [CounterDefinition['options'][0], CounterDefinition['options'][0]];
    const conflicting = {
      ...counter,
      options: [first, { ...second, triggers: [{ kind: 'text', value: ' WAHL0 ', match: 'contains' }] }]
    };

    expect(parseCounterDefinition(conflicting)).toBeNull();
  });

  it('rejects withdrawal triggers that are also vote triggers', () => {
    const counter = { ...createRedFlagCounter(), withdrawalTriggers: [{ kind: 'emoji', value: '🚩️', match: 'contains' }] };

    expect(parseCounterDefinition(counter)).toBeNull();
  });

  it('keeps a name of exactly the maximum length and trims names', () => {
    const name = 'ä'.repeat(MAX_NAME_LENGTH);

    expect(parseCounterDefinition({ ...poll(2), name: ` ${name} ` })?.name).toBe(name);
  });
});

describe('parseCounterDefinitions', () => {
  it('allows up to four counters with unique ids', () => {
    const counters = Array.from({ length: MAX_COUNTERS }, (_, index) => ({ ...poll(2), id: `poll-${index}` }));

    expect(parseCounterDefinitions(counters)).toHaveLength(MAX_COUNTERS);
    expect(parseCounterDefinitions([...counters, { ...poll(2), id: 'extra' }])).toBeNull();
    expect(parseCounterDefinitions([poll(2), poll(3)])).toBeNull();
    expect(parseCounterDefinitions([])).toBeNull();
  });
});

describe('updatePrimaryCounter', () => {
  it('changes the first counter of the active profile and its timestamp', () => {
    const settings = migrateSettingsV1({ username: '', target: 10, overlay: DEFAULT_OVERLAY_SETTINGS }, NOW);

    const updated = updatePrimaryCounter(settings, (counter) => ({ ...counter, target: 5 }), LATER);

    expect(primaryCounter(updated).target).toBe(5);
    expect(activeProfile(updated).updatedAt).toBe(LATER);
    expect(primaryCounter(settings).target).toBe(10);
  });
});
