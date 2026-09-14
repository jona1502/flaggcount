import { describe, expect, it } from 'vitest';
import { createAppModel } from '../app-shell/appModel';
import { LICENSES, createAppState } from '../test/appStateFixtures';
import { setupSteps, type SetupStepId } from './setupSteps';

const openSteps = (...args: Parameters<typeof createAppState>): SetupStepId[] =>
  setupSteps(createAppModel(createAppState(...args)))
    .filter((step) => !step.done)
    .map((step) => step.id);

describe('setupSteps', () => {
  it('only asks a fresh Free installation to connect to TikTok', () => {
    expect(openSteps()).toEqual(['connection']);
  });

  it('marks the connection as done and names the stream', () => {
    const steps = setupSteps(createAppModel(createAppState({ connection: { status: 'connected', username: 'streamer' } })));

    expect(steps.find((step) => step.id === 'connection')).toMatchObject({ done: true, detail: 'Verbunden mit @streamer' });
  });

  it('waits for the overlay URL until the connection service runs', () => {
    expect(openSteps({ overlayUrl: null })).toContain('overlay');
  });

  it.each([
    ['an active Pro license', LICENSES.pro, true],
    ['Pro in the offline grace period', LICENSES.offline, false],
    ['an expired license', LICENSES.expired, false],
    ['Free without a license', LICENSES.free, true]
  ])('treats %s as current: %s', (_name, license, current) => {
    expect(openSteps({ license }).includes('license')).toBe(!current);
  });

  it('leads every open step to the page that completes it', () => {
    const steps = setupSteps(createAppModel(createAppState({ overlayUrl: null, license: LICENSES.expired })));

    expect(Object.fromEntries(steps.map((step) => [step.id, step.action.route]))).toEqual({
      connection: { page: 'live' },
      profile: { page: 'profiles' },
      elements: { page: 'counters', create: true },
      overlay: { page: 'overlays' },
      license: { page: 'license' }
    });
  });
});
