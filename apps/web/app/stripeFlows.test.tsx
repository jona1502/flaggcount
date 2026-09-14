// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => import('../test/next-link'));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7, 172.18.0.2' }) }));

const { CheckoutResult } = await import('../components/CheckoutResult');
const { fetchCheckoutStatus } = await import('../lib/backend');
const { portalLoginUrl } = await import('../lib/billing');
const { default: CheckoutReturnPage } = await import('./pro/erfolgreich/page');
const { default: ManageSubscriptionPage } = await import('./abo-verwalten/page');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

describe('checkout return', () => {
  it('never forwards missing or manipulated session ids', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    for (const sessionId of [undefined, ['cs_test_a', 'cs_test_b'], 'cs_test_1', 'pi_3AbCdEfGhIjKl', 'cs_test_abc?x=1', 'cs_test_abcdefghijk/../../customers']) {
      expect(await fetchCheckoutStatus(sessionId, null)).toEqual({ status: 'unknown', paid: false });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('asks the backend with the visitor address and accepts only known answers', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://server:3010');
    const fetcher = vi
      .fn(async (_url: string, _init?: RequestInit) => json({ status: 'complete', paid: true }))
      .mockResolvedValueOnce(json({ status: 'complete', paid: true }))
      .mockResolvedValueOnce(json({ status: 'refunded', paid: true }))
      .mockResolvedValueOnce(json({ status: 'open', paid: true }))
      .mockResolvedValueOnce(json({ error: 'rate-limited' }, 429));
    vi.stubGlobal('fetch', fetcher);

    expect(await fetchCheckoutStatus('cs_test_a1B2c3D4e5F6', '198.51.100.7')).toEqual({ status: 'complete', paid: true });
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://server:3010/api/v1/billing/checkout-status?session_id=cs_test_a1B2c3D4e5F6');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', headers: { 'X-Forwarded-For': '198.51.100.7' } });
    expect(await fetchCheckoutStatus('cs_test_a1B2c3D4e5F6', null)).toEqual({ status: 'unknown', paid: false });
    expect(await fetchCheckoutStatus('cs_test_a1B2c3D4e5F6', null)).toEqual({ status: 'open', paid: false });
    expect(await fetchCheckoutStatus('cs_test_a1B2c3D4e5F6', null)).toBe('unavailable');
  });

  it('explains every checkout state without unlocking anything', () => {
    const cases = [
      [{ status: 'complete', paid: true }, 'Danke für deinen Kauf!'],
      [{ status: 'complete', paid: false }, 'Zahlung wird bestätigt'],
      [{ status: 'open', paid: false }, 'Checkout noch nicht abgeschlossen'],
      [{ status: 'expired', paid: false }, 'Checkout abgelaufen'],
      [{ status: 'unknown', paid: false }, 'Kein Kauf gefunden'],
      ['unavailable', 'Status gerade nicht abrufbar']
    ] as const;
    for (const [result, title] of cases) {
      render(<CheckoutResult result={result} />);
      expect(heading()).toBe(title);
      expect(screen.queryByText(/aktiviert|freigeschaltet/i)).toBeNull();
      cleanup();
    }
  });

  it('renders the return page for the session in the URL', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ status: 'expired', paid: false }));
    vi.stubGlobal('fetch', fetcher);

    render(await CheckoutReturnPage({ searchParams: Promise.resolve({ session_id: 'cs_live_a1B2c3D4e5F6g7' }) }));

    expect(heading()).toBe('Checkout abgelaufen');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { 'X-Forwarded-For': '198.51.100.7, 172.18.0.2' } });
  });

  it('shows a neutral page for a return link without session', async () => {
    vi.stubGlobal('fetch', vi.fn());

    render(await CheckoutReturnPage({ searchParams: Promise.resolve({}) }));

    expect(heading()).toBe('Kein Kauf gefunden');
    // The page and the footer both link to the recovery page.
    const recoveryLinks = screen.getAllByRole('link', { name: 'Lizenz wiederherstellen' });
    expect(recoveryLinks.length).toBeGreaterThan(0);
    expect(recoveryLinks.every((link) => link.getAttribute('href') === '/lizenz-wiederherstellen')).toBe(true);
  });
});

describe('customer portal entry', () => {
  it('links the Stripe portal login only when a valid link is configured', async () => {
    vi.stubEnv('STRIPE_PORTAL_LOGIN_URL', 'https://billing.stripe.com/p/login/test_abc123');
    render(await ManageSubscriptionPage());
    expect(screen.getByRole('link', { name: 'Zum Stripe-Kundenportal' }).getAttribute('href')).toBe('https://billing.stripe.com/p/login/test_abc123');
    cleanup();

    vi.stubEnv('STRIPE_PORTAL_LOGIN_URL', 'https://evil.example/p/login/test_abc123');
    render(await ManageSubscriptionPage());
    expect(screen.queryByRole('link', { name: 'Zum Stripe-Kundenportal' })).toBeNull();
    expect(screen.getByRole('link', { name: 'hier neu anfordern' }).getAttribute('href')).toBe('/lizenz-wiederherstellen');
  });

  it('validates the configured portal login link', () => {
    vi.stubEnv('STRIPE_PORTAL_LOGIN_URL', ' https://billing.stripe.com/p/login/live_XyZ ');
    expect(portalLoginUrl()).toBe('https://billing.stripe.com/p/login/live_XyZ');
    vi.stubEnv('STRIPE_PORTAL_LOGIN_URL', 'http://billing.stripe.com/p/login/live_XyZ');
    expect(portalLoginUrl()).toBeNull();
  });
});
