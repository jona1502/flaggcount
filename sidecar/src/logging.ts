/**
 * Describes an error for the log without its message, which may contain usernames or URLs.
 * Only the error class and a well-formed system error code (e.g. ENOTFOUND) are kept.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? `${error.name} (${code})` : error.name;
  }
  return typeof error;
}
