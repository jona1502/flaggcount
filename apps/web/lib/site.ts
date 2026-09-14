import type { Metadata } from 'next';

/** Public origin for canonical URLs, Open Graph and the sitemap; set `SITE_URL` at build time for other hosts. */
export const SITE_URL = (process.env['SITE_URL'] ?? 'https://overlay.muhrindustries.com').replace(/\/+$/, '');
export const SITE_NAME = 'FlagCount';
export const RELEASES_URL = 'https://github.com/jona1502/flaggcount/releases';

/** Public pages listed in the sitemap. The checkout return page, the dashboard and the admin area are not. */
export const PUBLIC_PATHS = ['/', '/pro', '/herunterladen', '/lizenz-wiederherstellen', '/abo-verwalten', '/impressum', '/datenschutz', '/agb'] as const;

/**
 * Search engines may index the site only once `SITE_INDEXING=true` is set at build time, e.g. after the legal
 * texts have been reviewed. Until then every page asks not to be indexed.
 */
export function indexingEnabled(): boolean {
  return process.env['SITE_INDEXING'] === 'true';
}

export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: path === '/' ? SITE_NAME : `${title} · ${SITE_NAME}`,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: 'de_DE',
      type: 'website'
    }
  };
}

export function formatSize(bytes: number): string {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(bytes / 1_048_576)} MB`;
}
