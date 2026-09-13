import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';

export type UpdateDownloadEvent = DownloadEvent;

export type AvailableUpdate = {
  version: string;
  notes?: string;
  downloadAndInstall: (onEvent: (event: UpdateDownloadEvent) => void) => Promise<void>;
  close: () => Promise<void>;
};

export type UpdaterClient = {
  check: () => Promise<AvailableUpdate | null>;
};

export const updaterClient: UpdaterClient = {
  async check() {
    const update = await check({ timeout: 15_000 });
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body,
      downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
      close: () => update.close()
    };
  }
};
