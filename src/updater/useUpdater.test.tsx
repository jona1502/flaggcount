// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvailableUpdate, UpdaterClient, UpdateDownloadEvent } from './updaterClient';
import { useUpdater } from './useUpdater';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function createUpdate(version = '0.2.0') {
  let listener: ((event: UpdateDownloadEvent) => void) | undefined;
  const update: AvailableUpdate = {
    version,
    notes: 'Neue Funktionen',
    downloadAndInstall: vi.fn(async (onEvent) => {
      listener = onEvent;
    }),
    close: vi.fn(async () => undefined)
  };
  return { update, emit: (event: UpdateDownloadEvent) => act(() => listener?.(event)) };
}

describe('useUpdater', () => {
  it('reports an available update and installs it with progress', async () => {
    const { update, emit } = createUpdate();
    const client: UpdaterClient = { check: vi.fn(async () => update) };
    const { result } = renderHook(() => useUpdater({ client, autoCheck: false }));

    await act(() => result.current.checkForUpdates());
    expect(result.current.status).toBe('available');
    expect(result.current.update).toEqual({ version: '0.2.0', notes: 'Neue Funktionen' });

    await act(() => result.current.installUpdate());
    emit({ event: 'Started', data: { contentLength: 100 } });
    emit({ event: 'Progress', data: { chunkLength: 40 } });
    expect(result.current.progress).toBe(40);
    emit({ event: 'Finished' });
    expect(result.current.progress).toBe(100);
  });

  it('reports that a manual check found no update', async () => {
    const client: UpdaterClient = { check: vi.fn(async () => null) };
    const { result } = renderHook(() => useUpdater({ client, autoCheck: false }));

    await act(() => result.current.checkForUpdates());

    expect(result.current.status).toBe('up-to-date');
  });

  it('checks automatically after the configured delay without showing network errors', async () => {
    vi.useFakeTimers();
    const client: UpdaterClient = { check: vi.fn(async () => Promise.reject(new Error('offline'))) };
    const { result } = renderHook(() => useUpdater({ client, autoCheck: true, autoCheckDelayMs: 3000 }));

    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(client.check).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  it('releases a deferred update when the user chooses later', async () => {
    const { update } = createUpdate();
    const client: UpdaterClient = { check: vi.fn(async () => update) };
    const { result } = renderHook(() => useUpdater({ client, autoCheck: false }));
    await act(() => result.current.checkForUpdates());

    act(() => result.current.dismiss());

    expect(update.close).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });
});
