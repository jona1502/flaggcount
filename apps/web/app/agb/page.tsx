import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { PageShell } from '../../components/PageShell';
import { pageMetadata } from '../../lib/site';

export const metadata = pageMetadata({
  title: 'AGB',
  description: 'Allgemeine Geschäftsbedingungen für Audience Live Pro.',
  path: '/agb'
});

export default function TermsPage() {
  return (
    <PageShell>
      <article className="landing-section legal-page" aria-labelledby="terms-title">
        <h1 id="terms-title">Allgemeine Geschäftsbedingungen für Audience Live Pro</h1>
        <LegalDraftNotice />

        <h2>1. Geltungsbereich und Vertragspartner</h2>
        <p>
          Diese Bedingungen gelten für das Abonnement Audience Live Pro. Vertragspartner ist [Anbieter laut Impressum]. [Bei Verkauf über Stripe
          Managed Payments: Angaben zur Rolle von Stripe als Verkäufer ergänzen.] Die kostenlose Nutzung von Audience Live ist davon nicht
          betroffen.
        </p>

        <h2>2. Leistungen</h2>
        <p>
          Audience Live Pro schaltet in der Windows-App zusätzliche Funktionen frei, wie auf der Pro-Seite beschrieben. Eine Lizenz kann auf bis zu
          drei Computern gleichzeitig aktiviert werden. Die App funktioniert nach der Aktivierung bis zu 30 Tage ohne Internetverbindung.
        </p>

        <h2>3. Vertragsschluss, Preise und Zahlung</h2>
        <p>
          Der Vertrag kommt mit Abschluss des Bestellvorgangs bei Stripe zustande. Es gelten die dort angezeigten Preise einschließlich
          Umsatzsteuer. Das Abonnement wird zu Beginn jeder Laufzeit im Voraus bezahlt.
        </p>

        <h2>4. Laufzeit und Kündigung</h2>
        <p>
          Das Abonnement läuft monatlich oder jährlich und verlängert sich automatisch um die gewählte Laufzeit. Es kann jederzeit zum Ende der
          laufenden Periode im Kundenportal gekündigt werden; Pro bleibt bis dahin nutzbar. [Gesetzliche Vorgaben zur Kündigung nach der
          Mindestlaufzeit prüfen.]
        </p>

        <h2>5. Widerrufsrecht</h2>
        <p>[Widerrufsbelehrung, Muster-Widerrufsformular und Hinweis zum vorzeitigen Erlöschen bei digitalen Inhalten ergänzen.]</p>

        <h2>6. Verfügbarkeit und Änderungen</h2>
        <p>[Regelungen zu Verfügbarkeit des Lizenzdienstes, Updates und Änderungen des Funktionsumfangs ergänzen.]</p>

        <h2>7. Haftung</h2>
        <p>[Haftungsregelung ergänzen.]</p>

        <h2>8. Schlussbestimmungen</h2>
        <p>[Anwendbares Recht und weitere Schlussbestimmungen ergänzen.]</p>
      </article>
    </PageShell>
  );
}
