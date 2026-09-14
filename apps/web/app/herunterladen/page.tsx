import { DownloadButton } from '../../components/DownloadButton';
import { PageShell } from '../../components/PageShell';
import { ReleaseMeta } from '../../components/ReleaseMeta';
import { pageMetadata } from '../../lib/site';

export const revalidate = 300;

export const metadata = pageMetadata({
  title: 'FlagCount herunterladen',
  description: 'Den kostenlosen FlagCount-Installer für Windows 10 und 11 herunterladen. Updates kommen automatisch.',
  path: '/herunterladen'
});

export default function DownloadPage() {
  return (
    <PageShell>
      <section className="landing-section" aria-labelledby="download-title">
        <p className="eyebrow">Download</p>
        <h1 id="download-title">FlagCount für Windows</h1>
        <p className="lead">Kostenlos, ohne Konto. Die App prüft beim Start auf Updates und installiert sie auf Wunsch automatisch.</p>
        <div className="download-row">
          <DownloadButton />
          <ReleaseMeta />
        </div>
      </section>

      <section className="landing-section" aria-labelledby="install-title">
        <h2 id="install-title">Installation</h2>
        <ol className="steps">
          <li className="step">
            <h3>Installer starten</h3>
            <p>
              Zeigt Windows „Der Computer wurde durch Windows geschützt“, klick auf <strong>Weitere Informationen</strong> und dann{' '}
              <strong>Trotzdem ausführen</strong>.
            </p>
          </li>
          <li className="step">
            <h3>Voraussetzungen</h3>
            <p>Windows 10 oder 11 (64 Bit) und eine Internetverbindung für die Verbindung mit deinem TikTok-Live.</p>
          </li>
          <li className="step">
            <h3>Updates</h3>
            <p>Neue Versionen sind signiert und werden in der App angekündigt; deine Einstellungen bleiben erhalten.</p>
          </li>
        </ol>
      </section>
    </PageShell>
  );
}
