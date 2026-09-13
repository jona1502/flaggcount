import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { SubscriptionStatus } from './store';
import type { BillingEvent, BillingPlanId, BillingProvider, PriceQuote, WebhookVerification } from './billing';

export type PaddleEnvironment = 'sandbox' | 'production';

export type PaddleConfig = {
  environment: PaddleEnvironment;
  /** Server-side API key; never shipped in the app, the web bundle or logs. */
  apiKey: string;
  /** Secret of the notification destination that signs webhooks. */
  webhookSecret: string;
  /** Paddle price ids of the plans on sale; plans without a price cannot be bought. */
  prices: Partial<Record<BillingPlanId, string>>;
  /** Approved checkout page; Paddle's default payment link is used without it. */
  checkoutUrl?: string;
  /** Country for price previews when the visitor's address is private, e.g. behind a local proxy. */
  fallbackCountry?: string;
  webhookToleranceSeconds?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export const PADDLE_API_BASE: Record<PaddleEnvironment, string> = {
  sandbox: 'https://sandbox-api.paddle.com',
  production: 'https://api.paddle.com'
};

/** Paddle's documented default tolerance between the signature timestamp and the current time. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 5;

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'paused', 'canceled'];

/** HTTP status of a failed Paddle API call. The response body is deliberately not kept: it may contain customer data. */
export class PaddleApiError extends Error {
  constructor(readonly status: number) {
    super(`Paddle API request failed with HTTP ${status}`);
    this.name = 'PaddleApiError';
  }
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : null;

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

const timestamp = (value: unknown): string | null => {
  const raw = text(value);
  return raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null;
};

function parseSignatureHeader(header: string): { ts: number; signatures: string[] } | null {
  let ts = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(';')) {
    const [key, value] = part.split('=', 2).map((item) => item.trim());
    if (key === 'ts' && value && /^\d{1,12}$/.test(value)) ts = Number(value);
    if (key === 'h1' && value && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  return Number.isFinite(ts) && signatures.length > 0 ? { ts, signatures } : null;
}

function isPublicAddress(address: string | undefined): address is string {
  if (!address || isIP(address) === 0) return false;
  const normalized = address.replace(/^::ffff:/, '');
  return !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i.test(normalized);
}

/** Paddle Billing as merchant of record: hosted checkout, customer portal, localized prices and signed webhooks. */
export class PaddleBillingProvider implements BillingProvider {
  readonly name = 'paddle';
  private readonly baseUrl: string;
  private readonly send: typeof fetch;

  constructor(private readonly config: PaddleConfig) {
    this.baseUrl = PADDLE_API_BASE[config.environment];
    this.send = config.fetch ?? fetch;
  }

  /** Verifies the `Paddle-Signature` header over the unmodified body before anything is parsed. */
  verifyWebhook(rawBody: string, signatureHeader: string | undefined, now: number): WebhookVerification {
    if (!signatureHeader) return { ok: false, reason: 'missing-signature' };
    const parsed = parseSignatureHeader(signatureHeader);
    if (!parsed) return { ok: false, reason: 'invalid-signature' };

    const tolerance = this.config.webhookToleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
    if (Math.abs(now / 1000 - parsed.ts) > tolerance) return { ok: false, reason: 'stale-timestamp' };

    const expected = createHmac('sha256', this.config.webhookSecret).update(`${parsed.ts}:${rawBody}`).digest();
    // More than one h1 appears while Paddle rotates the secret.
    const authentic = parsed.signatures.some((signature) => timingSafeEqual(Buffer.from(signature, 'hex'), expected));
    if (!authentic) return { ok: false, reason: 'invalid-signature' };

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: 'invalid-payload' };
    }
    const event = this.normalizeEvent(payload);
    return event ? { ok: true, event } : { ok: false, reason: 'invalid-payload' };
  }

  async createCheckout(plan: BillingPlanId): Promise<{ url: string }> {
    const priceId = this.config.prices[plan];
    if (!priceId) throw new Error(`The plan ${plan} is not on sale`);
    const data = await this.request('POST', '/transactions', {
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: 'automatic',
      custom_data: { product: 'flagcount-pro', plan },
      ...(this.config.checkoutUrl ? { checkout: { url: this.config.checkoutUrl } } : {})
    });
    const url = text(record(record(data)?.['checkout'])?.['url']);
    if (!url?.startsWith('https://')) throw new Error('Paddle returned no checkout URL');
    return { url };
  }

  async createPortalSession(customerId: string, subscriptionId: string): Promise<{ url: string }> {
    const data = await this.request('POST', `/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
      subscription_ids: [subscriptionId]
    });
    const url = text(record(record(record(data)?.['urls'])?.['general'])?.['overview']);
    if (!url?.startsWith('https://')) throw new Error('Paddle returned no portal URL');
    return { url };
  }

  async customerEmail(customerId: string): Promise<string | null> {
    const data = await this.request('GET', `/customers/${encodeURIComponent(customerId)}`);
    return text(record(data)?.['email']);
  }

  async customerIdsByEmail(email: string): Promise<string[]> {
    const data = await this.request('GET', `/customers?email=${encodeURIComponent(email)}`);
    return (Array.isArray(data) ? data : []).map((customer) => text(record(customer)?.['id'])).filter((id): id is string => id !== null);
  }

  async previewPrices(location: { ip?: string; countryCode?: string }): Promise<PriceQuote[]> {
    const plans = (Object.entries(this.config.prices) as [BillingPlanId, string | undefined][]).filter(
      (entry): entry is [BillingPlanId, string] => typeof entry[1] === 'string'
    );
    if (plans.length === 0) return [];

    const where = isPublicAddress(location.ip)
      ? { customer_ip_address: location.ip.replace(/^::ffff:/, '') }
      : { address: { country_code: location.countryCode ?? this.config.fallbackCountry ?? 'DE' } };
    const data = record(
      await this.request('POST', '/pricing-preview', { items: plans.map(([, priceId]) => ({ price_id: priceId, quantity: 1 })), ...where })
    );
    const currencyCode = text(data?.['currency_code']) ?? '';
    const lineItems = record(data?.['details'])?.['line_items'];

    const quotes: PriceQuote[] = [];
    for (const item of Array.isArray(lineItems) ? lineItems : []) {
      const line = record(item);
      const price = record(line?.['price']);
      const plan = plans.find(([, priceId]) => priceId === text(price?.['id']))?.[0];
      const totals = record(line?.['formatted_totals']);
      const cycle = record(price?.['billing_cycle']);
      const interval = text(cycle?.['interval']);
      if (!plan || !totals || !interval || !['day', 'week', 'month', 'year'].includes(interval)) continue;
      quotes.push({
        plan,
        currencyCode,
        subtotal: text(totals['subtotal']) ?? '',
        tax: text(totals['tax']) ?? '',
        total: text(totals['total']) ?? '',
        interval: interval as PriceQuote['interval'],
        frequency: typeof cycle?.['frequency'] === 'number' ? cycle['frequency'] : 1
      });
    }
    return quotes;
  }

  private normalizeEvent(payload: unknown): BillingEvent | null {
    const envelope = record(payload);
    const eventId = text(envelope?.['event_id']);
    const eventType = text(envelope?.['event_type']);
    const occurredAt = timestamp(envelope?.['occurred_at']);
    const data = record(envelope?.['data']);
    if (!eventId || !eventType || !occurredAt || !data) return null;
    const base = { eventId, eventType, occurredAt };

    if (eventType.startsWith('subscription.')) {
      const subscriptionId = text(data['id']);
      const customerId = text(data['customer_id']);
      const status = text(data['status']) as SubscriptionStatus | null;
      if (!subscriptionId || !customerId || !status || !SUBSCRIPTION_STATUSES.includes(status)) return null;
      if (!this.sellsFlagCount(data)) return { kind: 'other', ...base };

      const scheduledChange = record(data['scheduled_change']);
      return {
        kind: 'subscription',
        ...base,
        subscription: {
          customerId,
          subscriptionId,
          status,
          currentPeriodEndsAt: timestamp(record(data['current_billing_period'])?.['ends_at']),
          scheduledCancelAt: scheduledChange?.['action'] === 'cancel' ? timestamp(scheduledChange['effective_at']) : null,
          canceledAt: timestamp(data['canceled_at'])
        }
      };
    }

    if (eventType.startsWith('adjustment.')) {
      const action = text(data['action']);
      return {
        kind: 'adjustment',
        ...base,
        action: action === 'refund' || action === 'chargeback' || action === 'chargeback_reverse' ? action : 'other',
        full: data['type'] === 'full',
        approved: data['status'] === 'approved',
        subscriptionId: text(data['subscription_id'])
      };
    }

    return { kind: 'other', ...base };
  }

  /** The same Paddle account may sell other products; only subscriptions with a FlagCount price count. */
  private sellsFlagCount(subscription: UnknownRecord): boolean {
    const priceIds = new Set(Object.values(this.config.prices).filter(Boolean));
    const items = subscription['items'];
    return (Array.isArray(items) ? items : []).some((item) => priceIds.has(text(record(record(item)?.['price'])?.['id']) ?? ''));
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const response = await this.send(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000)
    });
    if (!response.ok) throw new PaddleApiError(response.status);
    return record(await response.json())?.['data'];
  }
}
