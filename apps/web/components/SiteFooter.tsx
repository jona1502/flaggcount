import Link from 'next/link';
import { RELEASES_URL } from '../lib/site';

export function SiteFooter() {
  return (
    <footer className="landing-inner landing-footer">
      <span>Audience Live ist kein offizielles Produkt von TikTok.</span>
      <nav className="site-footer-links" aria-label="Rechtliches">
        <Link href="/abo-verwalten">Abo verwalten</Link>
        <Link href="/lizenz-wiederherstellen">Lizenz wiederherstellen</Link>
        <Link href="/impressum">Impressum</Link>
        <Link href="/datenschutz">Datenschutz</Link>
        <Link href="/agb">AGB</Link>
        <a href={RELEASES_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </nav>
    </footer>
  );
}
