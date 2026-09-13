// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const downloadLink = () => screen.getByRole('link', { name: 'Für Windows herunterladen' });

describe('LandingPage', () => {
  it('links the download to the newest installer and shows its version', async () => {
    const release = { version: '0.2.0', sizeBytes: 27_798_807, pageUrl: 'https://example.test/app-v0.2.0' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ release }) }))
    );

    render(<LandingPage />);

    expect(downloadLink().getAttribute('href')).toBe('/download');
    expect(await screen.findByText('Version 0.2.0 · 26,5 MB · Windows 10 & 11')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/release');
  });

  it('still offers the download when the release lookup fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    render(<LandingPage />);

    expect(downloadLink()).toBeTruthy();
    expect(await screen.findByText('Kostenlos · Windows 10 & 11')).toBeTruthy();
  });

  it('links to the password-protected dashboard', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    render(<LandingPage />);

    expect(screen.getByRole('link', { name: 'Web-Dashboard' }).getAttribute('href')).toBe('/dashboard');
  });

  it('shows the planned Pro offer without pretending that checkout is available', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    render(<LandingPage />);

    expect(screen.getByRole('heading', { name: 'FlagCount Pro' })).toBeTruthy();
    expect(screen.getByText('6,99 € / Monat')).toBeTruthy();
    expect(screen.getByText('oder 59,00 € / Jahr')).toBeTruthy();
    expect(screen.getByText(/Checkout und Lizenzen sind noch nicht verfügbar/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /kaufen/i })).toBeNull();
  });

  it('subscribes to the waitlist only after explicit consent and supports unsubscribing', async () => {
    const fetcher = vi.fn(async (path: string) =>
      path === '/api/release' ? { ok: false } : { ok: true, status: 204 }
    );
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(screen.getByLabelText('E-Mail-Adresse'), 'Person@Example.com');
    await user.click(screen.getByRole('button', { name: 'Vormerken' }));
    expect(screen.getByRole('alert').textContent).toContain('Einwilligung');
    expect(fetcher).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('checkbox', { name: /Neuigkeiten und den Start/ }));
    await user.click(screen.getByRole('button', { name: 'Vormerken' }));
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/v1/waitlist',
      expect.objectContaining({ body: JSON.stringify({ email: 'Person@Example.com', consent: true }) })
    );
    expect(screen.getByRole('status').textContent).toContain('unverbindlich');

    await user.click(screen.getByRole('button', { name: 'Austragen' }));
    expect(fetcher).toHaveBeenLastCalledWith(
      '/api/v1/waitlist/unsubscribe',
      expect.objectContaining({ body: JSON.stringify({ email: 'Person@Example.com' }) })
    );
  });
});
