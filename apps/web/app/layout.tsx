import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SITE_NAME, SITE_URL, indexingEnabled } from '../lib/site';
// The same colors, fonts and base styles as the desktop app, plus the few styles only the website needs.
import '../../../src/styles.css';
import './site.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`
  },
  description: 'Zählt rote Flaggen im TikTok-Live-Chat und zeigt sie als Overlay im Stream.',
  openGraph: { siteName: SITE_NAME, locale: 'de_DE', type: 'website' },
  ...(indexingEnabled() ? {} : { robots: { index: false, follow: false } })
};

export const viewport: Viewport = {
  themeColor: '#16161a',
  colorScheme: 'dark'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
