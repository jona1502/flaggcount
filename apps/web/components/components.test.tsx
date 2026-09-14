// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRelease } from '../lib/backend';
import { ProCheckout, checkoutError } from './ProCheckout';
import { ReleaseMeta } from './ReleaseMeta';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

describe('ReleaseMeta', () => {
  it('shows the version and size from the backend', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://server:3010/');
    const fetcher = vi.fn(async (_url: string) =>
      json({ release: { version: '0.3.0', sizeBytes: 27_798_807, pageUrl: 'https://github.com/jona1502/flaggcount/releases/tag/app-v0.3.0' } })
    );
    vi.stubGlobal('fetch', fetcher);

    render(await ReleaseMeta());

    expect(screen.getByText('Version 0.3.0 · 26,5 MB · Windows 10 & 11')).toBeTruthy();
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://server:3010/api/release');
  });

  it('falls back while the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));

    render(await ReleaseMeta());

    expect(screen.getByText('Kostenlos · Windows 10 & 11')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Versionshinweise auf GitHub' }).getAttribute('href')).toBe('https://github.com/jona1502/flaggcount/releases');
  });

  it('accepts only releases with a secure page URL', () => {
    expect(parseRelease({ version: '1.0.0', sizeBytes: 'big', pageUrl: 'https://example.test' })).toEqual({ version: '1.0.0', sizeBytes: null, pageUrl: 'https://example.test' });
    expect(parseRelease({ version: '1.0.0', pageUrl: 'javascript:alert(1)' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe('ProCheckout', () => {
  it('shows the prices from Stripe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          prices: [
            { plan: 'monthly', total: '7,49 €', currencyCode: 'EUR', interval: 'month' },
            { plan: 'yearly', total: '64,00 €', currencyCode: 'EUR', interval: 'year' }
          ]
        })
      )
    );

    render(<ProCheckout />);

    expect(await screen.findByText('7,49 € / Monat')).toBeTruthy();
    expect(screen.getByText('oder 64,00 € / Jahr')).toBeTruthy();
  });

  it('opens only Stripe Checkout URLs created by the backend', async () => {
    const navigate = vi.fn();
    const fetcher = vi.fn(async (path: string, _init?: RequestInit) =>
      path === '/api/v1/billing/checkout' ? json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }) : json({}, 503)
    );
    // The second parameter types the recorded calls for `toHaveBeenCalledWith` below.
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<ProCheckout navigate={navigate} />);

    await user.click(screen.getByRole('button', { name: 'Monatlich starten' }));

    expect(fetcher).toHaveBeenCalledWith('/api/v1/billing/checkout', expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan: 'monthly' }) }));
    expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
  });

  it('refuses other URLs and explains failures', async () => {
    const navigate = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (path: string) => (path === '/api/v1/billing/checkout' ? json({ url: 'https://evil.example/pay' }) : json({}, 503))));
    const user = userEvent.setup();
    render(<ProCheckout navigate={navigate} />);

    await user.click(screen.getByRole('button', { name: 'Jährlich starten' }));

    expect(navigate).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toContain('konnte nicht geöffnet werden');
    expect(checkoutError(503)).toContain('gerade nicht möglich');
    expect(checkoutError(429)).toContain('Zu viele Versuche');
  });
});
