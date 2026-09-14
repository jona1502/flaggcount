import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// The same colors, fonts and base styles as the desktop app and the previous web client.
import '../../../src/styles.css';

export const metadata: Metadata = {
  title: {
    default: 'FlagCount',
    template: '%s · FlagCount'
  },
  description: 'Zählt rote Flaggen im TikTok-Live-Chat und zeigt sie als Overlay im Stream.'
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
