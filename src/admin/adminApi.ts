/** Shapes of the admin API, mirroring `sidecar/src/web/licensing/adminService.ts`. */
export type AdminSessionInfo =
  | { authenticated: false }
  | { authenticated: true; login: string; subject: string; csrfToken: string; expiresAt: string };

export type ManualReason = 'support' | 'creator' | 'testing' | 'promotion';

export type AdminLicenseSummary = {
  id: string;
  reference: string;
  source: string;
  legacy: boolean;
  providerStatus: string | null;
  supportStatus: 'none' | 'blocked';
  manualReason: ManualReason | null;
  manualValidUntil: string | null;
  access: { status: 'active' | 'grace'; endsAt: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditEntry = {
  id: string;
  adminSubject: string;
  action: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type AdminLicenseDetails = AdminLicenseSummary & {
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodEndsAt: string | null;
  scheduledCancelAt: string | null;
  canceledAt: string | null;
  revokedAt: string | null;
  supportNote: string | null;
  hasActivationCode: boolean;
  codeIssuedAt: string | null;
  links: { customer: string | null; subscription: string | null };
  installations: { installationId: string; activatedAt: string; lastSeenAt: string }[];
  audit: AuditEntry[];
};

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
    this.name = 'AdminApiError';
  }
}

let csrfToken = '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new AdminApiError(0, 'network');
  }
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new AdminApiError(response.status, body.error ?? 'unknown');
  return body as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body)
  });
}

const license = (id: string) => `/api/admin/licenses/${encodeURIComponent(id)}`;

export const adminApi = {
  async session(): Promise<AdminSessionInfo> {
    const session = await request<AdminSessionInfo>('/api/admin/session');
    csrfToken = session.authenticated ? session.csrfToken : '';
    return session;
  },
  logout: () => post<void>('/api/admin/logout', {}),
  search: (query: string) => request<AdminLicenseSummary[]>(`/api/admin/licenses?q=${encodeURIComponent(query)}`),
  details: (id: string) => request<AdminLicenseDetails>(license(id)),
  createManual: (input: { reason: ManualReason; validUntil: string | null; note: string | null }) =>
    post<{ license: AdminLicenseDetails; code: string }>('/api/admin/licenses', input),
  setValidity: (id: string, validUntil: string | null) => post<AdminLicenseDetails>(`${license(id)}/validity`, { validUntil }),
  setBlocked: (id: string, blocked: boolean) => post<AdminLicenseDetails>(`${license(id)}/block`, { blocked }),
  setNote: (id: string, note: string) => post<AdminLicenseDetails>(`${license(id)}/note`, { note }),
  renewCode: (id: string, delivery: 'show' | 'email') => post<{ code: string | null; mailed: boolean }>(`${license(id)}/code`, { delivery }),
  deactivateInstallation: (id: string, installationId: string) =>
    post<AdminLicenseDetails>(`${license(id)}/installations/${encodeURIComponent(installationId)}/deactivate`, {})
};

const MESSAGES: Record<string, string> = {
  network: 'Keine Verbindung zum Server.',
  unauthorized: 'Die Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  'invalid-csrf-token': 'Die Sitzung ist abgelaufen. Bitte lade die Seite neu.',
  'invalid-input': 'Die Eingabe ist ungültig.',
  'not-found': 'Nicht gefunden.',
  'provider-managed': 'Das wird im Stripe-Dashboard geändert, nicht hier.',
  'no-email': 'Für diese Lizenz ist keine Kauf-E-Mail-Adresse verfügbar.',
  'installation-not-found': 'Diese Installation ist nicht mehr aktiv.',
  'licensing-unavailable': 'Der Lizenzdienst ist gerade nicht verbunden.',
  'rate-limited': 'Zu viele Anfragen. Bitte warte kurz.'
};

export function describeAdminError(error: unknown): string {
  return error instanceof AdminApiError ? (MESSAGES[error.code] ?? `Fehler (${error.status || 'Netzwerk'}).`) : 'Unbekannter Fehler.';
}
