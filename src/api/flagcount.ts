import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AppError, AppState } from '../../shared/appState';

export const STATE_CHANGED_EVENT = 'state-changed';
export const APP_ERROR_EVENT = 'app-error';

/** The complete, typed surface between React and the Tauri backend. */
export const flagcountApi = {
  getState: (): Promise<AppState> => invoke<AppState>('get_state'),
  connect: (username: string): Promise<void> => invoke('connect', { username }),
  disconnect: (): Promise<void> => invoke('disconnect'),
  resetVotes: (): Promise<void> => invoke('reset_votes'),
  setTarget: (target: number): Promise<void> => invoke('set_target', { target }),

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
