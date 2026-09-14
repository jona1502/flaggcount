// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from './AdminApp';
import type { AdminLicenseDetails } from './adminApi';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

const LICENSE: AdminLicenseDetails = {
  id: '11111111-2222-4333-8444-555555555555',
  reference: 'FC-1111111122',
  source: 'stripe',
  legacy: false,
  providerStatus: 'active',
  supportStatus: 'none',
  manualReason: null,
  manualValidUntil: null,
  access: { status: 'active', endsAt: null },
  createdAt: '2026-09-14T10:00:00.000Z',
  updatedAt: '2026-09-14T10:00:00.000Z',
  providerCustomerId: 'cus_1',
  providerSubscriptionId: 'sub_1',
  currentPeriodEndsAt: '2026-10-14T10:00:00.000Z',
  scheduledCancelAt: null,
  canceledAt: null,
  revokedAt: null,
  supportNote: null,
  hasActivationCode: true,
  codeIssuedAt: '2026-09-14T10:00:00.000Z',
  links: { customer: 'https://dashboard.stripe.com/test/customers/cus_1', subscription: 'https://dashboard.stripe.com/test/subscriptions/sub_1' },
  installations: [{ installationId: 'installation-aaaaaaaaaaaa', activatedAt: '2026-09-14T10:00:00.000Z', lastSeenAt: '2026-09-14T11:00:00.000Z' }],
  audit: []
};

describe('AdminApp', () => {
  it('offers only the GitHub login without a session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: false })));

    render(<AdminApp />);

    expect((await screen.findByRole('link', { name: 'Mit GitHub anmelden' })).getAttribute('href')).toBe('/admin/auth/login');
    expect(screen.queryByText('Lizenzen')).toBeNull();
  });

  it('shows license details and leaves billing changes to Stripe', async () => {
    const fetcher = vi.fn(async (path: string, _init?: RequestInit) => {
      if (path === '/api/admin/session') return json({ authenticated: true, login: 'jona', subject: 'github:4242', csrfToken: 'csrf-1', expiresAt: '2026-09-14T10:30:00.000Z' });
      if (path.startsWith('/api/admin/licenses?q=')) return json([LICENSE]);
      if (path === `/api/admin/licenses/${LICENSE.id}`) return json(LICENSE);
      return json({ error: 'not-found' }, 404);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();

    render(<AdminApp />);
    await user.click(await screen.findByRole('button', { name: /FC-1111111122/ }));

    const details = await screen.findByRole('region', { name: 'FC-1111111122' });
    expect(within(details).getByText(/im Stripe-Dashboard geändert/)).toBeTruthy();
    expect(within(details).getByRole('link', { name: 'cus_1' }).getAttribute('href')).toBe('https://dashboard.stripe.com/test/customers/cus_1');
    expect(within(details).getByText('installation-aaaaaaaaaaaa')).toBeTruthy();
    expect(within(details).queryByRole('button', { name: /Laufzeit speichern/ })).toBeNull();
  });

  it('shows the code of a new manual license once and sends the CSRF token', async () => {
    const manual: AdminLicenseDetails = { ...LICENSE, id: '99999999-2222-4333-8444-555555555555', reference: 'FC-9999999922', source: 'manual', providerStatus: null, manualReason: 'creator', providerCustomerId: null, providerSubscriptionId: null, links: { customer: null, subscription: null }, installations: [] };
    const fetcher = vi.fn(async (path: string, _init?: RequestInit) => {
      if (path === '/api/admin/session') return json({ authenticated: true, login: 'jona', subject: 'github:4242', csrfToken: 'csrf-1', expiresAt: '2026-09-14T10:30:00.000Z' });
      if (path.startsWith('/api/admin/licenses?q=')) return json([]);
      if (path === '/api/admin/licenses') return json({ license: manual, code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N' }, 201);
      return json({ error: 'not-found' }, 404);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();

    render(<AdminApp />);
    await user.selectOptions(await screen.findByLabelText('Grund'), 'creator');
    await user.click(screen.getByRole('button', { name: 'Lizenz erstellen' }));

    expect(await screen.findByText('FC-7K2QM-9XH4D-PZ1RT-W8C3N')).toBeTruthy();
    const [, init] = fetcher.mock.calls.find(([path]) => path === '/api/admin/licenses') ?? [];
    expect(init?.headers).toMatchObject({ 'X-CSRF-Token': 'csrf-1' });
    expect(JSON.parse(String(init?.body))).toEqual({ reason: 'creator', validUntil: null, note: null });
    expect(screen.getByRole('button', { name: 'Laufzeit speichern' })).toBeTruthy();
  });
});
