import Link from 'next/link';
import { DownloadButton } from '../components/DownloadButton';
import { PageShell } from '../components/PageShell';
import { ReleaseMeta } from '../components/ReleaseMeta';
import { pageMetadata } from '../lib/site';

// Static HTML, refreshed every five minutes so a new release shows up without a rebuild.
export const revalidate = 300;

export const metadata = pageMetadata({
  title: 'Audience Live – Zuschauerreaktionen im Livestream zählen',
  description: 'Kostenlose App, die Reaktionen und Abstimmungen im Live-Chat zählt und als Overlay in OBS oder TikTok LIVE Studio zeigt.',
  path: '/'
});

export default function HomePage() {
  return (
    <PageShell>
      <section className="landing-hero">
        <div>
          <h1 className="landing-title">Dein Publikum live abstimmen lassen</h1>
          <p className="lead">
            Audience Live zählt Zuschauerreaktionen im Chat deines Lives, jede Person einmal pro Runde, und zeigt den Stand als Overlay in OBS oder TikTok LIVE
            Studio.
          </p>
          <div className="download-row">
            <DownloadButton />
            <ReleaseMeta />
          </div>
        </div>

        <figure className="preview" aria-label="Beispiel: 37 von 50 Stimmen">
          <p className="preview-count">
            <strong>37</strong>
            <span>von 50 Stimmen</span>
          </p>
          <div className="progress">
            <div className="progress-fill" />
          </div>
          <ul className="preview-chat" aria-hidden="true">
            <li>
              <span className="who">@sophie.mueller</span> 🚩🚩🚩 <span className="counted">+1</span>
            </li>
            <li>
              <span className="who">@leon_k</span> 🚩 <span className="counted">+1</span>
            </li>
            <li>
              <span className="who">@sophie.mueller</span> 🚩 <span className="ignored">schon gezählt</span>
            </li>
          </ul>
        </figure>
      </section>

      <section className="landing-section" aria-labelledby="steps-title">
        <h2 id="steps-title">In drei Schritten live</h2>
        <ol className="steps">
          <li className="step">
            <h3>Herunterladen und installieren</h3>
            <p>
              Zeigt Windows „Der Computer wurde durch Windows geschützt“, klick auf <strong>Weitere Informationen</strong> und dann{' '}
              <strong>Trotzdem ausführen</strong>.
            </p>
          </li>
          <li className="step">
            <h3>Mit deinem Live verbinden</h3>
            <p>Gib deinen TikTok-Benutzernamen ein und klick auf „Verbinden“, sobald du live bist.</p>
          </li>
          <li className="step">
            <h3>Overlay in OBS einfügen</h3>
            <p>Kopier die Online-URL aus der App und füge sie in TikTok LIVE Studio als Link-Quelle oder in OBS als Browserquelle hinzu.</p>
          </li>
        </ol>
      </section>

      <section className="landing-section pro-teaser" aria-labelledby="pro-teaser-title">
        <p className="eyebrow">Für Creator</p>
        <h2 id="pro-teaser-title">Audience Live Pro</h2>
        <p className="lead">
          Mehrere Zähler gleichzeitig, eigene Umfragen, Premium-Overlays mit deinem Branding und eine Auswertung deiner Runden. Der Flaggenzähler
          bleibt kostenlos.
        </p>
        <Link className="button primary" href="/pro">
          Pro ansehen
        </Link>
      </section>
    </PageShell>
  );
}
