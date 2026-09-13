// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const downloadLinks = () => screen.getAllByRole('link', { name: 'Für Windows herunterladen' });

describe('LandingPage', () => {
  it('links the download to the newest installer and shows its version', async () => {
    const release = { version: '0.2.0', sizeBytes: 27_798_807, pageUrl: 'https://example.test/app-v0.2.0' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ release }) }))
    );

    render(<LandingPage />);

    expect(downloadLinks().map((link) => link.getAttribute('href'))).toEqual(['/download', '/download']);
    expect(await screen.findAllByText('Version 0.2.0 · 26,5 MB · Windows 10 & 11')).toHaveLength(2);
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

    expect(downloadLinks()).toHaveLength(2);
    expect(await screen.findAllByText('Kostenlos · Windows 10 & 11')).toHaveLength(2);
  });

  it('links to the password-protected dashboard', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    render(<LandingPage />);

    expect(screen.getAllByRole('link', { name: 'Web-Dashboard' })[0]?.getAttribute('href')).toBe('/dashboard');
  });
});
