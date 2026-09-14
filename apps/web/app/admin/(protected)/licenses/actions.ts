'use server';

import { headers } from 'next/headers';
import { adminBackend } from '../../../../lib/admin/backend';
import { adminErrorMessage } from '../../../../lib/admin/format';
import { requireAdmin } from '../../../../lib/admin/session';
import type { AdminLicenseDetails, ManualReason } from '../../../../lib/admin/types';

// Server Actions are reachable by direct POST requests: each one authenticates the administrator again and
// validates its input. Next.js only runs them for requests whose Origin matches the host. The backend
// checks the signed proof, the allowlist and the input once more, and writes the audit log.

export type ActionResult<T = null> = { ok: true; value: T } | { ok: false; message: string };

const LICENSE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTALLATION_ID = /^[A-Za-z0-9_-]{16,64}$/;
const REASONS: readonly ManualReason[] = ['support', 'creator', 'testing', 'promotion'];
const INVALID: ActionResult<never> = { ok: false, message: adminErrorMessage('invalid-input') };

const licensePath = (licenseId: string) => `/api/admin/licenses/${encodeURIComponent(licenseId)}`;

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ActionResult<T>> {
  const admin = await requireAdmin();
  const result = await adminBackend<T>(admin, method, path, { body, forwardedFor: (await headers()).get('x-forwarded-for') });
  return result.ok ? { ok: true, value: result.data } : { ok: false, message: adminErrorMessage(result.error) };
}

/** Only what the page needs: never the whole backend answer. */
const done = <T>(result: ActionResult<T>): ActionResult => (result.ok ? { ok: true, value: null } : result);

const validDate = (value: unknown): value is string | null => value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

export async function createManualLicense(input: {
  reason: string;
  validUntil: string | null;
  note: string | null;
}): Promise<ActionResult<{ id: string; reference: string; code: string }>> {
  await requireAdmin();
  if (!REASONS.includes(input.reason as ManualReason) || !validDate(input.validUntil) || (input.note !== null && typeof input.note !== 'string')) {
    return INVALID;
  }
  const result = await call<{ license: AdminLicenseDetails; code: string }>('POST', '/api/admin/licenses', {
    reason: input.reason,
    validUntil: input.validUntil,
    note: input.note
  });
  return result.ok ? { ok: true, value: { id: result.value.license.id, reference: result.value.license.reference, code: result.value.code } } : result;
}

export async function setBlocked(licenseId: string, blocked: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!LICENSE_ID.test(licenseId) || typeof blocked !== 'boolean') return INVALID;
  return done(await call('POST', `${licensePath(licenseId)}/block`, { blocked }));
}

export async function saveNote(licenseId: string, note: string): Promise<ActionResult> {
  await requireAdmin();
  if (!LICENSE_ID.test(licenseId) || typeof note !== 'string') return INVALID;
  return done(await call('POST', `${licensePath(licenseId)}/note`, { note }));
}

export async function setValidity(licenseId: string, validUntil: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (!LICENSE_ID.test(licenseId) || !validDate(validUntil)) return INVALID;
  return done(await call('POST', `${licensePath(licenseId)}/validity`, { validUntil }));
}

export async function renewCode(licenseId: string, delivery: 'show' | 'email'): Promise<ActionResult<{ code: string | null; mailed: boolean }>> {
  await requireAdmin();
  if (!LICENSE_ID.test(licenseId) || (delivery !== 'show' && delivery !== 'email')) return INVALID;
  return call('POST', `${licensePath(licenseId)}/code`, { delivery });
}

export async function deactivateInstallation(licenseId: string, installationId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!LICENSE_ID.test(licenseId) || !INSTALLATION_ID.test(installationId)) return INVALID;
  return done(await call('POST', `${licensePath(licenseId)}/installations/${encodeURIComponent(installationId)}/deactivate`, {}));
}
