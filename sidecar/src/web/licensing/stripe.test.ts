import { describe, expect, it, vi } from 'vitest';
import { STRIPE_API_VERSION, StripeApiError, StripeBillingProvider, encodeParams, stripeKeyMode, type StripeConfig } from './stripe';

const PRICES = { monthly: 'price_monthly', yearly: 'price_yearly' };
const T = (iso: string) => Date.parse(iso) / 1000;

export function stripeProvider(overrides: Partial<StripeConfig> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}', { status: 200 }));
  const stripe = new StripeBillingProvider({
    mode: 'test',
    secretKey: 'sk_test_51secretsecret',
    webhookSecret: 'whsec_testsecret0123456789',
    prices: PRICES,
    managedPayments: false,
    publicBaseUrl: 'https://flagcount.example',
    fetch,
    ...overrides
  });
  return { stripe, fetch };
}

export const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export function subscriptionObject(overrides: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    object: 'subscription',
    customer: 'cus_1',
    status: 'active',
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          price: { id: 'price_yearly' },
          current_period_start: T('2026-09-01T00:00:00Z'),
          current_period_end: T('2027-09-01T00:00:00Z'),
          ...item
        }
      ]
    },
    ...overrides
  };
}

describe('Stripe helpers', () => {
  it('derives the mode from the key and encodes nested parameters', () => {
    expect(stripeKeyMode('sk_test_51abcdefghij')).toBe('test');
    expect(stripeKeyMode('rk_live_51abcdefghij')).toBe('live');
    expect(stripeKeyMode('pk_live_51abcdefghij')).toBeNull();

    expect(
      encodeParams({ mode: 'subscription', line_items: [{ price: 'price_1', quantity: 1 }], metadata: { plan: 'yearly' }, skip: undefined, flag: true }).toString()
    ).toBe('mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5Bplan%5D=yearly&flag=true');
  });
});

describe('StripeBillingProvider subscriptions', () => {
  it('reads the current subscription with a pinned API version', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond(subscriptionObject()));

    expect(await stripe.retrieveSubscription('sub_1')).toEqual({
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      status: 'active',
      currentPeriodEndsAt: '2027-09-01T00:00:00.000Z',
      scheduledCancelAt: null,
      canceledAt: null
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.stripe.com/v1/subscriptions/sub_1');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk_test_51secretsecret', 'Stripe-Version': STRIPE_API_VERSION });
  });

  it('accepts the billing period of older API versions and expanded customers', async () => {
    const { stripe, fetch } = stripeProvider();
    const legacy = subscriptionObject(
      { customer: { id: 'cus_2', object: 'customer' }, current_period_end: T('2026-10-01T00:00:00Z') },
      { current_period_end: undefined, current_period_start: undefined }
    );
    fetch.mockResolvedValueOnce(respond(legacy));

    expect(await stripe.retrieveSubscription('sub_1')).toMatchObject({ customerId: 'cus_2', currentPeriodEndsAt: '2026-10-01T00:00:00.000Z' });
  });

  it('keeps a scheduled cancellation until the end of the period', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond(subscriptionObject({ cancel_at_period_end: true, canceled_at: T('2026-09-10T00:00:00Z') })));

    expect(await stripe.retrieveSubscription('sub_1')).toMatchObject({
      status: 'active',
      scheduledCancelAt: '2027-09-01T00:00:00.000Z',
      canceledAt: '2026-09-10T00:00:00.000Z'
    });
  });

  it('counts only the paid time for past-due and canceled subscriptions', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch
      .mockResolvedValueOnce(respond(subscriptionObject({ status: 'past_due' })))
      .mockResolvedValueOnce(respond(subscriptionObject({ status: 'canceled', canceled_at: T('2026-09-20T00:00:00Z'), ended_at: T('2026-09-20T00:00:00Z') })));

    expect(await stripe.retrieveSubscription('sub_1')).toMatchObject({ status: 'past_due', currentPeriodEndsAt: '2026-09-01T00:00:00.000Z' });
    expect(await stripe.retrieveSubscription('sub_1')).toMatchObject({
      status: 'canceled',
      currentPeriodEndsAt: '2026-09-20T00:00:00.000Z',
      scheduledCancelAt: null
    });
  });

  it('ignores subscriptions of other products and unknown states', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch
      .mockResolvedValueOnce(respond(subscriptionObject({}, { price: { id: 'price_other' } })))
      .mockResolvedValueOnce(respond(subscriptionObject({ status: 'exploded' })));

    expect(await stripe.retrieveSubscription('sub_1')).toBeNull();
    expect(await stripe.retrieveSubscription('sub_1')).toBeNull();
  });
});

describe('StripeBillingProvider API', () => {
  it('reads customer addresses but not those of deleted customers', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond({ id: 'cus_1', email: 'kunde@example.com' })).mockResolvedValueOnce(respond({ id: 'cus_2', deleted: true }));

    expect(await stripe.customerEmail('cus_1')).toBe('kunde@example.com');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.stripe.com/v1/customers/cus_1');
    expect(await stripe.customerEmail('cus_2')).toBeNull();
  });

  it('formats the configured list prices', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockImplementation(async (url) =>
      String(url).endsWith('price_monthly')
        ? respond({ id: 'price_monthly', active: true, currency: 'eur', unit_amount: 699, recurring: { interval: 'month', interval_count: 1 } })
        : respond({ id: 'price_yearly', active: true, currency: 'eur', unit_amount: 5900, recurring: { interval: 'year', interval_count: 1 } })
    );

    const quotes = await stripe.previewPrices({});

    expect(quotes.map(({ plan, total, currencyCode, interval }) => ({ plan, total: total.replace(/\s/g, ' '), currencyCode, interval }))).toEqual([
      { plan: 'monthly', total: '6,99 €', currencyCode: 'EUR', interval: 'month' },
      { plan: 'yearly', total: '59,00 €', currencyCode: 'EUR', interval: 'year' }
    ]);
  });

  it('reports API failures without response details', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(new Response('{"error":{"message":"No such customer: kunde@example.com"}}', { status: 404 }));

    const error = await stripe.customerEmail('cus_1').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(StripeApiError);
    expect(String((error as Error).message)).not.toContain('kunde@example.com');
  });
});
