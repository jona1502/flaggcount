import { useEffect, useState } from 'react';
import appIcon from '../../src-tauri/icons/128x128@2x.png';
import { Icon } from './Icon';

type Release = {
  version: string;
  sizeBytes: number | null;
  pageUrl: string;
};

const RELEASES_URL = 'https://github.com/jona1502/flaggcount/releases';

function formatSize(bytes: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(bytes / 1_048_576)} MB`;
}

/** Version and size for the download button; the button itself works without them. */
function useLatestRelease(): Release | null {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/release')
      .then((response) => (response.ok ? (response.json() as Promise<{ release?: Release | null }>) : null))
      .then((body) => {
        if (active) setRelease(body?.release ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return release;
}

/** Public start page of the web version: presents the desktop app and links its download. */
export function LandingPage(): React.JSX.Element {
  const release = useLatestRelease();
  const details = [
    release ? `Version ${release.version}` : 'Kostenlos',
    release?.sizeBytes ? formatSize(release.sizeBytes) : null,
    'Windows 10 & 11'
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="landing">
      <header className="landing-inner landing-nav">
        <a className="landing-logo" href="/">
          <img src={appIcon} alt="" width={28} height={28} />
          FlagCount
        </a>
        <a className="nav-link" href="/dashboard">
          Web-Dashboard
        </a>
      </header>

      <main className="landing-inner">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title">Rote Flaggen im Live-Chat, live gezählt.</h1>
            <p className="lead">
              FlagCount liest den Chat deines TikTok-Livestreams mit, zählt jede 🚩 als Stimme und zeigt das Ergebnis als
              Overlay in OBS.
            </p>
            <div className="download-row">
              <a className="download-button" href="/download">
                <Icon>
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </Icon>
                Für Windows herunterladen
              </a>
              <p className="download-meta">
                <span>{details}</span>
                <a href={release?.pageUrl ?? RELEASES_URL} target="_blank" rel="noreferrer">
                  Versionshinweise auf GitHub
                </a>
              </p>
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
                Zeigt Windows „Der Computer wurde durch Windows geschützt“, klick auf <strong>Weitere Informationen</strong>{' '}
                und dann <strong>Trotzdem ausführen</strong>.
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
      </main>

      <footer className="landing-inner landing-footer">
        <span>FlagCount ist kein offizielles Produkt von TikTok.</span>
        <a href={RELEASES_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
