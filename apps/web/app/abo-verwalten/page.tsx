import Link from 'next/link';
import { connection } from 'next/server';
import { PageShell } from '../../components/PageShell';
import { portalLoginUrl } from '../../lib/billing';
import { pageMetadata } from '../../lib/site';

export const metadata = pageMetadata({
  title: 'Abo verwalten',
  description: 'Rechnungen, Zahlungsmethode und Kündigung von FlagCount Pro im Stripe-Kundenportal verwalten.',
  path: '/abo-verwalten'
});

export default async function ManageSubscriptionPage() {
  // The portal link is configured at runtime in the web container, not baked into the build.
  await connection();
  const loginUrl = portalLoginUrl();

  return (
    <PageShell>
      <section className="landing-section narrow-section" aria-labelledby="manage-title">
        <p className="eyebrow">FlagCount Pro</p>
        <h1 id="manage-title">Abo verwalten</h1>
        <p className="lead">
          Rechnungen, Zahlungsmethode, Tarifwechsel und Kündigung verwaltest du im Kundenportal von Stripe. Kündigst du, bleibt Pro bis zum Ende der
          bezahlten Laufzeit aktiv.
        </p>
        <ol className="steps">
          <li className="step">
            <h3>In der App</h3>
            <p>Öffne FlagCount, wechsle zu „Pro“ und klicke auf „Abo verwalten“. Das Kundenportal öffnet sich ohne weitere Anmeldung.</p>
          </li>
          <li className="step">
            <h3>Im Browser</h3>
            {loginUrl ? (
              <p>Melde dich mit der E-Mail-Adresse des Kaufs an; Stripe schickt dir einen Anmeldelink.</p>
            ) : (
              <p>
                Ohne die App schreib uns bitte mit deiner Lizenzreferenz aus der Kauf-E-Mail. Den Aktivierungscode kannst du{' '}
                <Link href="/lizenz-wiederherstellen">hier neu anfordern</Link>.
              </p>
            )}
          </li>
        </ol>
        {loginUrl && (
          <a className="button primary" href={loginUrl} rel="noreferrer">
            Zum Stripe-Kundenportal
          </a>
        )}
      </section>
    </PageShell>
  );
}
