import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { AppError, AppState } from '../../shared/appState';
import type { CounterDefinition } from '../../shared/profiles';
import type { OverlaySettings } from '../../shared/settings';

export const STATE_CHANGED_EVENT = 'state-changed';
export const APP_ERROR_EVENT = 'app-error';

/** The complete, typed surface between React and the Tauri backend. */
export const flagcountApi = {
  getState: (): Promise<AppState> => invoke<AppState>('get_state'),
  connect: (username: string): Promise<void> => invoke('connect', { username }),
  disconnect: (): Promise<void> => invoke('disconnect'),
  // Without ids the first counter is meant, exactly as before parallel counters existed.
  addManualVote: (counterId?: string, optionId?: string): Promise<void> =>
    counterId === undefined ? invoke('add_manual_vote') : invoke('add_manual_vote', { counterId, optionId: optionId ?? null }),
  removeManualVote: (counterId?: string, optionId?: string): Promise<void> =>
    counterId === undefined
      ? invoke('remove_manual_vote')
      : invoke('remove_manual_vote', { counterId, optionId: optionId ?? null }),
  resetVotes: (counterId?: string): Promise<void> =>
    counterId === undefined ? invoke('reset_votes') : invoke('reset_votes', { counterId }),
  setTarget: (target: number): Promise<void> => invoke('set_target', { target }),
  setOverlaySettings: (overlay: OverlaySettings): Promise<void> => invoke('set_overlay_settings', { overlay }),
  importOverlayAsset: (kind: 'logo' | 'background', bytes: number[]): Promise<string> => invoke<string>('import_overlay_asset', { kind, bytes }),
  clearHistory: (): Promise<void> => invoke('clear_history'),
  exportHistoryCsv: (csv: string): Promise<string> => invoke<string>('export_history_csv', { csv }),
  createProfile: (name: string): Promise<string> => invoke<string>('create_profile', { name }),
  duplicateProfile: (profileId: string): Promise<string> => invoke<string>('duplicate_profile', { profileId }),
  renameProfile: (profileId: string, name: string): Promise<void> => invoke('rename_profile', { profileId, name }),
  deleteProfile: (profileId: string): Promise<void> => invoke('delete_profile', { profileId }),
  switchProfile: (profileId: string): Promise<void> => invoke('switch_profile', { profileId }),
  saveCounters: (counters: CounterDefinition[]): Promise<void> => invoke('save_counters', { counters }),
  activateLicense: (code: string, replaceInstallationId?: string): Promise<void> =>
    invoke('activate_license', { code, replaceInstallationId: replaceInstallationId ?? null }),
  refreshLicense: (): Promise<void> => invoke('refresh_license'),
  deactivateLicense: (): Promise<void> => invoke('deactivate_license'),
  openCustomerPortal: (): Promise<void> => invoke('open_customer_portal'),
  openProPage: (): Promise<void> => invoke('open_pro_page'),
  copyText: (text: string): Promise<void> => writeText(text),

  onStateChanged: (handler: (state: AppState) => void): Promise<UnlistenFn> =>
    listen<AppState>(STATE_CHANGED_EVENT, (event) => handler(event.payload)),
  onError: (handler: (error: AppError) => void): Promise<UnlistenFn> =>
    listen<AppError>(APP_ERROR_EVENT, (event) => handler(event.payload))
};

export type FlagCountApi = typeof flagcountApi;

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['code'] === 'string' && typeof record['message'] === 'string';
}

/** Normalizes rejected command promises into an `AppError`. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return { code: 'unknown', message: error.message };
  }
  return { code: 'unknown', message: typeof error === 'string' ? error : 'Unknown error' };
}
