import type { AppError, AppState } from '../../shared/appState';
import type { CounterDefinition } from '../../shared/profiles';
import type { OverlaySettings } from '../../shared/settings';

/** Stops a subscription. */
export type Unlisten = () => void;

/**
 * The complete, typed surface between the dashboard and its backend. The desktop app implements it with Tauri
 * (`flagcount.ts`), the browser dashboard with the web server (`src/web/webApi.ts`). This module imports
 * neither, so the browser build contains no Tauri code.
 */
export type FlagCountApi = {
  getState: () => Promise<AppState>;
  connect: (username: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Without ids the first counter is meant, exactly as before parallel counters existed. */
  addManualVote: (counterId?: string, optionId?: string) => Promise<void>;
  removeManualVote: (counterId?: string, optionId?: string) => Promise<void>;
  resetVotes: (counterId?: string) => Promise<void>;
  setTarget: (target: number) => Promise<void>;
  setOverlaySettings: (overlay: OverlaySettings) => Promise<void>;
  importOverlayAsset: (kind: 'logo' | 'background', bytes: number[]) => Promise<string>;
  clearHistory: () => Promise<void>;
  exportHistoryCsv: (csv: string) => Promise<string>;
  createProfile: (name: string) => Promise<string>;
  duplicateProfile: (profileId: string) => Promise<string>;
  renameProfile: (profileId: string, name: string) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
  saveCounters: (counters: CounterDefinition[]) => Promise<void>;
  activateLicense: (code: string, replaceInstallationId?: string) => Promise<void>;
  refreshLicense: () => Promise<void>;
  deactivateLicense: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
  openProPage: () => Promise<void>;
  copyText: (text: string) => Promise<void>;
  onStateChanged: (handler: (state: AppState) => void) => Promise<Unlisten>;
  onError: (handler: (error: AppError) => void) => Promise<Unlisten>;
};

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
