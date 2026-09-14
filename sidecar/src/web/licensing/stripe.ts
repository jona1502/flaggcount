import type { BillingPlanId, BillingProvider, PriceQuote, SubscriptionSnapshot, WebhookVerification } from './billing';
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from './store';

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

export const STRIPE_API_BASE = 'https://api.stripe.com';
/**
 * Pinned, so a change of the account's default version cannot change the objects this code reads. The
 * parsers also accept the pre-basil fields, because webhook endpoints may still render an older version.
 */
export const STRIPE_API_VERSION = '2025-03-31.basil';

const SECRET_KEY_PATTERN = /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/;
const ZERO_DECIMAL_CURRENCIES = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

/** The mode of a Stripe API key, or `null` if it is not one. */
export function stripeKeyMode(key: string): StripeMode | null {
  const match = SECRET_KEY_PATTERN.exec(key);
  return match ? (match[2] as StripeMode) : null;
}

/** HTTP status of a failed Stripe API call. The response body is deliberately not kept: it may contain customer data. */
export class StripeApiError extends Error {
  constructor(readonly status: number) {
    super(`Stripe API request failed with HTTP ${status}`);
    this.name = 'StripeApiError';
  }
}

type UnknownRecord = Record<string, unknown>;
type Params = Record<string, unknown>;

export const record = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;

export const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** Stripe timestamps are Unix seconds. */
export const seconds = (value: unknown): string | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;

/** Stripe ids appear either as a string or, when expanded, as an object with an `id`. */
export const idOf = (value: unknown): string | null => text(value) ?? text(record(value)?.['id']);

/** Encodes nested parameters the way the Stripe API expects them, e.g. `line_items[0][price]=price_1`. */
export function encodeParams(params: Params): URLSearchParams {
  const search = new URLSearchParams();
  const add = (key: string, value: unknown): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => add(`${key}[${index}]`, item));
    } else if (typeof value === 'object') {
      for (const [child, item] of Object.entries(value)) add(`${key}[${child}]`, item);
    } else {
      search.append(key, String(value));
    }
  };
  for (const [key, value] of Object.entries(params)) add(key, value);
  return search;
}

function formatAmount(amount: number, currency: string): string {
  const divisor = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency.toUpperCase() }).format(amount / divisor);
}

/** Stripe Billing: hosted Checkout, customer portal and signed webhooks, optionally with Managed Payments. */
export class StripeBillingProvider implements BillingProvider {
  readonly name = 'stripe';
  private readonly send: typeof fetch;

  constructor(private readonly config: StripeConfig) {
    this.send = config.fetch ?? fetch;
  }

  verifyWebhook(_rawBody: string, _signatureHeader: string | undefined, _now: number): WebhookVerification {
    return { ok: false, reason: 'invalid-signature' };
  }

  createCheckout(_plan: BillingPlanId): Promise<{ url: string }> {
    return Promise.reject(new Error('Stripe checkout is not available yet'));
  }

  createPortalSession(_customerId: string, _subscriptionId: string): Promise<{ url: string }> {
    return Promise.reject(new Error('The Stripe customer portal is not available yet'));
  }

  customerIdsByEmail(_email: string): Promise<string[]> {
    return Promise.resolve([]);
  }

  async customerEmail(customerId: string): Promise<string | null> {
    const customer = record(await this.request('GET', `/v1/customers/${encodeURIComponent(customerId)}`));
    return customer?.['deleted'] === true ? null : text(customer?.['email']);
  }

