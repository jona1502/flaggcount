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

function DownloadButton({ release, centered = false }: { release: Release | null; centered?: boolean }) {
  const details = [
    release ? `Version ${release.version}` : 'Kostenlos',
    release?.sizeBytes ? formatSize(release.sizeBytes) : null,
    'Windows 10 & 11'
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={centered ? 'download-row centered' : 'download-row'}>
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
  );
}

const FEATURES = [
  {
    title: 'Eine Stimme pro Zuschauer',
    text: 'Jeder Kommentar mit 🚩 zählt, aber pro Person nur einmal je Runde. Spam verfälscht das Ergebnis nicht.',
    icon: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0" />
        <path d="m16 11 2 2 4-4" />
      </>
    )
  },
  {
    title: 'Overlay für OBS',
    text: 'Als Browserquelle einfügen, fertig. Zähler und Fortschrittsbalken laufen live mit, Hintergrund und Balken sind abschaltbar.',
    icon: (
      <>
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    )
  },
  {
    title: 'Ziel und Runden',
    text: 'Setz ein Stimmenziel, füge bei Bedarf Stimmen von Hand hinzu und starte mit einem Klick die nächste Runde.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1" />
      </>
    )
  },
  {
    title: 'Läuft auf deinem PC',
    text: 'Kein Konto, kein Abo. Die App verbindet sich direkt mit deinem Livestream und hält sich selbst auf dem neuesten Stand.',
    icon: (
      <>
        <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
        <path d="M3 21v-5h5" />
        <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
        <path d="M21 3v5h-5" />
      </>
    )
  }
];

/** Public start page of the web version: presents the desktop app and links its download. */
export function LandingPage(): React.JSX.Element {
  const release = useLatestRelease();

  return (
    <div className="landing">
      <header className="landing-inner landing-nav">
        <a className="landing-logo" href="/">
          <img src={appIcon} alt="" width={32} height={32} />
          FlagCount
        </a>
        <a className="nav-link" href="/dashboard">
          Web-Dashboard
        </a>
      </header>

      <main>
        <section className="landing-inner landing-hero" aria-labelledby="hero-title">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Für TikTok-Livestreams
            </p>
            <h1 id="hero-title">
              Rote Flaggen im Live-Chat, <em>live gezählt.</em>
            </h1>
            <p className="lead">
              FlagCount liest den Chat deines Livestreams mit, zählt jede 🚩 als Stimme und zeigt das Ergebnis direkt als
              Overlay in OBS.
            </p>
            <DownloadButton release={release} />
          </div>

          <figure className="preview" aria-label="Beispiel: 37 von 50 Stimmen">
            <p className="preview-label">
              <span className="live-badge">LIVE</span> Runde läuft
            </p>
            <p className="preview-count">
              <strong>37</strong>
              <span>von 50 Stimmen</span>
            </p>
            <div className="progress">
              <div className="progress-fill" />
            </div>
            <ul className="preview-chat" aria-hidden="true">
              <li>
                <span className="who">@lena.live</span> 🚩🚩🚩 <span className="counted">+1</span>
              </li>
              <li>
                <span className="who">@maxi</span> 🚩 <span className="counted">+1</span>
              </li>
              <li>
                <span className="who">@lena.live</span> 🚩 <span className="ignored">schon gezählt</span>
              </li>
            </ul>
          </figure>
        </section>

        <section className="landing-section" aria-labelledby="features-title">
          <div className="landing-inner">
            <div className="section-heading">
              <h2 id="features-title">Alles, was du für die Abstimmung brauchst</h2>
              <p>Keine Tabellen, kein Mitzählen. Du streamst, FlagCount zählt.</p>
            </div>
            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <article className="feature" key={feature.title}>
                  <span className="feature-icon">
                    <Icon>{feature.icon}</Icon>
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="steps-title">
          <div className="landing-inner">
            <div className="section-heading">
              <h2 id="steps-title">In drei Schritten live</h2>
              <p>Einmal einrichten, danach reicht ein Klick auf „Verbinden“.</p>
            </div>
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
                <p>Kopier den Overlay-Link aus der App und füge ihn in OBS als Browserquelle hinzu.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="landing-section landing-cta" aria-labelledby="cta-title">
          <div className="landing-inner">
            <h2 id="cta-title">Bereit für die nächste Runde?</h2>
            <DownloadButton release={release} centered />
          </div>
        </section>
      </main>

      <footer className="landing-inner landing-footer">
        <span>FlagCount ist kein offizielles Produkt von TikTok.</span>
        <nav aria-label="Weitere Links">
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="/dashboard">Web-Dashboard</a>
        </nav>
      </footer>
    </div>
  );
}
