// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => import('../test/next-link'));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('../components/ReleaseMeta', () => ({ ReleaseMeta: () => <p>Version 0.3.0 · Windows 10 &amp; 11</p> }));

const { default: HomePage, metadata: homeMetadata } = await import('./page');
const { default: ProPage, metadata: proMetadata } = await import('./pro/page');
const { default: CheckoutSuccessPage, metadata: successMetadata } = await import('./pro/erfolgreich/page');
const { default: DownloadPage } = await import('./herunterladen/page');
const { default: RecoveryPage } = await import('./lizenz-wiederherstellen/page');
const { default: ImprintPage } = await import('./impressum/page');
const { default: PrivacyPage } = await import('./datenschutz/page');
const { default: TermsPage } = await import('./agb/page');
const { default: NotFound } = await import('./not-found');
const { default: sitemap } = await import('./sitemap');
const { default: robots } = await import('./robots');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const noBackend = () => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));

describe('public pages', () => {
  it('renders the landing page with the download and a link to Pro', () => {
    noBackend();
    render(<HomePage />);

    expect(screen.getAllByRole('link', { name: /Für Windows herunterladen/ })[0]?.getAttribute('href')).toBe('/download');
    expect(screen.getByText('Version 0.3.0 · Windows 10 & 11')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Pro' })[0]?.getAttribute('href')).toBe('/pro');
    expect(homeMetadata.alternates?.canonical).toBe('/');
  });

  it('renders the Pro page with fallback prices, checkout and FAQ', () => {
    noBackend();
    render(<ProPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'FlagCount Pro' })).toBeTruthy();
    expect(screen.getByText('6,99 € / Monat')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Jährlich starten' })).toBeTruthy();
    expect(screen.getByText(/ein FlagCount-Konto brauchst du nicht/)).toBeTruthy();
    expect(proMetadata).toMatchObject({ alternates: { canonical: '/pro' }, openGraph: { url: '/pro', locale: 'de_DE' } });
  });

  it('renders the checkout return page without indexing it', () => {
    render(<CheckoutSuccessPage />);

    expect(screen.getByRole('heading', { name: 'Danke für deinen Kauf!' })).toBeTruthy();
    expect(successMetadata.robots).toEqual({ index: false, follow: false });
  });

  it('renders the download, recovery, legal and 404 pages', () => {
    noBackend();
    for (const [Page, heading] of [
      [DownloadPage, 'FlagCount für Windows'],
      [RecoveryPage, 'Lizenz wiederherstellen'],
      [ImprintPage, 'Impressum'],
      [PrivacyPage, 'Datenschutzerklärung'],
      [TermsPage, 'Allgemeine Geschäftsbedingungen für FlagCount Pro'],
      [NotFound, 'Diese Seite gibt es nicht']
    ] as const) {
      render(<Page />);
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
      cleanup();
    }
  });

  it('marks legal texts as drafts until they are reviewed', () => {
    for (const Page of [ImprintPage, PrivacyPage, TermsPage]) {
      render(<Page />);
      expect(screen.getByRole('note').textContent).toContain('noch nicht rechtlich geprüft');
      cleanup();
    }
  });

  it('keeps the recovery answer neutral', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<RecoveryPage />);

    await user.type(screen.getByLabelText('E-Mail-Adresse des Kaufs'), ' kunde@example.com ');
    await user.click(screen.getByRole('button', { name: 'Neuen Code anfordern' }));

    expect(fetcher).toHaveBeenCalledWith('/api/v1/licenses/recover', expect.objectContaining({ body: JSON.stringify({ email: 'kunde@example.com' }) }));
    expect((await screen.findByRole('status')).textContent).toContain('Wenn zu dieser Adresse ein aktives FlagCount Pro gehört');
  });
});

describe('sitemap and robots', () => {
  it('lists the public pages but not checkout, dashboard or admin', () => {
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toContain('https://overlay.muhrindustries.com');
    expect(urls).toContain('https://overlay.muhrindustries.com/pro');
    expect(urls).toContain('https://overlay.muhrindustries.com/datenschutz');
    expect(urls.some((url) => /erfolgreich|dashboard|admin/.test(url))).toBe(false);
  });

  it('blocks indexing until it is enabled', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });

    vi.stubEnv('SITE_INDEXING', 'true');
    expect(robots()).toMatchObject({
      rules: { allow: '/', disallow: ['/admin', '/dashboard', '/api/', '/pro/erfolgreich'] },
      sitemap: 'https://overlay.muhrindustries.com/sitemap.xml'
    });
  });
});
