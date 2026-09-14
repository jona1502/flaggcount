import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppError, AppState } from '../../shared/appState';
import type { CounterDefinition } from '../../shared/profiles';
import type { OverlaySettings } from '../../shared/settings';
import { toAppError, type FlagCountApi, type Unlisten } from './flagcountApi';

export type FlagCountActions = {
  connect: (username: string) => Promise<void>;
  disconnect: () => Promise<void>;
  addManualVote: (counterId?: string, optionId?: string) => Promise<void>;
  removeManualVote: (counterId?: string, optionId?: string) => Promise<void>;
  /** Without a counter id every round starts over. */
  resetVotes: (counterId?: string) => Promise<void>;
  setTarget: (target: number) => Promise<void>;
  setOverlaySettings: (overlay: OverlaySettings) => Promise<void>;
  setCounterOverlaySettings: (counterId: string, overlay: OverlaySettings) => Promise<void>;
  importOverlayAsset: (kind: 'logo' | 'background', bytes: number[]) => Promise<string>;
  clearHistory: () => Promise<void>;
  exportHistoryCsv: (csv: string) => Promise<string>;
  createProfile: (name: string) => Promise<void>;
  duplicateProfile: (profileId: string) => Promise<void>;
  renameProfile: (profileId: string, name: string) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
  saveCounters: (counters: CounterDefinition[]) => Promise<void>;
  activateLicense: (code: string, replaceInstallationId?: string) => Promise<void>;
  refreshLicense: () => Promise<void>;
  deactivateLicense: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
  openProPage: () => Promise<void>;
};

export type FlagCountController = {
  state: AppState | null;
  error: AppError | null;
  pending: boolean;
  actions: FlagCountActions;
  dismissError: () => void;
};

/** Dashboard state and actions on top of an API: Tauri in the desktop app, the web server in the browser. */
export function useFlagCount(api: FlagCountApi): FlagCountController {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    // An event is always newer than the initial snapshot, so a late snapshot must not overwrite it.
    let receivedEvent = false;
    const unlisteners: Unlisten[] = [];

    const register = (subscription: Promise<Unlisten>): void => {
      subscription.then(
        (unlisten) => {
          if (active) {
            unlisteners.push(unlisten);
          } else {
            unlisten();
          }
        },
        (reason: unknown) => {
          if (active) setError(toAppError(reason));
        }
      );
    };

    register(
      api.onStateChanged((next) => {
        if (!active) return;
        receivedEvent = true;
        setState(next);
      })
    );
    register(
      api.onError((next) => {
        if (active) setError(next);
      })
    );

    api.getState().then(
      (initial) => {
        if (active && !receivedEvent) setState(initial);
      },
      (reason: unknown) => {
        if (active) setError(toAppError(reason));
      }
    );

    return () => {
      active = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [api]);

  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(toAppError(reason));
    } finally {
      setPending(false);
    }
  }, []);

  const actions = useMemo<FlagCountActions>(
    () => ({
      connect: (username) => run(() => api.connect(username)),
      disconnect: () => run(() => api.disconnect()),
      addManualVote: (counterId, optionId) => run(() => api.addManualVote(counterId, optionId)),
      removeManualVote: (counterId, optionId) => run(() => api.removeManualVote(counterId, optionId)),
      resetVotes: (counterId) => run(() => api.resetVotes(counterId)),
      setTarget: (target) => run(() => api.setTarget(target)),
      setOverlaySettings: (overlay) => run(() => api.setOverlaySettings(overlay)),
      setCounterOverlaySettings: (counterId, overlay) => run(() => api.setCounterOverlaySettings(counterId, overlay)),
      importOverlayAsset: (kind, bytes) => api.importOverlayAsset(kind, bytes),
      clearHistory: () => run(() => api.clearHistory()),
      exportHistoryCsv: (csv) => api.exportHistoryCsv(csv),
      createProfile: (name) =>
        run(async () => {
          await api.createProfile(name);
        }),
      duplicateProfile: (profileId) =>
        run(async () => {
          await api.duplicateProfile(profileId);
        }),
      renameProfile: (profileId, name) => run(() => api.renameProfile(profileId, name)),
      deleteProfile: (profileId) => run(() => api.deleteProfile(profileId)),
      switchProfile: (profileId) => run(() => api.switchProfile(profileId)),
      saveCounters: (counters) => run(() => api.saveCounters(counters)),
      activateLicense: (code, replaceInstallationId) => run(() => api.activateLicense(code, replaceInstallationId)),
      refreshLicense: () => run(() => api.refreshLicense()),
      deactivateLicense: () => run(() => api.deactivateLicense()),
      openCustomerPortal: () => run(() => api.openCustomerPortal()),
      openProPage: () => run(() => api.openProPage())
    }),
    [api, run]
  );

  const dismissError = useCallback(() => setError(null), []);

  return { state, error, pending, actions, dismissError };
}
