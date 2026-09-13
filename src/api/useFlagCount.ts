import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { AppError, AppState } from '../../shared/appState';
import type { OverlaySettings } from '../../shared/settings';
import { flagcountApi, toAppError, type FlagCountApi } from './flagcount';

export type FlagCountActions = {
  connect: (username: string) => Promise<void>;
  disconnect: () => Promise<void>;
  addManualVote: () => Promise<void>;
  removeManualVote: () => Promise<void>;
  resetVotes: () => Promise<void>;
  setTarget: (target: number) => Promise<void>;
  setOverlaySettings: (overlay: OverlaySettings) => Promise<void>;
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

export function useFlagCount(api: FlagCountApi = flagcountApi): FlagCountController {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    // An event is always newer than the initial snapshot, so a late snapshot must not overwrite it.
    let receivedEvent = false;
    const unlisteners: UnlistenFn[] = [];

    const register = (subscription: Promise<UnlistenFn>): void => {
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
      addManualVote: () => run(() => api.addManualVote()),
      removeManualVote: () => run(() => api.removeManualVote()),
      resetVotes: () => run(() => api.resetVotes()),
      setTarget: (target) => run(() => api.setTarget(target)),
      setOverlaySettings: (overlay) => run(() => api.setOverlaySettings(overlay)),
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
