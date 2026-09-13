// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
});
