import 'server-only';

const PORTAL_LOGIN_PATTERN = /^https:\/\/billing\.stripe\.com\/p\/login\/[A-Za-z0-9_]+$/;

/**
 * Login link of the Stripe customer portal (Stripe dashboard → customer portal → link to the portal). Stripe
 * sends a one-time link to the purchase address, so no FlagCount account is needed. Read at request time.
 */
export function portalLoginUrl(): string | null {
  const value = process.env['STRIPE_PORTAL_LOGIN_URL']?.trim() ?? '';
  return PORTAL_LOGIN_PATTERN.test(value) ? value : null;
}
