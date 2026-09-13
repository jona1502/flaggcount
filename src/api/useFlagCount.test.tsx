// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppError, AppState } from '../../shared/appState';
import { FREE_LICENSE_STATE } from '../../shared/licensing';
import { migrateSettingsV1 } from '../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../shared/settings';
import type { FlagCountApi } from './flagcount';
import { useFlagCount } from './useFlagCount';

afterEach(cleanup);

const initialState: AppState = {
  sidecarRunning: true,
  connection: { status: 'disconnected', username: null },
  votes: { count: 0, target: 100, roundId: 'r1', targetReached: false },
  overlayUrl: 'http://127.0.0.1:3847/overlay',
  counters: [],
  license: FREE_LICENSE_STATE,
  publicOverlayUrl: null,
  settings: migrateSettingsV1({ username: '', target: 100, overlay: { ...DEFAULT_OVERLAY_SETTINGS, showBackground: true, showProgress: true } }, '2026-01-01T00:00:00.000Z')
};

const connectedState: AppState = {
  ...initialState,
  connection: { status: 'connected', username: 'streamer' },
  votes: { ...initialState.votes, count: 3 }
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

function createFakeApi() {
  let stateHandler: ((state: AppState) => void) | undefined;
  let errorHandler: ((error: AppError) => void) | undefined;
  const unlistenState = vi.fn();
  const unlistenError = vi.fn();

  const api = {
    getState: vi.fn(async () => initialState),
    connect: vi.fn(async (_username: string) => undefined),
    disconnect: vi.fn(async () => undefined),
    addManualVote: vi.fn(async () => undefined),
    removeManualVote: vi.fn(async () => undefined),
    resetVotes: vi.fn(async () => undefined),
    setTarget: vi.fn(async (_target: number) => undefined),
    setOverlaySettings: vi.fn(async (_overlay: OverlaySettings) => undefined),
    activateLicense: vi.fn(async (_code: string, _replace?: string) => undefined),
    refreshLicense: vi.fn(async () => undefined),
    deactivateLicense: vi.fn(async () => undefined),
    openCustomerPortal: vi.fn(async () => undefined),
    openProPage: vi.fn(async () => undefined),
    createProfile: vi.fn(async (_name: string) => 'p-1'),
    duplicateProfile: vi.fn(async (_profileId: string) => 'p-2'),
    renameProfile: vi.fn(async (_profileId: string, _name: string) => undefined),
    deleteProfile: vi.fn(async (_profileId: string) => undefined),
    switchProfile: vi.fn(async (_profileId: string) => undefined),
    copyText: vi.fn(async (_text: string) => undefined),
    onStateChanged: vi.fn(async (handler: (state: AppState) => void): Promise<() => void> => {
      stateHandler = handler;
      return unlistenState;
    }),
    onError: vi.fn(async (handler: (error: AppError) => void): Promise<() => void> => {
      errorHandler = handler;
      return unlistenError;
    })
  } satisfies FlagCountApi;

  return {
    api,
    unlistenState,
    unlistenError,
    emitState: (state: AppState) => act(() => stateHandler?.(state)),
    emitError: (error: AppError) => act(() => errorHandler?.(error))
  };
}

describe('useFlagCount', () => {
  it('loads the initial state', async () => {
    const { api } = createFakeApi();

    const { result } = renderHook(() => useFlagCount(api));

    await waitFor(() => expect(result.current.state).toEqual(initialState));
    expect(result.current.error).toBeNull();
  });

  it('applies state events immediately', async () => {
    const { api, emitState } = createFakeApi();
    const { result } = renderHook(() => useFlagCount(api));
    await waitFor(() => expect(api.onStateChanged).toHaveBeenCalled());

    emitState(connectedState);

    expect(result.current.state).toEqual(connectedState);
  });

  it('does not overwrite a newer event with a late initial snapshot', async () => {
    const { api, emitState } = createFakeApi();
    const snapshot = deferred<AppState>();
    api.getState.mockReturnValueOnce(snapshot.promise);
    const { result } = renderHook(() => useFlagCount(api));
    await waitFor(() => expect(api.onStateChanged).toHaveBeenCalled());

    emitState(connectedState);
    await act(async () => snapshot.resolve(initialState));

    expect(result.current.state).toEqual(connectedState);
  });

  it('shows errors reported by the backend', async () => {
    const { api, emitError } = createFakeApi();
    const { result } = renderHook(() => useFlagCount(api));
    await waitFor(() => expect(api.onError).toHaveBeenCalled());

    emitError({ code: 'user-offline', message: 'offline' });

    expect(result.current.error).toEqual({ code: 'user-offline', message: 'offline' });
  });

  it('captures failed actions and clears the error on dismiss', async () => {
    const { api } = createFakeApi();
    api.setTarget.mockRejectedValueOnce({ code: 'invalid-target', message: 'bad' });
    const { result } = renderHook(() => useFlagCount(api));

    await act(() => result.current.actions.setTarget(0));

    expect(api.setTarget).toHaveBeenCalledWith(0);
    expect(result.current.error).toEqual({ code: 'invalid-target', message: 'bad' });
    expect(result.current.pending).toBe(false);

    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });

  it('forwards every action to the backend', async () => {
    const { api } = createFakeApi();
    const { result } = renderHook(() => useFlagCount(api));

    await act(async () => {
      await result.current.actions.connect('streamer');
      await result.current.actions.disconnect();
      await result.current.actions.addManualVote();
      await result.current.actions.removeManualVote();
      await result.current.actions.resetVotes();
    });

    expect(api.connect).toHaveBeenCalledWith('streamer');
    expect(api.disconnect).toHaveBeenCalled();
    expect(api.addManualVote).toHaveBeenCalled();
    expect(api.removeManualVote).toHaveBeenCalled();
    expect(api.resetVotes).toHaveBeenCalled();
  });

  it('unsubscribes from events on unmount', async () => {
    const { api, unlistenState, unlistenError } = createFakeApi();
    const { unmount } = renderHook(() => useFlagCount(api));
    await waitFor(() => expect(api.onError).toHaveBeenCalled());
    await act(async () => undefined);

    unmount();

    expect(unlistenState).toHaveBeenCalledTimes(1);
    expect(unlistenError).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes listeners that finish registering after unmount', async () => {
    const { api } = createFakeApi();
    const registration = deferred<() => void>();
    const lateUnlisten = vi.fn();
    api.onStateChanged.mockReturnValueOnce(registration.promise);
    const { unmount } = renderHook(() => useFlagCount(api));

    unmount();
    await act(async () => registration.resolve(lateUnlisten));

    expect(lateUnlisten).toHaveBeenCalledTimes(1);
  });
});
