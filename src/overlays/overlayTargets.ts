import type { AppState } from '../../shared/appState';
import { canUse, limitFor, type Entitlements } from '../../shared/entitlements';
import type { CounterDefinition, CounterMode } from '../../shared/profiles';
import type { OverlaySettings } from '../../shared/settings';

/** Scope of the combined overlay, as served by the sidecar under `/overlay/all`. */
export const OVERVIEW_TARGET = 'all';

export type OverlayTargetStatus = 'ready' | 'pro-required' | 'paused' | 'service-unavailable';

/** One overlay a streamer can add to OBS or TikTok LIVE Studio. */
export type OverlayTarget = {
  /** The counter id, or `all` for the combined view. */
  id: string;
  kind: 'counter' | 'board';
  label: string;
  mode: CounterMode | null;
  /** The design of a counter; the combined view shows every counter with its own design. */
  overlay: OverlaySettings | null;
  localUrl: string | null;
  publicUrl: string | null;
  available: boolean;
  status: OverlayTargetStatus;
  /** The address of FlagCount 0.2, kept for the first counter so existing OBS sources keep working. */
  classic: boolean;
};

/**
 * Overlays of the running profile: one per stored counter and the combined view. URLs exist only for
 * overlays that run under the current plan while the connection service is up.
 */
export function overlayTargets(
  state: AppState,
  entitlements: Entitlements,
  stored: readonly CounterDefinition[],
  running: readonly CounterDefinition[]
): OverlayTarget[] {
  const base = state.overlayUrl;
  const online = state.counterOverlayUrls ?? {};
  const limit = limitFor(entitlements, 'overlayUrls');

  const counters = stored.map((counter): OverlayTarget => {
    const index = running.findIndex((candidate) => candidate.id === counter.id);
    const classic = index === 0 && counter.mode === 'single';
    const status: OverlayTargetStatus =
      index < 0 ? 'paused' : index >= limit ? 'pro-required' : base === null ? 'service-unavailable' : 'ready';
    const available = status === 'ready';
    return {
      id: counter.id,
      kind: 'counter',
      label: counter.name,
      mode: counter.mode,
      overlay: counter.overlay,
      localUrl: available ? (classic ? base : `${base}/counter/${counter.id}`) : null,
      publicUrl: available ? (classic ? state.publicOverlayUrl : (online[counter.id] ?? null)) : null,
      available,
      status,
      classic
    };
  });

  const boardAllowed = canUse(entitlements, 'parallel-counters');
  const boardStatus: OverlayTargetStatus = !boardAllowed ? 'pro-required' : base === null ? 'service-unavailable' : 'ready';
  const board: OverlayTarget = {
    id: OVERVIEW_TARGET,
    kind: 'board',
    label: 'Gesamtansicht',
    mode: null,
    overlay: null,
    localUrl: boardStatus === 'ready' ? `${base}/all` : null,
    publicUrl: boardStatus === 'ready' ? (online[OVERVIEW_TARGET] ?? null) : null,
    available: boardStatus === 'ready',
    status: boardStatus,
    classic: false
  };

  return [...counters, board];
}

/** Browser source size that fits the overlay without cropping; its background stays transparent. */
export function recommendedSize(target: OverlayTarget): { width: number; height: number } {
  if (target.kind === 'board') return { width: 1280, height: 720 };
  return target.mode === 'poll' ? { width: 600, height: 400 } : { width: 520, height: 200 };
}
