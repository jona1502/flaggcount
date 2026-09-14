import { describe, expect, it } from 'vitest';
import { FREE_ENTITLEMENTS, PRO_ENTITLEMENTS } from '../../shared/entitlements';
import { createRedFlagCounter } from '../../shared/profiles';
import { OVERLAY_URL, PUBLIC_OVERLAY_URL, createAppState, teamPoll } from '../test/appStateFixtures';
import { overlayTargets, recommendedSize } from './overlayTargets';

const flags = createRedFlagCounter(10);
const teams = teamPoll();

describe('overlayTargets', () => {
  it('keeps the classic URLs for the first counter and gives every other counter and the overview its own', () => {
    const state = createAppState({
      publicOverlayUrl: PUBLIC_OVERLAY_URL,
      counterOverlayUrls: { 'red-flags': 'https://overlay.example.test/c/red', teams: 'https://overlay.example.test/c/teams', all: 'https://overlay.example.test/c/all' }
    });

    const targets = overlayTargets(state, PRO_ENTITLEMENTS, [flags, teams], [flags, teams]);

    expect(targets.map(({ id, kind, localUrl, publicUrl, status, classic }) => ({ id, kind, localUrl, publicUrl, status, classic }))).toEqual([
      { id: 'red-flags', kind: 'counter', localUrl: OVERLAY_URL, publicUrl: PUBLIC_OVERLAY_URL, status: 'ready', classic: true },
      { id: 'teams', kind: 'counter', localUrl: `${OVERLAY_URL}/counter/teams`, publicUrl: 'https://overlay.example.test/c/teams', status: 'ready', classic: false },
      { id: 'all', kind: 'board', localUrl: `${OVERLAY_URL}/all`, publicUrl: 'https://overlay.example.test/c/all', status: 'ready', classic: false }
    ]);
    expect(targets[1]?.overlay).toBe(teams.overlay);
    expect(targets[2]?.overlay).toBeNull();
  });

  it('uses the counter URL for a poll in first place, because the classic overlay only shows one count', () => {
    const [target] = overlayTargets(createAppState(), PRO_ENTITLEMENTS, [teams], [teams]);

    expect(target).toMatchObject({ localUrl: `${OVERLAY_URL}/counter/teams`, publicUrl: null, classic: false });
  });

  it('keeps overlays the plan does not cover visible without URLs', () => {
    const targets = overlayTargets(createAppState(), FREE_ENTITLEMENTS, [flags, teams], [flags]);

    expect(targets.map(({ id, status, available, localUrl }) => ({ id, status, available, localUrl }))).toEqual([
      { id: 'red-flags', status: 'ready', available: true, localUrl: OVERLAY_URL },
      { id: 'teams', status: 'paused', available: false, localUrl: null },
      { id: 'all', status: 'pro-required', available: false, localUrl: null }
    ]);
  });

  it('waits for the connection service before offering URLs', () => {
    const targets = overlayTargets(createAppState({ overlayUrl: null }), PRO_ENTITLEMENTS, [flags], [flags]);

    expect(targets.every((target) => target.status === 'service-unavailable' && target.localUrl === null)).toBe(true);
  });

  it('recommends a browser source size per kind of overlay', () => {
    const [single, poll, board] = overlayTargets(createAppState(), PRO_ENTITLEMENTS, [flags, teams], [flags, teams]);

    expect([single, poll, board].map((target) => recommendedSize(target!))).toEqual([
      { width: 520, height: 200 },
      { width: 600, height: 400 },
      { width: 1280, height: 720 }
    ]);
  });
});
