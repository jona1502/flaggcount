'use client';

import { useEffect, useState } from 'react';

type Plan = 'monthly' | 'yearly';
type Price = { plan: Plan | 'founding'; total: string; currencyCode: string; interval: string };

/** Shown until Stripe's prices arrive; the checkout always shows the binding price including tax. */
export const FALLBACK_PRICES: Record<Plan, string> = { monthly: '6,99 €', yearly: '59,00 €' };

export function checkoutError(status: number): string {
  switch (status) {
    case 429:
      return 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.';
    case 503:
      return 'Der Kauf von Audience Live Pro ist gerade nicht möglich. Bitte versuche es später erneut.';
    default:
      return 'Der Checkout konnte nicht geöffnet werden. Bitte versuche es später erneut.';
  }
}

/**
 * Prices and checkout buttons. The backend creates the Stripe Checkout Session; the browser only ever
 * navigates to the Stripe URL it returns.
 */
export function ProCheckout({ navigate = (url: string) => window.location.assign(url) }: { navigate?: (url: string) => void }) {
  const [prices, setPrices] = useState<Price[]>([]);
  const [pendingPlan, setPendingPlan] = useState<Plan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/v1/billing/prices')
      .then((response) => (response.ok ? (response.json() as Promise<{ prices?: Price[] }>) : null))
      .then((body) => {
        if (active && Array.isArray(body?.prices)) setPrices(body.prices);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const price = (plan: Plan) => prices.find((candidate) => candidate.plan === plan)?.total ?? FALLBACK_PRICES[plan];

  const checkout = async (plan: Plan): Promise<void> => {
    setPendingPlan(plan);
    setProblem(null);
    try {
      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (!response.ok || !data.url?.startsWith('https://checkout.stripe.com/')) {
        setProblem(checkoutError(response.status));
        setPendingPlan(null);
        return;
      }
      navigate(data.url);
    } catch {
      setProblem('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.');
      setPendingPlan(null);
    }
  };

  return (
    <div className="planned-price" aria-label="Audience Live Pro Preise">
      <strong>{price('monthly')} / Monat</strong>
      <span>oder {price('yearly')} / Jahr</span>
      <small>Endgültiger Preis inkl. Steuer wird im Checkout von Stripe berechnet.</small>
      <div className="pro-checkout-actions">
        <button className="button primary" type="button" onClick={() => void checkout('monthly')} disabled={pendingPlan !== null}>
          {pendingPlan === 'monthly' ? 'Checkout wird geöffnet …' : 'Monatlich starten'}
        </button>
        <button className="button" type="button" onClick={() => void checkout('yearly')} disabled={pendingPlan !== null}>
          {pendingPlan === 'yearly' ? 'Checkout wird geöffnet …' : 'Jährlich starten'}
        </button>
      </div>
      {problem && (
        <p className="waitlist-status error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
