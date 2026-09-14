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

export type CheckoutStatus = {
  status: 'complete' | 'open' | 'expired' | 'unknown';
  paid: boolean;
};

/** Stripe Checkout Session ids; other values are never forwarded, e.g. manipulated return links. */
export const CHECKOUT_SESSION_PATTERN = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

const UNKNOWN_CHECKOUT: CheckoutStatus = { status: 'unknown', paid: false };

/**
 * Status of the checkout a buyer returns from. The page shows it but unlocks nothing; licenses come only
 * from verified webhooks. `unavailable` while the backend or Stripe cannot answer.
 */
export async function fetchCheckoutStatus(sessionId: unknown, forwardedFor: string | null): Promise<CheckoutStatus | 'unavailable'> {
  if (typeof sessionId !== 'string' || !CHECKOUT_SESSION_PATTERN.test(sessionId)) return UNKNOWN_CHECKOUT;
  try {
    const response = await fetch(`${backendUrl()}/api/v1/billing/checkout-status?session_id=${encodeURIComponent(sessionId)}`, {
      cache: 'no-store',
      // The backend rate-limits per visitor, not per web container.
      headers: forwardedFor ? { 'X-Forwarded-For': forwardedFor } : {},
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return 'unavailable';
    const body = (await response.json()) as Partial<CheckoutStatus>;
    const status = ['complete', 'open', 'expired'].includes(String(body.status)) ? (body.status as CheckoutStatus['status']) : 'unknown';
    return { status, paid: status === 'complete' && body.paid === true };
  } catch {
    return 'unavailable';
  }
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
