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
      kind: 'adjustment';
      eventId: string;
      eventType: string;
      occurredAt: string;
      action: 'refund' | 'chargeback' | 'chargeback_reverse' | 'other';
      /** `true` for adjustments that cover the whole transaction. */
      full: boolean;
      approved: boolean;
      subscriptionId: string | null;
    }
  | { kind: 'other'; eventId: string; eventType: string; occurredAt: string };

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
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}
