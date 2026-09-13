import { FREE_ENTITLEMENTS, entitlementsFor, isFeature, type Entitlements, type Feature } from './entitlements';

export const ENTITLEMENT_VERSION = 1;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Online refresh at least this often. */
export const REFRESH_INTERVAL_MS = 7 * DAY_MS;
/** Pro keeps working this long after the last successful online check. */
export const OFFLINE_GRACE_MS = 30 * DAY_MS;
/** A local clock that runs behind the server by more than this asks for an online check, never a lockout. */
export const CLOCK_SKEW_TOLERANCE_MS = DAY_MS;

export type EntitlementStatus = 'active' | 'grace';

/** Issued by the license service, signed with Ed25519; only the public key ships with the app. */
export type SignedEntitlement = {
  version: typeof ENTITLEMENT_VERSION;
  /** Selects the public key, so signing keys can be rotated. */
  keyId: string;
  licenseId: string;
  installationId: string;
  plan: 'pro';
  status: EntitlementStatus;
  issuedAt: string;
  refreshAfter: string;
  expiresAt: string;
  features: string[];
  signature: string;
};

export type UnsignedEntitlement = Omit<SignedEntitlement, 'signature'>;

export type LicenseStatus = 'none' | 'active' | 'grace' | 'expired' | 'invalid';

export type LicenseErrorCode =
  | 'invalid-code'
  | 'license-inactive'
  | 'installation-limit'
  | 'invalid-installation'
  | 'rate-limited'
  | 'network'
  | 'unavailable'
  | 'invalid-response'
  | 'secret-storage';

/** What the UI shows about the license; never contains the activation code or secret. */
export type LicenseInfo = {
  plan: 'free' | 'pro';
  status: LicenseStatus;
  /** Short, non-secret reference to quote in support requests. */
  reference: string | null;
  expiresAt: string | null;
  refreshAfter: string | null;
  needsRefresh: boolean;
  lastError: LicenseErrorCode | null;
  features: Feature[];
};

/** Another computer that uses the same license, shown when the installation limit is reached. */
export type InstallationSummary = {
  installationId: string;
  activatedAt: string;
  lastSeenAt: string;
};

export type LicenseState = LicenseInfo & {
  /** Only filled after an activation failed because all installations are in use. */
  installations: InstallationSummary[];
};

export const FREE_LICENSE: LicenseInfo = Object.freeze({
  plan: 'free',
  status: 'none',
  reference: null,
  expiresAt: null,
  refreshAfter: null,
  needsRefresh: false,
  lastError: null,
  features: []
}) as LicenseInfo;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const MAX_FEATURES = 32;

const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));

/** The exact bytes that are signed. An array keeps the order independent of JSON key order. */
export function entitlementSigningPayload(entitlement: UnsignedEntitlement): string {
  return JSON.stringify([
    'flagcount-entitlement',
    entitlement.version,
    entitlement.keyId,
    entitlement.licenseId,
    entitlement.installationId,
    entitlement.plan,
    entitlement.status,
    entitlement.issuedAt,
    entitlement.refreshAfter,
    entitlement.expiresAt,
    entitlement.features
  ]);
}

export function parseSignedEntitlement(value: unknown): SignedEntitlement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { version, keyId, licenseId, installationId, plan, status, issuedAt, refreshAfter, expiresAt, features, signature } =
    record;
  const valid =
    version === ENTITLEMENT_VERSION &&
    typeof keyId === 'string' &&
    ID_PATTERN.test(keyId) &&
    typeof licenseId === 'string' &&
    ID_PATTERN.test(licenseId) &&
    typeof installationId === 'string' &&
    ID_PATTERN.test(installationId) &&
    plan === 'pro' &&
    (status === 'active' || status === 'grace') &&
    isTimestamp(issuedAt) &&
    isTimestamp(refreshAfter) &&
    isTimestamp(expiresAt) &&
    Array.isArray(features) &&
    features.length <= MAX_FEATURES &&
    features.every((feature) => typeof feature === 'string' && feature.length <= 40) &&
    typeof signature === 'string' &&
    SIGNATURE_PATTERN.test(signature);
  if (!valid) return null;
  return {
    version,
    keyId,
    licenseId,
    installationId,
    plan,
    status,
    issuedAt,
    refreshAfter,
    expiresAt,
    features: [...(features as string[])],
    signature
  };
}

/** A short support reference that identifies the license without being able to activate it. */
export function licenseReference(licenseId: string): string {
  return `FC-${licenseId.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase()}`;
}

export type EntitlementVerifier = (payload: string, signature: string, keyId: string) => boolean;

export type LicenseEvaluation = {
  info: LicenseInfo;
  entitlements: Entitlements;
};

/**
 * Decides what a stored entitlement unlocks right now. Missing, forged, foreign or expired
 * entitlements fall back to Free; a clock that looks wrong only asks for an online check.
 */
export function evaluateEntitlement(
  entitlement: SignedEntitlement | null,
  context: { installationId: string; now: number; verify: EntitlementVerifier; lastError?: LicenseErrorCode | null }
): LicenseEvaluation {
  const lastError = context.lastError ?? null;
  if (!entitlement) {
    return { info: { ...FREE_LICENSE, lastError }, entitlements: FREE_ENTITLEMENTS };
  }

  const reference = licenseReference(entitlement.licenseId);
  const base = { ...FREE_LICENSE, reference, lastError, expiresAt: entitlement.expiresAt, refreshAfter: entitlement.refreshAfter };
  let authentic = false;
  try {
    authentic = context.verify(entitlementSigningPayload(entitlement), entitlement.signature, entitlement.keyId);
  } catch {
    authentic = false;
  }
  if (!authentic || entitlement.installationId !== context.installationId) {
    return { info: { ...base, status: 'invalid', expiresAt: null, refreshAfter: null, needsRefresh: true }, entitlements: FREE_ENTITLEMENTS };
  }

  const expiresAt = Date.parse(entitlement.expiresAt);
  if (context.now >= expiresAt) {
    return { info: { ...base, status: 'expired', needsRefresh: true }, entitlements: FREE_ENTITLEMENTS };
  }

  const clockBehind = Date.parse(entitlement.issuedAt) - context.now > CLOCK_SKEW_TOLERANCE_MS;
  const entitlements = entitlementsFor('pro', entitlement.features);
  return {
    info: {
      ...base,
      plan: 'pro',
      status: entitlement.status,
      needsRefresh: clockBehind || context.now >= Date.parse(entitlement.refreshAfter),
      features: [...entitlements.features].filter(isFeature)
    },
    entitlements
  };
}

export const FREE_LICENSE_STATE: LicenseState = Object.freeze({ ...FREE_LICENSE, installations: [] }) as LicenseState;
