import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { PageShell } from '../../components/PageShell';
import { pageMetadata } from '../../lib/site';

export const metadata = pageMetadata({
  title: 'Impressum',
  description: 'Anbieterkennzeichnung von FlagCount.',
  path: '/impressum'
});

export default function ImprintPage() {
  return (
    <PageShell>
      <article className="landing-section legal-page" aria-labelledby="imprint-title">
        <h1 id="imprint-title">Impressum</h1>
        <LegalDraftNotice />
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          [Vor- und Nachname bzw. Firma]
          <br />
          [Straße und Hausnummer]
          <br />
          [PLZ und Ort]
          <br />
          [Land]
        </p>
        <h2>Kontakt</h2>
        <p>E-Mail: [Kontaktadresse]</p>
        <h2>Umsatzsteuer</h2>
        <p>[Umsatzsteuer-Identifikationsnummer, falls vorhanden]</p>
        <h2>Verantwortlich für den Inhalt</h2>
        <p>[Name und Anschrift, falls abweichend]</p>
        <h2>Verbraucherstreitbeilegung</h2>
        <p>[Angabe zur Bereitschaft oder Verpflichtung zur Teilnahme an Streitbeilegungsverfahren]</p>
      </article>
    </PageShell>
  );
}
