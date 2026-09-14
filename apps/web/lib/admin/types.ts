/** Shapes of the backend admin API, mirroring `sidecar/src/web/licensing/adminService.ts`. */
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

export type InstallationView = { installationId: string; activatedAt: string; lastSeenAt: string };

export type AuditEntryView = {
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
  installations: InstallationView[];
  deactivatedInstallations: (InstallationView & { deactivatedAt: string })[];
  audit: AuditEntryView[];
};

export type AdminLicenseList = {
  items: AdminLicenseSummary[];
  total: number;
  page: number;
  pageSize: number;
};
