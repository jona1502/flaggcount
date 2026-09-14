import type { Metadata } from 'next';
import { DownloadButton } from '../../../components/DownloadButton';
import { PageShell } from '../../../components/PageShell';

export const metadata: Metadata = {
  title: 'Danke für deinen Kauf',
  description: 'Dein Aktivierungscode für FlagCount Pro kommt per E-Mail.',
  alternates: { canonical: '/pro/erfolgreich' },
  robots: { index: false, follow: false }
};

/**
 * Stripe sends buyers here after Checkout. The page unlocks nothing: the license is created only after
 * Stripe's signed webhook confirmed the payment.
 */
export default function CheckoutSuccessPage() {
  return (
    <PageShell>
      <section className="landing-section checkout-success" aria-labelledby="checkout-success-title">
        <p className="eyebrow">FlagCount Pro</p>
        <h1 id="checkout-success-title">Danke für deinen Kauf!</h1>
        <p className="lead">
          Sobald Stripe die Zahlung bestätigt hat, schicken wir deinen Aktivierungscode an die E-Mail-Adresse, die du im Checkout angegeben hast.
          Das dauert meist nur wenige Minuten.
        </p>
        <ol className="steps">
          <li className="step">
            <h3>E-Mail abwarten</h3>
            <p>Keine Nachricht erhalten? Schau auch im Spam-Ordner nach oder fordere den Code neu an.</p>
          </li>
          <li className="step">
            <h3>Code in FlagCount eingeben</h3>
            <p>Öffne FlagCount auf deinem Windows-PC, wechsle zu „Pro“ und aktiviere den Code.</p>
          </li>
          <li className="step">
            <h3>Abo verwalten</h3>
            <p>Rechnungen, Zahlungsmethode und Kündigung findest du in der App unter „Abo verwalten“.</p>
          </li>
        </ol>
        <div className="download-row">
          <DownloadButton />
        </div>
      </section>
    </PageShell>
  );
}
