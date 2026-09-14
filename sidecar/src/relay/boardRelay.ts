import { createHmac } from 'node:crypto';
import type { SignedEntitlement } from '../../../shared/licensing';
import type { BoardAccess } from '../../../shared/overlayBoard';
import { startRelayPublisher, type RelayTiming } from './overlayRelay';
import { channelIdForKey } from './relayChannel';

export const BOARD_RELAY_PATH = '/api/relay/board/';
export const BOARD_OVERLAY_PREFIX = '/ob/';
export const ENTITLEMENT_HEADER = 'X-FlagCount-Entitlement';

/**
 * A separate key per overlay, derived from the installation's relay key: each online overlay gets its own
 * stable URL, and none of them reveals the key of the classic overlay.
 */
export function boardChannelKey(masterKey: string, scope: string): string {
  return createHmac('sha256', masterKey).update(`flagcount-board:${scope}`).digest('base64url');
}

export type BoardRelaySource = {
  getBoard: (scope: string) => BoardAccess;
  /** Scopes whose overlays the plan allows right now. */
  getBoardScopes: () => string[];
  subscribeBoard: (listener: () => void) => () => void;
};

export type BoardRelayOptions = RelayTiming & {
  baseUrl: string;
  masterKey: string;
  source: BoardRelaySource;
  /** The verified Pro entitlement; the server only opens these channels for it. `null` stops them. */
  entitlement: () => SignedEntitlement | null;
  /** Public URL per scope, reported whenever the set changes. */
  onUrls: (urls: Record<string, string>) => void;
};

export type BoardRelays = {
  reconcile(): void;
  stop(): void;
};

/** Keeps one relay channel per allowed counter overlay and the overview, while Pro is active. */
export function startBoardRelays(options: BoardRelayOptions): BoardRelays {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const publishers = new Map<string, { stop(): void; url: string }>();
  let reported = '{}';
  let stopped = false;

  const report = (): void => {
    const urls = Object.fromEntries([...publishers].sort(([a], [b]) => a.localeCompare(b)).map(([scope, publisher]) => [scope, publisher.url]));
    const serialized = JSON.stringify(urls);
    if (serialized !== reported) {
      reported = serialized;
      options.onUrls(urls);
    }
  };

  const reconcile = (): void => {
    if (stopped) return;
    const wanted = new Set(options.entitlement() ? options.source.getBoardScopes() : []);

    for (const [scope, publisher] of publishers) {
      if (!wanted.has(scope)) {
        publisher.stop();
        publishers.delete(scope);
      }
    }
    for (const scope of wanted) {
      if (publishers.has(scope)) continue;
      const key = boardChannelKey(options.masterKey, scope);
      const channelId = channelIdForKey(key);
      const publisher = startRelayPublisher({
        ...options,
        name: 'Online counter overlay',
        endpoint: `${baseUrl}${BOARD_RELAY_PATH}${channelId}`,
        headers: () => {
          const entitlement = options.entitlement();
          return {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...(entitlement ? { [ENTITLEMENT_HEADER]: Buffer.from(JSON.stringify(entitlement)).toString('base64url') } : {})
          };
        },
        body: () => {
          const access = options.source.getBoard(scope);
          return {
            scope,
            counters: access.status === 'ok' ? access.counters : [],
            layout: access.status === 'ok' ? access.layout : undefined
          };
        },
        subscribe: (listener) => options.source.subscribeBoard(listener)
      });
      publishers.set(scope, { stop: publisher.stop, url: `${baseUrl}${BOARD_OVERLAY_PREFIX}${channelId}` });
    }
    report();
  };

  // Counters, their designs and the plan all change the set of overlays.
  const unsubscribe = options.source.subscribeBoard(reconcile);
  reconcile();

  return {
    reconcile,
    stop: () => {
      stopped = true;
      unsubscribe();
      for (const publisher of publishers.values()) publisher.stop();
      publishers.clear();
    }
  };
}
