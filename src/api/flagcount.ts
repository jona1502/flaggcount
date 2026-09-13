import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { AppError, AppState } from '../../shared/appState';
import type { OverlaySettings } from '../../shared/settings';

export const STATE_CHANGED_EVENT = 'state-changed';
export const APP_ERROR_EVENT = 'app-error';

/** The complete, typed surface between React and the Tauri backend. */
export const flagcountApi = {
  getState: (): Promise<AppState> => invoke<AppState>('get_state'),
  connect: (username: string): Promise<void> => invoke('connect', { username }),
  disconnect: (): Promise<void> => invoke('disconnect'),
  addManualVote: (): Promise<void> => invoke('add_manual_vote'),
  removeManualVote: (): Promise<void> => invoke('remove_manual_vote'),
  resetVotes: (): Promise<void> => invoke('reset_votes'),
  setTarget: (target: number): Promise<void> => invoke('set_target', { target }),
  setOverlaySettings: (overlay: OverlaySettings): Promise<void> => invoke('set_overlay_settings', { overlay }),
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
