import type { SubscriptionUpdate } from './store';

export type BillingPlanId = 'monthly' | 'yearly' | 'founding';

export const BILLING_PLANS: readonly BillingPlanId[] = ['monthly', 'yearly', 'founding'];

/** A subscription's billing state as the provider reports it, without the bookkeeping fields. */
export type SubscriptionSnapshot = Omit<SubscriptionUpdate, 'provider' | 'occurredAt'>;

export type BillingEvent =
  | {
      kind: 'subscription';
      eventId: string;
      eventType: string;
      occurredAt: string;
      subscription: SubscriptionSnapshot;
    }
  | {
      /** Something about the subscription changed; its current state has to be read from the provider. */
      kind: 'subscription-sync';
      eventId: string;
      eventType: string;
      occurredAt: string;
      subscriptionId: string;
    }
  | {
      kind: 'adjustment';
      eventId: string;
      eventType: string;
      occurredAt: string;
      action: 'refund' | 'chargeback' | 'chargeback_reverse' | 'other';
      /** `true` for adjustments that cover the whole transaction. */
      full: boolean;
      approved: boolean;
      subscriptionId: string | null;
      /** Provider payment the adjustment belongs to, when the event does not name the subscription. */
      paymentId?: string | null;
    }
  | { kind: 'other'; eventId: string; eventType: string; occurredAt: string };

/** Outcome of a hosted checkout for the return page, without any customer data. */
export type CheckoutStatus = {
  status: 'complete' | 'open' | 'expired' | 'unknown';
  /** The payment went through; a completed checkout can still wait for a delayed payment method. */
  paid: boolean;
};

export type WebhookVerification =
  | { ok: true; event: BillingEvent }
  | { ok: false; reason: 'missing-signature' | 'invalid-signature' | 'stale-timestamp' | 'invalid-payload' };

/** A price as the payment provider calculated it for the visitor's location, including tax where it applies. */
export type PriceQuote = {
  plan: BillingPlanId;
  currencyCode: string;
  subtotal: string;
  tax: string;
  total: string;
  interval: 'day' | 'week' | 'month' | 'year';
  frequency: number;
};

/**
 * The merchant of record behind FlagCount Pro. Prices, taxes and currencies always come from here;
 * the app never treats its own numbers as billing truth. Paddle is the first implementation.
 */
export interface BillingProvider {
  readonly name: string;
  verifyWebhook(rawBody: string, signatureHeader: string | undefined, now: number): WebhookVerification;
  createCheckout(plan: BillingPlanId): Promise<{ url: string }>;
  createPortalSession(customerId: string, subscriptionId: string): Promise<{ url: string }>;
  customerEmail(customerId: string): Promise<string | null>;
  customerIdsByEmail(email: string): Promise<string[]>;
  previewPrices(location: { ip?: string; countryCode?: string }): Promise<PriceQuote[]>;
  /** Current state of a subscription for `subscription-sync` events; `null` if it does not sell FlagCount Pro. */
  retrieveSubscription?(subscriptionId: string): Promise<SubscriptionSnapshot | null>;
  /** The subscription a payment was made for, to apply refunds and disputes. */
  subscriptionIdForPayment?(paymentId: string): Promise<string | null>;
  /** Whether a checkout session of FlagCount Pro finished; `unknown` for any other or unknown session. */
  checkoutStatus?(sessionId: string): Promise<CheckoutStatus>;
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}
