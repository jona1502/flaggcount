import { PageShell } from '../../components/PageShell';
import { ProCheckout } from '../../components/ProCheckout';
import { FeatureTable, ProFaq } from '../../components/ProFeatures';
import { WaitlistForm } from '../../components/WaitlistForm';
import { pageMetadata } from '../../lib/site';

export const metadata = pageMetadata({
  title: 'FlagCount Pro',
  description: 'Mehrere Zähler, eigene Umfragen, Premium-Overlays und Auswertungen für Creator. Monatlich oder jährlich, kündbar im Kundenportal.',
  path: '/pro'
});

export default function ProPage() {
  return (
    <PageShell>
      <section className="landing-section pro-preview" id="pro" aria-labelledby="pro-title">
        <div className="pro-heading">
          <div>
            <p className="eyebrow">Für Creator</p>
            <h1 id="pro-title">FlagCount Pro</h1>
            <p className="lead">
              Flexible Abstimmungen und professionelle Overlays für Creator, die FlagCount regelmäßig im Stream nutzen. Der kostenlose
              Flaggenzähler bleibt kostenlos.
            </p>
          </div>
          <ProCheckout />
        </div>

        <FeatureTable />

        <div className="pro-lower-grid">
          <WaitlistForm />
          <ProFaq />
        </div>
      </section>
    </PageShell>
  );
}
