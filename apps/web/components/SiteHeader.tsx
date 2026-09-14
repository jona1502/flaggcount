import Image from 'next/image';
import Link from 'next/link';
import icon from '../app/icon.png';

export function SiteHeader() {
  return (
    <header className="landing-inner landing-nav">
      <Link className="landing-logo" href="/">
        <Image src={icon} alt="" width={28} height={28} unoptimized />
        FlagCount
      </Link>
      <nav className="landing-nav-links" aria-label="Hauptnavigation">
        <Link className="nav-link" href="/pro">
          Pro
        </Link>
        <Link className="nav-link" href="/herunterladen">
          Download
        </Link>
        <Link className="nav-link" href="/dashboard" prefetch={false}>
          Web-Dashboard
        </Link>
      </nav>
    </header>
  );
}
