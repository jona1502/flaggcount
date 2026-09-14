import type { BillingPlanId } from './billing';

/** Derived from the secret key: `sk_test_…`/`rk_test_…` or `sk_live_…`/`rk_live_…`. */
export type StripeMode = 'test' | 'live';

export type StripeConfig = {
  mode: StripeMode;
  /** Secret or restricted API key; never shipped in the app, the web bundle or logs. */
  secretKey: string;
  /** Signing secret (`whsec_…`) of the webhook endpoint or of `stripe listen`. */
  webhookSecret: string;
  /** Stripe price ids of the plans on sale; plans without a price cannot be bought. */
  prices: Partial<Record<BillingPlanId, string>>;
  /** Customer portal configuration (`bpc_…`); the account's default configuration without it. */
  portalConfigurationId?: string;
  /** Stripe acts as merchant of record and handles sales tax; otherwise Stripe Tax calculates it for us. */
  managedPayments: boolean;
  /** Public origin of the website, e.g. `https://overlay.example.com`, for checkout and portal return pages. */
  publicBaseUrl: string;
  webhookToleranceSeconds?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

const SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/;

/** The mode of a Stripe API key, or `null` if it is not one. */
export function stripeKeyMode(key: string): StripeMode | null {
  const match = SECRET_KEY_PATTERN.exec(key);
  return match ? (match[2] as StripeMode) : null;
}
