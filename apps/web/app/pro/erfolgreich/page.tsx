import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CheckoutResult } from '../../../components/CheckoutResult';
import { PageShell } from '../../../components/PageShell';
import { fetchCheckoutStatus } from '../../../lib/backend';

export const metadata: Metadata = {
  title: 'Dein Kauf',
  description: 'Status deines Kaufs von FlagCount Pro.',
  alternates: { canonical: '/pro/erfolgreich' },
  robots: { index: false, follow: false }
};

/**
 * Stripe sends buyers here after Checkout with `?session_id=cs_…`. The page asks the backend for the status of
 * that session and explains the next steps. Missing or manipulated ids show a neutral page; nothing here unlocks
 * Pro, which only happens after Stripe's signed webhook confirmed the payment.
 */
export default async function CheckoutReturnPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sessionId = (await searchParams)['session_id'];
  const result = await fetchCheckoutStatus(sessionId, (await headers()).get('x-forwarded-for'));

  return (
    <PageShell>
      <section className="landing-section checkout-success" aria-labelledby="checkout-result-title">
        <p className="eyebrow">FlagCount Pro</p>
        <CheckoutResult result={result} />
      </section>
    </PageShell>
  );
}
