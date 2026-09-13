import {
  ConnectTimeoutError,
  ControlEvent,
  InvalidResponseCompositeError,
  InvalidUniqueIdError,
  SignatureRateLimitError,
  TikTokLiveConnection,
  UserOfflineError,
  WebcastEvent
} from 'tiktok-live-connector';
import { LiveConnectionError } from './errors';
import type { LiveConnectionFactory } from './TikTokLiveService';

const NETWORK_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH']);

function hasNetworkCause(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Maps connector and network errors to FlagCount's error codes. */
export function classifyTikTokError(error: unknown): LiveConnectionError {
  if (error instanceof LiveConnectionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof InvalidUniqueIdError) {
    return new LiveConnectionError('invalid-username', message);
  }
  if (error instanceof UserOfflineError) {
    return new LiveConnectionError('user-offline', message);
  }
  if (error instanceof SignatureRateLimitError) {
    return new LiveConnectionError('rate-limited', message);
  }
  if (error instanceof ConnectTimeoutError || hasNetworkCause(error)) {
    return new LiveConnectionError('network', message);
  }
  if (error instanceof InvalidResponseCompositeError) {
    // Every room id lookup failed: either TikTok was unreachable or the user does not exist.
    const unreachable = error.config.requestErrs?.some(hasNetworkCause) ?? false;
    return new LiveConnectionError(unreachable ? 'network' : 'user-not-found', message);
  }
  return new LiveConnectionError('unknown', message);
}

export type TikTokConnectionOptions = {
  /** Optional Euler Stream API key for TikTok's sign server; raises its rate limit. */
  signApiKey?: string;
};

export const createTikTokConnectionFactory = (options: TikTokConnectionOptions = {}): LiveConnectionFactory => (username, handlers) => {
  const connection = new TikTokLiveConnection(username, {
    // Only comments written after connecting count, not the recent chat history.
    processInitialData: false,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: false,
    ...(options.signApiKey ? { signApiKey: options.signApiKey } : {})
  });

  connection.on(WebcastEvent.CHAT, (message) => handlers.onChat(message));
  connection.on(ControlEvent.DISCONNECTED, () => handlers.onDisconnected());
  connection.on(WebcastEvent.STREAM_END, () => handlers.onStreamEnd());
  connection.on(ControlEvent.ERROR, (event: { exception?: unknown } | undefined) => {
    handlers.onError(classifyTikTokError(event?.exception ?? event));
  });

  return {
    async connect() {
      try {
        await connection.connect();
      } catch (error) {
        throw classifyTikTokError(error);
      }
    },
    async disconnect() {
      connection.removeAllListeners();
      await connection.disconnect();
    }
  };
};

export const createTikTokConnection: LiveConnectionFactory = createTikTokConnectionFactory();
