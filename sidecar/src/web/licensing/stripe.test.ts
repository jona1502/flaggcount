import { createHmac } from 'node:crypto';
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

describe('StripeBillingProvider webhooks', () => {
  const SECRET = 'whsec_testsecret0123456789';
  const NOW = Date.parse('2026-09-14T12:00:00.000Z');
  const TS = NOW / 1000;
  const sign = (body: string, ts = TS, secret = SECRET) => `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
  const event = (type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ id: 'evt_1', object: 'event', type, created: TS - 2, livemode: false, data: { object }, ...extra });
  const verify = (body: string, overrides: Partial<StripeConfig> = {}) => stripeProvider(overrides).stripe.verifyWebhook(body, sign(body), NOW);

  it('accepts a correctly signed subscription event and asks for a sync', () => {
    const body = event('customer.subscription.updated', subscriptionObject());

    expect(verify(body)).toEqual({
      ok: true,
      event: { kind: 'subscription-sync', eventId: 'evt_1', eventType: 'customer.subscription.updated', occurredAt: '2026-09-14T11:59:58.000Z', subscriptionId: 'sub_1' }
    });
  });

  it('rejects missing, forged and replayed signatures and changed bodies', () => {
    const { stripe } = stripeProvider();
    const body = event('customer.subscription.created', subscriptionObject());

    expect(stripe.verifyWebhook(body, undefined, NOW)).toEqual({ ok: false, reason: 'missing-signature' });
    expect(stripe.verifyWebhook(body, 'garbage', NOW)).toEqual({ ok: false, reason: 'invalid-signature' });
    expect(stripe.verifyWebhook(body, sign(body, TS, 'whsec_other'), NOW)).toEqual({ ok: false, reason: 'invalid-signature' });
    expect(stripe.verifyWebhook(`${body} `, sign(body), NOW)).toEqual({ ok: false, reason: 'invalid-signature' });
    expect(stripe.verifyWebhook(body, sign(body, TS - 301), NOW)).toEqual({ ok: false, reason: 'stale-timestamp' });
    expect(stripe.verifyWebhook(body, sign(body, TS - 300), NOW).ok).toBe(true);
  });

  it('accepts any of several signatures while the secret is rolled', () => {
    const { stripe } = stripeProvider();
    const body = event('customer.subscription.created', subscriptionObject());
    const current = sign(body).split(',')[1];

    expect(stripe.verifyWebhook(body, `t=${TS},v1=${'0'.repeat(64)},${current},v0=abc`, NOW).ok).toBe(true);
  });

  it('reports signed events with an unusable payload', () => {
    const { stripe } = stripeProvider();
    const broken = '{"id":';
    const incomplete = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', created: TS });

    expect(stripe.verifyWebhook(broken, sign(broken), NOW)).toEqual({ ok: false, reason: 'invalid-payload' });
    expect(stripe.verifyWebhook(incomplete, sign(incomplete), NOW)).toEqual({ ok: false, reason: 'invalid-payload' });
  });

  it('syncs subscriptions after checkout and invoices of every API version', () => {
    expect(verify(event('checkout.session.completed', { id: 'cs_1', mode: 'subscription', subscription: 'sub_1' }))).toMatchObject({
      event: { kind: 'subscription-sync', subscriptionId: 'sub_1' }
    });
    expect(verify(event('checkout.session.completed', { id: 'cs_2', mode: 'payment', subscription: null }))).toMatchObject({
      event: { kind: 'other' }
    });
    expect(
      verify(event('invoice.paid', { id: 'in_1', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_2' } } }))
    ).toMatchObject({ event: { kind: 'subscription-sync', subscriptionId: 'sub_2' } });
    expect(verify(event('invoice.payment_failed', { id: 'in_2', subscription: 'sub_3' }))).toMatchObject({
      event: { kind: 'subscription-sync', subscriptionId: 'sub_3' }
    });
    expect(verify(event('invoice.paid', { id: 'in_3', parent: null }))).toMatchObject({ event: { kind: 'other' } });
  });

  it('normalizes refunds and disputes by payment', () => {
    expect(verify(event('charge.refunded', { id: 'ch_1', refunded: true, payment_intent: 'pi_1' }))).toMatchObject({
      event: { kind: 'adjustment', action: 'refund', full: true, approved: true, subscriptionId: null, paymentId: 'pi_1' }
    });
    expect(verify(event('charge.refunded', { id: 'ch_2', refunded: false, payment_intent: 'pi_2' }))).toMatchObject({
      event: { kind: 'adjustment', action: 'refund', full: false }
    });
    expect(verify(event('charge.dispute.created', { id: 'dp_1', status: 'needs_response', payment_intent: 'pi_3' }))).toMatchObject({
      event: { kind: 'adjustment', action: 'chargeback', paymentId: 'pi_3' }
    });
    expect(verify(event('charge.dispute.created', { id: 'dp_2', status: 'warning_needs_response', payment_intent: 'pi_4' }))).toMatchObject({
      event: { kind: 'other' }
    });
    expect(verify(event('charge.dispute.closed', { id: 'dp_1', status: 'won', payment_intent: 'pi_3' }))).toMatchObject({
      event: { kind: 'adjustment', action: 'chargeback_reverse' }
    });
    expect(verify(event('charge.dispute.closed', { id: 'dp_3', status: 'lost', payment_intent: 'pi_5' }))).toMatchObject({
      event: { kind: 'other' }
    });
  });

  it('ignores unknown types and events of the other mode', () => {
    expect(verify(event('payout.paid', { id: 'po_1' }))).toMatchObject({ ok: true, event: { kind: 'other', eventType: 'payout.paid' } });
    expect(verify(event('customer.subscription.updated', subscriptionObject(), { livemode: true }))).toMatchObject({ event: { kind: 'other' } });
    expect(verify(event('customer.subscription.updated', subscriptionObject()), { mode: 'live' })).toMatchObject({ event: { kind: 'other' } });
  });

  it('finds the subscription of a payment through its invoice', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch
      .mockResolvedValueOnce(respond({ object: 'list', data: [{ id: 'inpay_1', invoice: 'in_1' }] }))
      .mockResolvedValueOnce(respond({ id: 'in_1', parent: { subscription_details: { subscription: 'sub_1' } } }))
      .mockResolvedValueOnce(respond({ object: 'list', data: [] }));

    expect(await stripe.subscriptionIdForPayment('pi_1')).toBe('sub_1');
    expect(decodeURIComponent(String(fetch.mock.calls[0]?.[0]))).toBe(
      'https://api.stripe.com/v1/invoice_payments?payment[type]=payment_intent&payment[payment_intent]=pi_1&limit=1'
    );
    expect(fetch.mock.calls[1]?.[0]).toBe('https://api.stripe.com/v1/invoices/in_1');
    expect(await stripe.subscriptionIdForPayment('pi_2')).toBeNull();
  });
});

describe('StripeBillingProvider checkout', () => {
  const body = (fetch: ReturnType<typeof stripeProvider>['fetch'], call = 0) =>
    Object.fromEntries(new URLSearchParams(String(fetch.mock.calls[call]?.[1]?.body)));

  it('creates a subscription Checkout Session with Stripe Tax', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));

    expect(await stripe.createCheckout('yearly')).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(body(fetch)).toEqual({
      mode: 'subscription',
      'line_items[0][price]': 'price_yearly',
      'line_items[0][quantity]': '1',
      success_url: 'https://flagcount.example/pro/erfolgreich?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://flagcount.example/pro',
      allow_promotion_codes: 'true',
      'metadata[product]': 'flagcount-pro',
      'metadata[plan]': 'yearly',
      'subscription_data[metadata][product]': 'flagcount-pro',
      'subscription_data[metadata][plan]': 'yearly',
      'automatic_tax[enabled]': 'true'
    });
  });

  it('lets Stripe handle tax with Managed Payments', async () => {
    const { stripe, fetch } = stripeProvider({ managedPayments: true });
    fetch.mockResolvedValueOnce(respond({ url: 'https://checkout.stripe.com/c/pay/cs_test_2' }));

    await stripe.createCheckout('monthly');

    expect(body(fetch)).toMatchObject({ 'managed_payments[enabled]': 'true', 'line_items[0][price]': 'price_monthly' });
    expect(body(fetch)).not.toHaveProperty('automatic_tax[enabled]');
  });

  it('refuses plans that are not on sale and sessions without a secure URL', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond({ url: 'http://checkout.example' }));

    await expect(stripe.createCheckout('founding')).rejects.toThrow('not on sale');
    await expect(stripe.createCheckout('monthly')).rejects.toThrow('no checkout URL');
  });
});

describe('StripeBillingProvider customer portal', () => {
  it('opens a portal session that returns to the Pro page', async () => {
    const { stripe, fetch } = stripeProvider({ portalConfigurationId: 'bpc_1Portal01234567' });
    fetch.mockResolvedValueOnce(respond({ id: 'bps_1', url: 'https://billing.stripe.com/p/session/test_1' }));

    expect(await stripe.createPortalSession('cus_1', 'sub_1')).toEqual({ url: 'https://billing.stripe.com/p/session/test_1' });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      customer: 'cus_1',
      return_url: 'https://flagcount.example/pro',
      configuration: 'bpc_1Portal01234567'
    });
  });

  it('uses the default portal configuration and refuses insecure URLs', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond({ url: 'http://billing.example' }));

    await expect(stripe.createPortalSession('cus_1', 'sub_1')).rejects.toThrow('no portal URL');
    expect(new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body)).has('configuration')).toBe(false);
  });
});

describe('StripeBillingProvider license recovery', () => {
  it('finds every customer with the email address', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond({ object: 'search_result', data: [{ id: 'cus_1' }, { id: 'cus_2' }, { id: 'cus_3', deleted: true }] }));

    expect(await stripe.customerIdsByEmail('kunde+pro@example.com')).toEqual(['cus_1', 'cus_2']);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/v1/customers/search');
    expect(url.searchParams.get('query')).toBe('email:"kunde+pro@example.com"');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('escapes quotes so an address cannot change the search query', async () => {
    const { stripe, fetch } = stripeProvider();
    fetch.mockResolvedValueOnce(respond({ data: [] }));

    expect(await stripe.customerIdsByEmail('a"OR email~"@example.com')).toEqual([]);
    expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('query')).toBe('email:"a\\"OR email~\\"@example.com"');
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
