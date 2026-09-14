import 'server-only';

/**
 * Address of the FlagCount backend inside the private network. Only server code calls it this way; the
 * browser always uses relative same-origin URLs such as `/api/v1/billing/prices` through the reverse proxy.
 */
export function backendUrl(): string {
  return (process.env['BACKEND_INTERNAL_URL'] ?? 'http://127.0.0.1:3010').replace(/\/+$/, '');
}

export type Release = {
  version: string;
  sizeBytes: number | null;
  pageUrl: string;
};

export function parseRelease(value: unknown): Release | null {
  if (typeof value !== 'object' || value === null) return null;
  const { version, sizeBytes, pageUrl } = value as Record<string, unknown>;
  if (typeof version !== 'string' || typeof pageUrl !== 'string' || !pageUrl.startsWith('https://')) return null;
  return { version, sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : null, pageUrl };
}

/** The newest desktop release, refreshed every five minutes; `null` while the backend is unreachable. */
export async function fetchLatestRelease(): Promise<Release | null> {
  try {
    const response = await fetch(`${backendUrl()}/api/release`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { release?: unknown };
    return parseRelease(body.release);
  } catch {
    return null;
  }
}
