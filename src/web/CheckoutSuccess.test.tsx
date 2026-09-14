// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckoutSuccess } from './CheckoutSuccess';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CheckoutSuccess', () => {
  it('promises the activation code by email without unlocking anything itself', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    render(<CheckoutSuccess />);

    expect(screen.getByRole('heading', { name: 'Danke für deinen Kauf!' })).toBeTruthy();
    expect(screen.getByText(/Aktivierungscode an die E-Mail-Adresse/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Für Windows herunterladen' }).getAttribute('href')).toBe('/download');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
