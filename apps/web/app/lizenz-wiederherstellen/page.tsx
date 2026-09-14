import { PageShell } from '../../components/PageShell';
import { RecoveryForm } from '../../components/RecoveryForm';
import { pageMetadata } from '../../lib/site';

export const metadata = pageMetadata({
  title: 'Lizenz wiederherstellen',
  description: 'Aktivierungscode für FlagCount Pro verloren? Fordere einen neuen Code an die E-Mail-Adresse des Kaufs an.',
  path: '/lizenz-wiederherstellen'
});

export default function RecoveryPage() {
  return (
    <PageShell>
      <section className="landing-section narrow-section" aria-labelledby="recovery-title">
        <p className="eyebrow">FlagCount Pro</p>
        <h1 id="recovery-title">Lizenz wiederherstellen</h1>
        <p className="lead">
          Gib die E-Mail-Adresse ein, mit der du FlagCount Pro gekauft hast. Wir schicken dir einen neuen Aktivierungscode; frühere Codes werden
          damit ungültig, bereits aktivierte Computer bleiben aktiv.
        </p>
        <RecoveryForm />
      </section>
    </PageShell>
  );
}
