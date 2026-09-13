import { useCallback, useEffect, useRef, useState } from 'react';
import { updaterClient, type AvailableUpdate, type UpdaterClient, type UpdateDownloadEvent } from './updaterClient';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'up-to-date' | 'error';

export type UpdaterController = {
  status: UpdateStatus;
  update: { version: string; notes?: string } | null;
  progress: number | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismiss: () => void;
};

type UseUpdaterOptions = {
  client?: UpdaterClient;
  autoCheck?: boolean;
  autoCheckDelayMs?: number;
};

export function useUpdater({
  client = updaterClient,
  autoCheck = !import.meta.env.DEV,
  autoCheckDelayMs = 3_000
}: UseUpdaterOptions = {}): UpdaterController {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [update, setUpdate] = useState<{ version: string; notes?: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const available = useRef<AvailableUpdate | null>(null);
  const mounted = useRef(true);

  const release = useCallback(() => {
    const current = available.current;
    available.current = null;
    if (current) void current.close().catch(() => undefined);
  }, []);

  const performCheck = useCallback(
    async (silent: boolean): Promise<void> => {
      if (!silent) setStatus('checking');
      setProgress(null);
      try {
        const next = await client.check();
        if (!mounted.current) {
          if (next) void next.close().catch(() => undefined);
          return;
        }
        release();
        available.current = next;
        setUpdate(next ? { version: next.version, notes: next.notes } : null);
        setStatus(next ? 'available' : silent ? 'idle' : 'up-to-date');
      } catch {
        if (mounted.current && !silent) setStatus('error');
      }
    },
    [client, release]
  );

  const checkForUpdates = useCallback(() => performCheck(false), [performCheck]);

  const installUpdate = useCallback(async (): Promise<void> => {
    const current = available.current;
    if (!current) return;
    setStatus('downloading');
    setProgress(0);
    let downloaded = 0;
    let total: number | undefined;
    const onEvent = (event: UpdateDownloadEvent): void => {
      if (!mounted.current) return;
      if (event.event === 'Started') total = event.data.contentLength;
      if (event.event === 'Progress') downloaded += event.data.chunkLength;
      if (event.event === 'Finished') setProgress(100);
      else if (total && total > 0) setProgress(Math.min(99, Math.round((downloaded / total) * 100)));
      else if (event.event === 'Progress') setProgress(null);
    };
    try {
      await current.downloadAndInstall(onEvent);
    } catch {
      if (mounted.current) setStatus('error');
    }
  }, []);

  const dismiss = useCallback(() => {
    release();
    setUpdate(null);
    setProgress(null);
    setStatus('idle');
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    const timeout = autoCheck ? window.setTimeout(() => void performCheck(true), autoCheckDelayMs) : null;
    return () => {
      mounted.current = false;
      if (timeout !== null) window.clearTimeout(timeout);
      release();
    };
  }, [autoCheck, autoCheckDelayMs, performCheck, release]);

  return { status, update, progress, checkForUpdates, installUpdate, dismiss };
}
