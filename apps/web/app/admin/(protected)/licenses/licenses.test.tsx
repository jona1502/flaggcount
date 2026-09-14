// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminLicenseDetails, AdminLicenseList } from '../../../../lib/admin/types';

const refresh = vi.fn();
const adminBackend = vi.fn();
const actionMocks = {
  createManualLicense: vi.fn(),
  setBlocked: vi.fn(),
  saveNote: vi.fn(),
  setValidity: vi.fn(),
  renewCode: vi.fn(),
  deactivateInstallation: vi.fn()
};

vi.mock('next/link', () => import('../../../../test/next-link'));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  }
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../../../../lib/admin/session', () => ({ requireAdmin: async () => ({ subject: 'github:4242', login: 'jona', csrfToken: 'csrf', expiresAt: '' }) }));
vi.mock('../../../../lib/admin/backend', () => ({ adminBackend }));
vi.mock('./actions', () => actionMocks);

const { default: LicensesPage } = await import('./page');
const { default: LicenseDetailsPage } = await import('./[id]/page');
const { LicenseActions } = await import('../../../../components/admin/LicenseActions');
const { ManualLicenseForm } = await import('../../../../components/admin/ManualLicenseForm');

const STRIPE: AdminLicenseDetails = {
  id: '11111111-2222-4333-8444-555555555555',
  reference: 'FC-1111111122',
  source: 'stripe',
  legacy: false,
  providerStatus: 'past_due',
  supportStatus: 'blocked',
  manualReason: null,
  manualValidUntil: null,
  access: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-14T10:00:00.000Z',
  providerCustomerId: 'cus_1',
  providerSubscriptionId: 'sub_1',
  currentPeriodEndsAt: '2026-10-01T10:00:00.000Z',
  scheduledCancelAt: null,
  canceledAt: null,
  revokedAt: null,
  supportNote: 'Doppelbuchung',
  hasActivationCode: true,
  codeIssuedAt: '2026-09-01T10:00:00.000Z',
  links: { customer: 'https://dashboard.stripe.com/test/customers/cus_1', subscription: 'https://dashboard.stripe.com/test/subscriptions/sub_1' },
  installations: [{ installationId: 'installation-aaaaaaaaaaaa', activatedAt: '2026-09-02T10:00:00.000Z', lastSeenAt: '2026-09-14T09:00:00.000Z' }],
  deactivatedInstallations: [
    { installationId: 'installation-oldoldoldold', activatedAt: '2026-09-01T10:00:00.000Z', lastSeenAt: '2026-09-01T11:00:00.000Z', deactivatedAt: '2026-09-02T10:00:00.000Z' }
  ],
  audit: [{ id: 'a1', adminSubject: 'github:4242', action: 'license-blocked', metadata: {}, createdAt: '2026-09-14T10:00:00.000Z' }]
};

const MANUAL: AdminLicenseDetails = {
  ...STRIPE,
  id: '99999999-2222-4333-8444-555555555555',
  reference: 'FC-9999999922',
  source: 'manual',
  providerStatus: null,
  supportStatus: 'none',
  manualReason: 'creator',
  manualValidUntil: '2026-12-31T22:59:59.000Z',
  access: { status: 'active', endsAt: '2026-12-31T22:59:59.000Z' },
  providerCustomerId: null,
  providerSubscriptionId: null,
  links: { customer: null, subscription: null },
  installations: [],
  deactivatedInstallations: [],
  audit: []
};

beforeEach(() => {
  adminBackend.mockReset();
  refresh.mockReset();
  for (const mock of Object.values(actionMocks)) mock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('license list', () => {
  it('passes filters and page to the backend and tells Stripe and manual licenses apart', async () => {
    const list: AdminLicenseList = { items: [STRIPE, MANUAL], total: 30, page: 2, pageSize: 25 };
    adminBackend.mockResolvedValue({ ok: true, status: 200, data: list });

    render(await LicensesPage({ searchParams: Promise.resolve({ q: 'FC-1111111122', source: 'stripe', status: ['x', 'y'], page: '2' }) }));

    expect(adminBackend.mock.calls[0]?.slice(1, 3)).toEqual(['GET', '/api/admin/licenses?q=FC-1111111122&source=stripe&page=2']);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1] as HTMLElement).getByText('Stripe')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('gesperrt', { exact: false })).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText('Manuell · Creator')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'FC-1111111122' }).getAttribute('href')).toBe(`/admin/licenses/${STRIPE.id}`);
    expect(screen.getByText('30 Lizenzen · Seite 2 von 2')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zurück' }).getAttribute('href')).toBe('/admin/licenses?q=FC-1111111122&source=stripe');
    expect(screen.queryByRole('link', { name: 'Weiter' })).toBeNull();
  });

  it('shows backend errors', async () => {
    adminBackend.mockResolvedValue({ ok: false, status: 503, error: 'licensing-unavailable' });

    render(await LicensesPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('alert').textContent).toBe('Der Lizenzdienst ist gerade nicht verbunden.');
  });
});

