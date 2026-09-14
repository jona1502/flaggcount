import type { AppError, AppState } from '../../shared/appState';
import type { OverlaySettings } from '../../shared/settings';
import { toAppError, type FlagCountApi } from '../api/flagcountApi';
import { fetchSession } from './webAuth';

type Listener<T> = (value: T) => void;

const stateListeners = new Set<Listener<AppState>>();
const errorListeners = new Set<Listener<AppError>>();
const unauthorizedListeners = new Set<() => void>();
let events: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let lastState: AppState | null = null;

const STREAM_RETRY_MS = 3000;
const SERVER_UNAVAILABLE: AppError = { code: 'sidecar-unavailable', message: 'The server is not reachable' };
const SESSION_EXPIRED: AppError = { code: 'unknown', message: 'The session has expired' };
const DESKTOP_ONLY: AppError = { code: 'unknown', message: 'FlagCount Pro is managed in the desktop app' };

/** Notifies when the server no longer accepts the session, e.g. after it expired or the password changed. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedListeners.add(handler);
  return () => {
    unauthorizedListeners.delete(handler);
  };
}

function notifyUnauthorized(): void {
  for (const listener of unauthorizedListeners) {
    listener();
  }
}

const hasListeners = (): boolean => stateListeners.size > 0 || errorListeners.size > 0;

/** The server sits behind a proxy; the browser knows the public address of the overlay. */
function withOverlayUrl(state: AppState): AppState {
  return { ...state, overlayUrl: new URL('/overlay', window.location.origin).href };
}

function publishState(state: AppState): void {
  lastState = state;
  for (const listener of stateListeners) {
    listener(state);
  }
}

/**
 * The browser gives up on a stream the server answered with an error, e.g. an expired session or a
 * proxy error during a deploy. Check the session, then either ask for a new login or reconnect.
 */
function retryStream(source: EventSource): void {
  source.close();
  if (events === source) events = null;
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!hasListeners()) return;
    fetchSession().then(
      (signedIn) => {
        if (!hasListeners()) return;
        if (signedIn) openEvents();
        else notifyUnauthorized();
      },
      () => {
        if (hasListeners()) openEvents();
      }
    );
  }, STREAM_RETRY_MS);
}

function openEvents(): void {
  if (events) return;
  const source = new EventSource('/api/events');
  events = source;
  // The server sends the full state on every (re)connect, which also re-enables the controls.
  source.addEventListener('state', (event) => {
    try {
      publishState(withOverlayUrl(JSON.parse(event.data) as AppState));
    } catch {
      // Ignore malformed updates and keep the last known state.
    }
  });
  source.addEventListener('app-error', (event) => {
    try {
      const error = toAppError(JSON.parse(event.data));
      for (const listener of errorListeners) {
        listener(error);
      }
    } catch {
      // Ignore malformed errors.
    }
  });
  source.addEventListener('error', () => {
    if (lastState?.sidecarRunning) {
      publishState({ ...lastState, sidecarRunning: false });
    }
    if (source.readyState === EventSource.CLOSED) {
      retryStream(source);
    }
  });
}

function subscribe<T>(listeners: Set<Listener<T>>, handler: Listener<T>): Promise<() => void> {
  listeners.add(handler);
  openEvents();
  return Promise.resolve(() => {
    listeners.delete(handler);
    if (hasListeners()) return;
    events?.close();
    events = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  });
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw SERVER_UNAVAILABLE;
  }
  if (response.status === 401) {
    notifyUnauthorized();
    throw SESSION_EXPIRED;
  }
  if (!response.ok) {
    throw toAppError(await response.json().catch(() => `HTTP ${response.status}`));
  }
  return response;
}

async function post(path: string, body: unknown = {}): Promise<void> {
  await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/** Browser implementation of the dashboard API, backed by the web server instead of Tauri. */
export const webApi: FlagCountApi = {
  getState: async () => withOverlayUrl((await (await request('/api/state')).json()) as AppState),
  connect: (username: string) => post('/api/connect', { username }),
  disconnect: () => post('/api/disconnect'),
  startTwitchAuth: () => Promise.reject({ code: 'provider-not-configured', message: 'Twitch ist derzeit nur in der Desktop-App verfügbar.' }),
  disconnectTwitchAccount: () => Promise.resolve(),
  addManualVote: () => post('/api/manual-vote'),
  removeManualVote: () => post('/api/manual-vote/remove'),
  resetVotes: () => post('/api/reset'),
  setTarget: (target: number) => post('/api/target', { target }),
  setOverlaySettings: (overlay: OverlaySettings) => post('/api/overlay', { overlay }),
  // The web server designs the first counter only; overlays per counter are designed in the desktop app.
  setCounterOverlaySettings: () => Promise.reject(DESKTOP_ONLY),
  createOverlayView: () => Promise.reject(DESKTOP_ONLY),
  updateOverlayView: () => Promise.reject(DESKTOP_ONLY),
  deleteOverlayView: () => Promise.reject(DESKTOP_ONLY),
  duplicateOverlayView: () => Promise.reject(DESKTOP_ONLY),
  importOverlayAsset: () => Promise.reject(DESKTOP_ONLY),
  clearHistory: () => Promise.reject(DESKTOP_ONLY),
  exportHistoryCsv: () => Promise.reject(DESKTOP_ONLY),
  // Profiles are managed in the desktop app; the web version runs a single profile.
  createProfile: () => Promise.reject(DESKTOP_ONLY),
  duplicateProfile: () => Promise.reject(DESKTOP_ONLY),
  renameProfile: () => Promise.reject(DESKTOP_ONLY),
  deleteProfile: () => Promise.reject(DESKTOP_ONLY),
  switchProfile: () => Promise.reject(DESKTOP_ONLY),
  saveCounters: () => Promise.reject(DESKTOP_ONLY),
  // FlagCount Pro is managed in the desktop app.
  activateLicense: () => Promise.reject(DESKTOP_ONLY),
  refreshLicense: () => Promise.reject(DESKTOP_ONLY),
  deactivateLicense: () => Promise.reject(DESKTOP_ONLY),
  openCustomerPortal: () => Promise.reject(DESKTOP_ONLY),
  openProPage: async () => {
    window.open('/pro', '_blank', 'noopener');
  },
  copyText: (text: string) => navigator.clipboard.writeText(text),

  onStateChanged: (handler) => subscribe(stateListeners, handler),
  onError: (handler) => subscribe(errorListeners, handler)
};
