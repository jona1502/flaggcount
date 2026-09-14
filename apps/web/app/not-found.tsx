import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '../components/PageShell';

export const metadata: Metadata = {
  title: 'Seite nicht gefunden',
  robots: { index: false, follow: false }
};

export default function NotFound() {
  return (
    <PageShell>
      <section className="landing-section narrow-section" aria-labelledby="not-found-title">
        <p className="eyebrow">404</p>
        <h1 id="not-found-title">Diese Seite gibt es nicht</h1>
        <p className="lead">Vielleicht hat sich die Adresse geändert. Von der Startseite aus findest du alles Wichtige.</p>
        <Link className="button primary" href="/">
          Zur Startseite
        </Link>
      </section>
    </PageShell>
  );
}
