import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';
import { OVERLAY_CSP, OVERLAY_CSS, OVERLAY_SCRIPT, renderOverlayPage } from '../overlay/overlayAssets';
import { keepAlive, openEventStream, send, sendJson, writeEvent } from './http';

export const HEARTBEAT_MS = 15_000;

export type OverlaySource = {
  getVotes: () => VoteSnapshot;
  subscribeVotes: (listener: (votes: VoteSnapshot) => void) => () => void;
  getOverlaySettings?: () => OverlaySettings;
  subscribeOverlaySettings?: (listener: (overlay: OverlaySettings) => void) => () => void;
};

export type OverlayHandler = (pathname: string, request: IncomingMessage, response: ServerResponse) => void;

export function isOverlayPath(pathname: string): boolean {
  return pathname === '/overlay' || pathname.startsWith('/overlay/');
}

/** Serves the OBS overlay page, its assets and the live event stream. Used by the local and the web server. */
export function createOverlayHandler(source: OverlaySource, heartbeatMs = HEARTBEAT_MS): OverlayHandler {
  // Called through `source` so class instances keep their `this`.
  const getOverlaySettings = (): OverlaySettings => source.getOverlaySettings?.() ?? DEFAULT_OVERLAY_SETTINGS;

  const streamOverlay = (request: IncomingMessage, response: ServerResponse): void => {
    openEventStream(response);
    const pushVotes = (votes: VoteSnapshot): void => writeEvent(response, 'votes', votes);
    const pushSettings = (overlay: OverlaySettings): void => writeEvent(response, 'settings', overlay);

    pushSettings(getOverlaySettings());
    pushVotes(source.getVotes());
    const unsubscribeVotes = source.subscribeVotes(pushVotes);
    const unsubscribeSettings = source.subscribeOverlaySettings?.(pushSettings);
    const stopHeartbeat = keepAlive(response, heartbeatMs);

    request.on('close', () => {
      stopHeartbeat();
      unsubscribeVotes();
      unsubscribeSettings?.();
    });
  };

  return (pathname, request, response) => {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    switch (pathname) {
      case '/overlay':
        send(
          response,
          200,
          'text/html; charset=utf-8',
          renderOverlayPage(source.getVotes(), getOverlaySettings()),
          { 'Content-Security-Policy': OVERLAY_CSP }
        );
        return;
      case '/overlay/overlay.css':
        send(response, 200, 'text/css; charset=utf-8', OVERLAY_CSS);
        return;
      case '/overlay/overlay.js':
        send(response, 200, 'text/javascript; charset=utf-8', OVERLAY_SCRIPT);
        return;
      case '/overlay/events':
        streamOverlay(request, response);
        return;
      default:
        sendJson(response, 404, { error: 'not-found' });
    }
  };
}
