import type { IncomingMessage, ServerResponse } from 'node:http';
import { OVERVIEW_SCOPE, isBoardScope, type BoardAccess } from '../../../shared/overlayBoard';
import { LIVE_SCOPE } from '../../../shared/profiles';
import { DEFAULT_OVERLAY_SETTINGS, type OverlaySettings } from '../../../shared/settings';
import type { VoteSnapshot } from '../../../shared/voting';
import { BOARD_CSS, BOARD_SCRIPT, renderBoardPage, renderOverlayNotice } from '../overlay/boardAssets';
import { OVERLAY_CSP, OVERLAY_CSS, OVERLAY_SCRIPT, renderOverlayPage } from '../overlay/overlayAssets';
import { keepAlive, openEventStream, send, sendJson, writeEvent } from './http';

export const HEARTBEAT_MS = 15_000;

export type OverlaySource = {
  getVotes: () => VoteSnapshot;
  subscribeVotes: (listener: (votes: VoteSnapshot) => void) => () => void;
  getOverlaySettings?: () => OverlaySettings;
  subscribeOverlaySettings?: (listener: (overlay: OverlaySettings) => void) => () => void;
  /** Overlays per counter and the overview; without them only the classic overlay exists. */
  getBoard?: (scope: string) => BoardAccess;
  subscribeBoard?: (listener: () => void) => () => void;
};

export type OverlayHandler = (pathname: string, request: IncomingMessage, response: ServerResponse) => void;

const BOARD_PATH = /^\/overlay\/(?:counter\/([^/]+)|view\/([^/]+)|(all|live))(\/events)?$/;

export function isOverlayPath(pathname: string): boolean {
  return pathname === '/overlay' || pathname.startsWith('/overlay/');
}

export function boardOverlayPath(scope: string): string {
  return scope === OVERVIEW_SCOPE || scope === LIVE_SCOPE ? `/overlay/${scope}` : scope.startsWith('v-') ? `/overlay/view/${scope}` : `/overlay/counter/${scope}`;
}

/** Serves the OBS overlay pages, their assets and the live event streams. Used by the local and the web server. */
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

  const serveBoard = (scope: string, events: boolean, request: IncomingMessage, response: ServerResponse): void => {
    if (!source.getBoard || !isBoardScope(scope)) {
      sendJson(response, 404, { error: 'not-found' });
      return;
    }

    if (!events) {
      const access = source.getBoard(scope);
      const headers = { 'Content-Security-Policy': OVERLAY_CSP };
      switch (access.status) {
        case 'ok':
          send(
            response,
            200,
            'text/html; charset=utf-8',
            renderBoardPage(access.counters, { eventsUrl: `${boardOverlayPath(scope)}/events`, scope, layout: access.layout }),
            headers
          );
          return;
        case 'pro-required':
          send(response, 403, 'text/html; charset=utf-8', renderOverlayNotice('Dieses Overlay gehört zu Audience Live Pro.'), headers);
          return;
        case 'not-found':
          send(response, 404, 'text/html; charset=utf-8', renderOverlayNotice('Diesen Zähler gibt es im laufenden Profil nicht.'), headers);
          return;
      }
    }

    openEventStream(response);
    const push = (): void => {
      const access = source.getBoard?.(scope) ?? { status: 'not-found' };
      writeEvent(response, 'board', { status: access.status, counters: access.status === 'ok' ? access.counters : [], layout: access.status === 'ok' ? access.layout : undefined });
    };
    push();
    const unsubscribe = source.subscribeBoard?.(push);
    const stopHeartbeat = keepAlive(response, heartbeatMs);
    request.on('close', () => {
      stopHeartbeat();
      unsubscribe?.();
    });
  };

  return (pathname, request, response) => {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      sendJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    const board = BOARD_PATH.exec(pathname);
    if (board) {
      serveBoard(board[3] ?? board[2] ?? board[1] ?? '', Boolean(board[4]), request, response);
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
      case '/overlay/preview':
        // An empty board the app fills with unsaved scenes via postMessage; it serves no data itself.
        send(response, 200, 'text/html; charset=utf-8', renderBoardPage([], { scope: 'preview', preview: true }), {
          'Content-Security-Policy': OVERLAY_CSP
        });
        return;
      case '/overlay/overlay.css':
        send(response, 200, 'text/css; charset=utf-8', OVERLAY_CSS);
        return;
      case '/overlay/overlay.js':
        send(response, 200, 'text/javascript; charset=utf-8', OVERLAY_SCRIPT);
        return;
      case '/overlay/board.css':
        send(response, 200, 'text/css; charset=utf-8', BOARD_CSS);
        return;
      case '/overlay/board.js':
        send(response, 200, 'text/javascript; charset=utf-8', BOARD_SCRIPT);
        return;
      case '/overlay/events':
        streamOverlay(request, response);
        return;
      default:
        sendJson(response, 404, { error: 'not-found' });
    }
  };
}
