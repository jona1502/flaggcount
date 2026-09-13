import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_SETTINGS, type Settings } from './settings';
import {
  DEFAULT_COUNTER_ID,
  DEFAULT_PROFILE_ID,
  createDefaultCounter,
  migrateSettingsV1,
  parseSettingsDocument
} from './profiles';

const settings: Settings = {
  username: '@creator',
  target: 25,
  overlay: { ...DEFAULT_OVERLAY_SETTINGS, accentColor: '#abcdef' },
  telemetryEnabled: false
};

describe('versioned stream profiles', () => {
  it('migrates the existing free settings into one lossless single counter', () => {
    const migrated = migrateSettingsV1(settings, '2026-09-13T12:00:00.000Z');

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      username: '@creator',
      activeProfileId: DEFAULT_PROFILE_ID,
      profiles: [{ id: DEFAULT_PROFILE_ID, name: 'Standard', counters: [{ id: DEFAULT_COUNTER_ID, target: 25 }] }]
    });
    expect(migrated.profiles[0]?.counters[0]).toEqual(createDefaultCounter(settings));
  });

  it('rejects malformed v2 documents and falls back to migration', () => {
    const parsed = parseSettingsDocument(
      { schemaVersion: 2, username: 'x', telemetryEnabled: true, activeProfileId: 'missing', profiles: [] },
      settings
    );
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.username).toBe('@creator');
    expect(parsed.telemetryEnabled).toBe(false);
    expect(parsed.profiles).toHaveLength(1);
  });

  it('accepts a valid two-option poll without accepting identifying fields', () => {
    const migrated = migrateSettingsV1(settings);
    const poll = {
      ...migrated,
      profiles: [
        {
          ...migrated.profiles[0],
          counters: [
            {
              ...migrated.profiles[0]!.counters[0],
              mode: 'poll',
              options: [
                { id: 'yes', label: 'Ja', triggers: [{ kind: 'text', value: 'ja', match: 'word' }], accentColor: '#00ff00' },
                { id: 'no', label: 'Nein', triggers: [{ kind: 'text', value: 'nein', match: 'word' }], accentColor: '#ff0000' }
              ]
            }
          ]
        }
      ]
    };
    expect(parseSettingsDocument(poll, settings)).toEqual(poll);
    expect(parseSettingsDocument({ ...poll, viewerIds: ['secret'] }, settings)).toEqual(migrateSettingsV1(settings));
  });
});
