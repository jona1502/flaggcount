import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaddleApiError, PaddleBillingProvider, type PaddleConfig } from './paddle';

const SECRET = 'pdl_ntfset_test_secret';
const NOW = Date.parse('2026-09-13T10:00:00.000Z');
const TS = NOW / 1000;
const PRICES = { monthly: 'pri_monthly', yearly: 'pri_yearly' };

function provider(overrides: Partial<PaddleConfig> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
  const paddle = new PaddleBillingProvider({
    environment: 'sandbox',
    apiKey: 'pdl_sdbx_apikey_secret',
    webhookSecret: SECRET,
    prices: PRICES,
    fetch,
    ...overrides
  });
  return { paddle, fetch };
}

const sign = (body: string, ts = TS, secret = SECRET) => `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`;

function subscriptionEvent(data: Record<string, unknown> = {}, eventType = 'subscription.updated') {
  return JSON.stringify({
    event_id: 'evt_01',
    event_type: eventType,
    occurred_at: '2026-09-13T09:59:59.123456Z',
    notification_id: 'ntf_01',
    data: {
      id: 'sub_01',
      customer_id: 'ctm_01',
      status: 'active',
      current_billing_period: { starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' },
      scheduled_change: { action: 'cancel', effective_at: '2026-10-01T00:00:00Z', resume_at: null },
      canceled_at: null,
      items: [{ price: { id: 'pri_yearly' }, quantity: 1 }],
      ...data
    }
  });
}

describe('PaddleBillingProvider webhooks', () => {
  it('accepts a correctly signed event and normalizes the subscription', () => {
    const body = subscriptionEvent();

    expect(provider().paddle.verifyWebhook(body, sign(body), NOW)).toEqual({
      ok: true,
      event: {
        kind: 'subscription',
        eventId: 'evt_01',
        eventType: 'subscription.updated',
        occurredAt: '2026-09-13T09:59:59.123Z',
        subscription: {
          customerId: 'ctm_01',
          subscriptionId: 'sub_01',
          status: 'active',
          currentPeriodEndsAt: '2026-10-01T00:00:00.000Z',
          scheduledCancelAt: '2026-10-01T00:00:00.000Z',
          canceledAt: null
        }
      }
    });
  });

  it('rejects missing, forged and replayed signatures and changed bodies', () => {
    const { paddle } = provider();
    const body = subscriptionEvent();

    expect(paddle.verifyWebhook(body, undefined, NOW)).toEqual({ ok: false, reason: 'missing-signature' });
    expect(paddle.verifyWebhook(body, 'garbage', NOW)).toEqual({ ok: false, reason: 'invalid-signature' });
    expect(paddle.verifyWebhook(body, sign(body, TS, 'other-secret'), NOW)).toEqual({ ok: false, reason: 'invalid-signature' });
    expect(paddle.verifyWebhook(`${body} `, sign(body), NOW)).toEqual({ ok: false, reason: 'invalid-signature' });
    expect(paddle.verifyWebhook(body, sign(body, TS - 6), NOW)).toEqual({ ok: false, reason: 'stale-timestamp' });
    expect(paddle.verifyWebhook(body, sign(body, TS - 5), NOW).ok).toBe(true);
  });

  it('accepts any of several signatures during a secret rotation', () => {
    const body = subscriptionEvent();
    const current = sign(body).split(';')[1];

    expect(provider().paddle.verifyWebhook(body, `ts=${TS};h1=${'0'.repeat(64)};${current}`, NOW).ok).toBe(true);
  });

  it('reports signed events with an unusable payload', () => {
    const { paddle } = provider();
    const broken = '{"event_id":';
    const incomplete = JSON.stringify({ event_id: 'evt', event_type: 'subscription.updated', occurred_at: '2026-09-13T10:00:00Z', data: { id: 'sub' } });

    expect(paddle.verifyWebhook(broken, sign(broken), NOW)).toEqual({ ok: false, reason: 'invalid-payload' });
    expect(paddle.verifyWebhook(incomplete, sign(incomplete), NOW)).toEqual({ ok: false, reason: 'invalid-payload' });
  });

  it('ignores subscriptions for other products and unknown event types', () => {
    const { paddle } = provider();
    const otherProduct = subscriptionEvent({ items: [{ price: { id: 'pri_other' } }] });
    const unknown = JSON.stringify({ event_id: 'evt_2', event_type: 'payout.paid', occurred_at: '2026-09-13T10:00:00Z', data: {} });

    expect(paddle.verifyWebhook(otherProduct, sign(otherProduct), NOW)).toMatchObject({ ok: true, event: { kind: 'other' } });
    expect(paddle.verifyWebhook(unknown, sign(unknown), NOW)).toMatchObject({ ok: true, event: { kind: 'other', eventType: 'payout.paid' } });
  });

  it('normalizes refunds and chargebacks', () => {
    const body = JSON.stringify({
      event_id: 'evt_3',
      event_type: 'adjustment.updated',
      occurred_at: '2026-09-13T10:00:00Z',
      data: { action: 'chargeback', type: 'full', status: 'approved', subscription_id: 'sub_01', transaction_id: 'txn_01' }
    });

    expect(provider().paddle.verifyWebhook(body, sign(body), NOW)).toMatchObject({
      ok: true,
      event: { kind: 'adjustment', action: 'chargeback', full: true, approved: true, subscriptionId: 'sub_01' }
    });
  });
});

describe('PaddleBillingProvider API', () => {
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });

  it('creates a hosted checkout for a plan on sale', async () => {
    const { paddle, fetch } = provider({ checkoutUrl: 'https://flagcount.example/kaufen' });
    fetch.mockResolvedValueOnce(respond({ checkout: { url: 'https://flagcount.example/kaufen?_ptxn=txn_01' } }));

    expect(await paddle.createCheckout('yearly')).toEqual({ url: 'https://flagcount.example/kaufen?_ptxn=txn_01' });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://sandbox-api.paddle.com/transactions');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer pdl_sdbx_apikey_secret');
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [{ price_id: 'pri_yearly', quantity: 1 }],
      collection_mode: 'automatic',
      custom_data: { product: 'flagcount-pro', plan: 'yearly' },
      checkout: { url: 'https://flagcount.example/kaufen' }
    });
    await expect(paddle.createCheckout('founding')).rejects.toThrow('not on sale');
  });

  it('opens a customer portal session for the subscription', async () => {
    const { paddle, fetch } = provider({ environment: 'production' });
    fetch.mockResolvedValueOnce(respond({ urls: { general: { overview: 'https://customer-portal.paddle.com/cpl_01' } } }));

    expect(await paddle.createPortalSession('ctm_01', 'sub_01')).toEqual({ url: 'https://customer-portal.paddle.com/cpl_01' });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.paddle.com/customers/ctm_01/portal-sessions');
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ subscription_ids: ['sub_01'] });
  });

  it('looks up customers by email and reads their address', async () => {
    const { paddle, fetch } = provider();
    fetch.mockResolvedValueOnce(respond([{ id: 'ctm_01' }, { id: 'ctm_02' }])).mockResolvedValueOnce(respond({ email: 'kunde@example.com' }));

    expect(await paddle.customerIdsByEmail('kunde+pro@example.com')).toEqual(['ctm_01', 'ctm_02']);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://sandbox-api.paddle.com/customers?email=kunde%2Bpro%40example.com');
    expect(await paddle.customerEmail('ctm_01')).toBe('kunde@example.com');
  });

  it('previews localized prices by visitor address or fallback country', async () => {
    const { paddle, fetch } = provider();
    const preview = {
      currency_code: 'EUR',
      details: {
        line_items: [
          {
            price: { id: 'pri_monthly', billing_cycle: { interval: 'month', frequency: 1 } },
            formatted_totals: { subtotal: '5,87 €', tax: '1,12 €', total: '6,99 €' }
          },
          {
            price: { id: 'pri_yearly', billing_cycle: { interval: 'year', frequency: 1 } },
            formatted_totals: { subtotal: '49,58 €', tax: '9,42 €', total: '59,00 €' }
          }
        ]
      }
    };
    fetch.mockImplementation(async () => respond(preview));

    expect(await paddle.previewPrices({ ip: '203.0.113.9' })).toEqual([
      { plan: 'monthly', currencyCode: 'EUR', subtotal: '5,87 €', tax: '1,12 €', total: '6,99 €', interval: 'month', frequency: 1 },
      { plan: 'yearly', currencyCode: 'EUR', subtotal: '49,58 €', tax: '9,42 €', total: '59,00 €', interval: 'year', frequency: 1 }
    ]);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ customer_ip_address: '203.0.113.9' });

    await paddle.previewPrices({ ip: '127.0.0.1' });
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({ address: { country_code: 'DE' } });
  });

  it('reports API failures without response details', async () => {
    const { paddle, fetch } = provider();
    fetch.mockResolvedValueOnce(new Response('{"error":{"detail":"kunde@example.com"}}', { status: 403 }));

    const error = await paddle.customerEmail('ctm_01').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PaddleApiError);
    expect(String((error as Error).message)).not.toContain('kunde@example.com');
  });
});
