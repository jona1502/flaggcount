import { LegalDraftNotice } from '../../components/LegalDraftNotice';
import { PageShell } from '../../components/PageShell';
import { pageMetadata } from '../../lib/site';

export const metadata = pageMetadata({
  title: 'Datenschutz',
  description: 'Welche Daten Audience Live, die Website und Audience Live Pro verarbeiten.',
  path: '/datenschutz'
});

export default function PrivacyPage() {
  return (
    <PageShell>
      <article className="landing-section legal-page" aria-labelledby="privacy-title">
        <h1 id="privacy-title">Datenschutzerklärung</h1>
        <LegalDraftNotice />

        <h2>Verantwortlicher</h2>
        <p>[Name und Anschrift wie im Impressum], E-Mail: [Kontaktadresse]</p>

        <h2>Website</h2>
        <p>
          Beim Aufruf der Website verarbeitet der Server technisch notwendige Verbindungsdaten, um die Seiten auszuliefern und Missbrauch zu
          begrenzen. Die Anwendung schreibt keine IP-Adressen in ihre Protokolle. Es gibt keine Analyse- oder Werbe-Tracker und keine
          Produkttelemetrie. [Angaben zu Hosting-Anbieter, Content Delivery Network und deren Protokollen ergänzen.]
        </p>

        <h2>Desktop-App</h2>
        <p>
          Die App verbindet sich mit dem TikTok-Live, das du eingibst, und zählt Stimmen lokal auf deinem Computer. Chatnachrichten und
          Zuschauernamen werden nicht an Audience Live übertragen. Nutzt du das Online-Overlay, überträgt die App nur Zählerstand, Ziel und
          Darstellung. Für Updates fragt die App die neueste Version bei GitHub ab.
        </p>

        <h2>Warteliste</h2>
        <p>
          Trägst du dich in die Warteliste ein, speichern wir deine E-Mail-Adresse auf Grundlage deiner Einwilligung, bis du dich austrägst.
        </p>

        <h2>Audience Live Pro</h2>
        <p>
          Bezahlung, Belege, Kundenportal und Steuerberechnung übernimmt Stripe. Stripe verarbeitet dafür Name, E-Mail-Adresse, Rechnungsadresse
          und Zahlungsdaten. Audience Live speichert für die Lizenz nur Kennungen des Stripe-Kunden und Abos, den Abo-Status und das Ende der
          bezahlten Periode, den Hash des Aktivierungscodes sowie pseudonyme Kennungen der aktivierten Computer mit Aktivierungszeit und letztem
          Kontakt. Die E-Mail-Adresse wird nur zum Versand des Aktivierungscodes bei Stripe abgefragt und über [E-Mail-Anbieter] versendet.
          Rechtsgrundlage ist die Erfüllung des Vertrags.
        </p>

        <h2>Web-Dashboard</h2>
        <p>Die Anmeldung setzt ein technisch notwendiges Cookie, das nur die Sitzung enthält.</p>

        <h2>Empfänger</h2>
        <ul>
          <li>Stripe (Zahlungen und Kundenportal)</li>
          <li>[E-Mail-Anbieter] (Versand von Aktivierungscodes)</li>
          <li>[Hosting-Anbieter] (Betrieb von Website, Lizenzdienst und Datenbank)</li>
          <li>GitHub (Download der App und Anmeldung der Administratoren, keine Kundendaten)</li>
        </ul>

        <h2>Speicherdauer</h2>
        <p>[Fristen für Lizenzdaten nach Vertragsende und gesetzliche Aufbewahrungspflichten ergänzen.]</p>

        <h2>Deine Rechte</h2>
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das
          Recht, eine erteilte Einwilligung jederzeit zu widerrufen. Du kannst dich bei einer Datenschutzaufsichtsbehörde beschweren.
        </p>
      </article>
    </PageShell>
  );
}