  /**
   * The subscription as Stripe knows it right now; `null` if it does not sell FlagCount Pro. Reading the
   * current state instead of the event payload keeps events that arrive out of order harmless.
   */
  async retrieveSubscription(subscriptionId: string): Promise<SubscriptionSnapshot | null> {
    const subscription = await this.request('GET', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
    return this.toSnapshot(record(subscription));
  }

  /** List prices as configured in Stripe. Taxes depend on the buyer's address and are shown in Checkout. */
  async previewPrices(_location: { ip?: string; countryCode?: string }): Promise<PriceQuote[]> {
    const plans = (Object.entries(this.config.prices) as [BillingPlanId, string | undefined][]).filter(
      (entry): entry is [BillingPlanId, string] => typeof entry[1] === 'string'
    );
    const prices = await Promise.all(
      plans.map(async ([plan, priceId]) => ({ plan, price: record(await this.request('GET', `/v1/prices/${encodeURIComponent(priceId)}`)) }))
    );

    const quotes: PriceQuote[] = [];
    for (const { plan, price } of prices) {
      const recurring = record(price?.['recurring']);
      const interval = text(recurring?.['interval']);
      const currency = text(price?.['currency']);
      const amount = price?.['unit_amount'];
      if (price?.['active'] === false || !currency || typeof amount !== 'number' || !interval) continue;
      if (!['day', 'week', 'month', 'year'].includes(interval)) continue;
      const formatted = formatAmount(amount, currency);
      quotes.push({
        plan,
        currencyCode: currency.toUpperCase(),
        subtotal: formatted,
        tax: '',
        total: formatted,
        interval: interval as PriceQuote['interval'],
        frequency: typeof recurring?.['interval_count'] === 'number' ? recurring['interval_count'] : 1
      });
    }
    return quotes;
  }

  /**
   * Translates a Stripe subscription into the license fields. `currentPeriodEndsAt` means "paid through":
   * for a past-due subscription that is the start of the unpaid period, for a canceled one the time it ended.
   */
  private toSnapshot(subscription: UnknownRecord | null): SubscriptionSnapshot | null {
    const subscriptionId = text(subscription?.['id']);
    const customerId = idOf(subscription?.['customer']);
    const status = text(subscription?.['status']) as SubscriptionStatus | null;
    if (!subscription || !subscriptionId || !customerId || !status || !SUBSCRIPTION_STATUSES.includes(status)) return null;

    const priceIds = new Set(Object.values(this.config.prices).filter(Boolean));
    const items = record(subscription['items'])?.['data'];
    const item = (Array.isArray(items) ? items : []).map(record).find((candidate) => priceIds.has(idOf(candidate?.['price']) ?? ''));
    if (!item) return null;

    // Since 2025-03-31.basil the billing period lives on the subscription item.
    const periodEnd = seconds(item['current_period_end']) ?? seconds(subscription['current_period_end']);
    const periodStart = seconds(item['current_period_start']) ?? seconds(subscription['current_period_start']);
    const cancelAt = seconds(subscription['cancel_at']);
    const canceledAt = seconds(subscription['canceled_at']);
    const endedAt = seconds(subscription['ended_at']);

    let currentPeriodEndsAt = periodEnd;
    if (status === 'past_due') currentPeriodEndsAt = periodStart ?? periodEnd;
    if (status === 'canceled') currentPeriodEndsAt = endedAt ?? canceledAt ?? periodEnd;
    const scheduledCancelAt = status === 'canceled' ? null : (cancelAt ?? (subscription['cancel_at_period_end'] === true ? periodEnd : null));

    return { customerId, subscriptionId, status, currentPeriodEndsAt, scheduledCancelAt, canceledAt };
  }

  protected async request(method: 'GET' | 'POST', path: string, params?: Params): Promise<unknown> {
    const encoded = params ? encodeParams(params).toString() : '';
    const url = method === 'GET' && encoded ? `${STRIPE_API_BASE}${path}?${encoded}` : `${STRIPE_API_BASE}${path}`;
    const response = await this.send(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        'Stripe-Version': STRIPE_API_VERSION,
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
      },
      body: method === 'POST' ? encoded : undefined,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000)
    });
    if (!response.ok) throw new StripeApiError(response.status);
    return response.json();
  }
}
