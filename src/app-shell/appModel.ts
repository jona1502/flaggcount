import type { AppState } from '../../shared/appState';
import { effectiveCounters, effectiveProfile, entitlementsFor, type Entitlements } from '../../shared/entitlements';
import type { CounterDefinition, StreamProfile } from '../../shared/profiles';

/** Everything the pages derive from the backend state, computed once with the shared entitlement rules. */
export type AppModel = {
  state: AppState;
  entitlements: Entitlements;
  /** The profile that actually runs: after a downgrade that is the first one, not the chosen one. */
  running: StreamProfile;
  /** Stored counters of the running profile the plan lets run right now. */
  runningCounters: CounterDefinition[];
  isPro: boolean;
};

export function createAppModel(state: AppState): AppModel {
  const entitlements = entitlementsFor(state.license.plan, state.license.features);
  const running = effectiveProfile(state.settings, entitlements);
  return {
    state,
    entitlements,
    running,
    runningCounters: effectiveCounters(running.counters, entitlements),
    isPro: state.license.plan === 'pro'
  };
}
