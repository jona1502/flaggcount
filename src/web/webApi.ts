import type { AppError, AppState } from '../../shared/appState';
import type { OverlaySettings } from '../../shared/settings';
import { toAppError, type FlagCountApi } from '../api/flagcount';

type Listener<T> = (value: T) => void;

const stateListeners = new Set<Listener<AppState>>();
const errorListeners = new Set<Listener<AppError>>();
let events: EventSource | null = null;
let lastState: AppState | null = null;

const SERVER_UNAVAILABLE: AppError = { code: 'sidecar-unavailable', message: 'The server is not reachable' };

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

function openEvents(): void {
  if (events) return;
  events = new EventSource('/api/events');
  // The server sends the full state on every (re)connect, which also re-enables the controls.
  events.addEventListener('state', (event) => {
    try {
      publishState(withOverlayUrl(JSON.parse(event.data) as AppState));
    } catch {
      // Ignore malformed updates and keep the last known state.
    }
  });
  events.addEventListener('app-error', (event) => {
    try {
      const error = toAppError(JSON.parse(event.data));
      for (const listener of errorListeners) {
        listener(error);
      }
    } catch {
      // Ignore malformed errors.
    }
  });
  events.addEventListener('error', () => {
    if (lastState?.sidecarRunning) {
      publishState({ ...lastState, sidecarRunning: false });
    }
  });
}

function subscribe<T>(listeners: Set<Listener<T>>, handler: Listener<T>): Promise<() => void> {
  listeners.add(handler);
  openEvents();
  return Promise.resolve(() => {
    listeners.delete(handler);
    if (stateListeners.size === 0 && errorListeners.size === 0 && events) {
      events.close();
      events = null;
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
  resetVotes: () => post('/api/reset'),
  setTarget: (target: number) => post('/api/target', { target }),
  setOverlaySettings: (overlay: OverlaySettings) => post('/api/overlay', { overlay }),
  copyText: (text: string) => navigator.clipboard.writeText(text),

  onStateChanged: (handler) => subscribe(stateListeners, handler),
  onError: (handler) => subscribe(errorListeners, handler)
};