describe('license details', () => {
  it('shows Stripe data with external links, installations and the audit log', async () => {
    adminBackend.mockResolvedValue({ ok: true, status: 200, data: STRIPE });

    render(await LicenseDetailsPage({ params: Promise.resolve({ id: STRIPE.id }) }));

    expect(screen.getByRole('heading', { level: 1, name: 'FC-1111111122' })).toBeTruthy();
    expect(screen.getByText(/im Stripe-Dashboard geändert/)).toBeTruthy();
    const customer = screen.getByRole('link', { name: 'cus_1' });
    expect(customer.getAttribute('href')).toBe('https://dashboard.stripe.com/test/customers/cus_1');
    expect(customer.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('installation-aaaaaaaaaaaa')).toBeTruthy();
    expect(screen.getByText('installation-oldoldoldold')).toBeTruthy();
    expect(screen.getByText('Gesperrt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sperre aufheben' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Laufzeit speichern' })).toBeNull();
  });

  it('answers 404 for unknown licenses', async () => {
    adminBackend.mockResolvedValue({ ok: false, status: 404, error: 'not-found' });

    await expect(LicenseDetailsPage({ params: Promise.resolve({ id: 'x' }) })).rejects.toThrow('not-found');
  });
});

describe('license actions', () => {
  const props = { licenseId: STRIPE.id, manual: false, blocked: false, canEmail: true, note: null, validUntil: null, installations: STRIPE.installations };

  it('ask for confirmation before every change and do nothing when declined', async () => {
    const confirm = vi.fn(() => false);
    const user = userEvent.setup();
    render(<LicenseActions {...props} confirm={confirm} />);

    await user.click(screen.getByRole('button', { name: 'Lizenz sperren' }));
    await user.click(screen.getByRole('button', { name: 'Deaktivieren' }));
    await user.click(screen.getByRole('button', { name: 'Hinweis speichern' }));

    expect(confirm).toHaveBeenCalledTimes(3);
    expect(actionMocks.setBlocked).not.toHaveBeenCalled();
    expect(actionMocks.deactivateInstallation).not.toHaveBeenCalled();
    expect(actionMocks.saveNote).not.toHaveBeenCalled();
  });

  it('show a renewed code once and reload the license after changes', async () => {
    actionMocks.renewCode.mockResolvedValue({ ok: true, value: { code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N', mailed: false } });
    actionMocks.setBlocked.mockResolvedValue({ ok: false, message: 'Der Lizenzdienst ist gerade nicht verbunden.' });
    const user = userEvent.setup();
    render(<LicenseActions {...props} confirm={() => true} />);

    await user.click(screen.getByRole('button', { name: 'Neuen Code anzeigen' }));
    expect(await screen.findByText('FC-7K2QM-9XH4D-PZ1RT-W8C3N')).toBeTruthy();
    expect(actionMocks.renewCode).toHaveBeenCalledWith(STRIPE.id, 'show');
    expect(refresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Lizenz sperren' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Der Lizenzdienst ist gerade nicht verbunden.');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('offer validity changes only for manual licenses and email only for purchases', () => {
    render(<LicenseActions {...props} manual canEmail={false} validUntil={MANUAL.manualValidUntil} />);

    expect(screen.getByRole('button', { name: 'Laufzeit speichern' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Neuen Code per E-Mail' })).toBeNull();
  });
});

describe('manual license form', () => {
  it('creates a license after confirmation and shows its code once', async () => {
    actionMocks.createManualLicense.mockResolvedValue({ ok: true, value: { id: MANUAL.id, reference: MANUAL.reference, code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N' } });
    const confirm = vi.fn(() => true);
    const user = userEvent.setup();
    render(<ManualLicenseForm confirm={confirm} />);

    await user.selectOptions(screen.getByLabelText('Grund'), 'testing');
    await user.type(screen.getByLabelText('Interner Hinweis'), ' Testgerät ');
    await user.click(screen.getByRole('button', { name: 'Lizenz erstellen' }));

    expect(confirm).toHaveBeenCalledWith('Manuelle Lizenz (Test) ohne Ablaufdatum vergeben?');
    expect(actionMocks.createManualLicense).toHaveBeenCalledWith({ reason: 'testing', validUntil: null, note: 'Testgerät' });
    expect(await screen.findByText('FC-7K2QM-9XH4D-PZ1RT-W8C3N')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zur Lizenz' }).getAttribute('href')).toBe(`/admin/licenses/${MANUAL.id}`);
  });
});
