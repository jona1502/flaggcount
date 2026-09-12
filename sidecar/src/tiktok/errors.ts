import type { ConnectionError, ConnectionErrorCode } from '../protocol';

/** Error with a classified code, thrown by live connection adapters. */
export class LiveConnectionError extends Error {
  constructor(
    readonly code: ConnectionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'LiveConnectionError';
  }
}

export function toConnectionError(error: unknown): ConnectionError {
  if (error instanceof LiveConnectionError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'unknown', message: error instanceof Error ? error.message : String(error) };
}
