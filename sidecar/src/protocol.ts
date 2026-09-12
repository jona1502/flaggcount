export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type ConnectionState = {
  status: ConnectionStatus;
  username: string | null;
};

export type ConnectionErrorCode =
  | 'invalid-username'
  | 'user-offline'
  | 'user-not-found'
  | 'rate-limited'
  | 'network'
  | 'stream-ended'
  | 'unknown';

export type ConnectionError = {
  code: ConnectionErrorCode;
  message: string;
};

/** Stable, library-independent representation of a TikTok chat comment. */
export type ChatMessage = {
  messageId: string;
  /** Stable TikTok user id; falls back to `unique:<handle>` if TikTok omits it. */
  userId: string;
  uniqueId: string;
  nickname: string;
  comment: string;
  receivedAt: number;
};

/** Commands sent by Tauri to the sidecar, one JSON object per stdin line. */
export type SidecarCommand = { type: 'connect'; username: string } | { type: 'disconnect' };

/** Events sent by the sidecar to Tauri, one JSON object per stdout line. */
export type SidecarEvent =
  | { type: 'ready' }
  | ({ type: 'status' } & ConnectionState)
  | { type: 'chat'; message: ChatMessage }
  | ({ type: 'error' } & ConnectionError);

export function parseCommand(line: string): SidecarCommand | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  switch (record['type']) {
    case 'connect':
      return typeof record['username'] === 'string' ? { type: 'connect', username: record['username'] } : null;
    case 'disconnect':
      return { type: 'disconnect' };
    default:
      return null;
  }
}

export function serializeEvent(event: SidecarEvent): string {
  return `${JSON.stringify(event)}\n`;
}
