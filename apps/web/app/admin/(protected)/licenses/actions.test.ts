// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAssertionVerifier } from '../../../../../../sidecar/src/web/admin/adminAssertion';
import type { AdminRuntime } from '../../../../lib/admin/runtime';

const requireAdmin = vi.fn(async () => ({ subject: 'github:4242', login: 'jona', csrfToken: 'csrf', expiresAt: '2026-09-14T10:30:00.000Z' }));
vi.mock('../../../../lib/admin/session', () => ({ requireAdmin }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.7' }) }));

const { setAdminRuntime } = await import('../../../../lib/admin/runtime');
const actions = await import('./actions');

const SECRET = 'q'.repeat(40);
const LICENSE = '11111111-2222-4333-8444-555555555555';
const verifier = () => new AdminAssertionVerifier({ secret: SECRET, allowedSubjects: () => new Set(['github:4242']) });

function backend(respond: (path: string, body: unknown) => { status: number; body: unknown }) {
  const check = verifier();
  const calls: { method: string; path: string; body: unknown; forwardedFor: string | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      const verification = check.verify(headers['x-flagcount-admin-assertion'], { method: init?.method ?? 'GET', path: url.pathname });
      if (!verification.ok) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init?.method ?? 'GET', path: url.pathname, body, forwardedFor: headers['X-Forwarded-For'] });
      const reply = respond(url.pathname, body);
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    })
  );
  return calls;
}

beforeEach(() => {
  vi.stubEnv('BACKEND_INTERNAL_URL', 'http://server:3010');
  setAdminRuntime({ assertionSecret: SECRET } as AdminRuntime);
  requireAdmin.mockClear();
});

afterEach(() => {
  setAdminRuntime(undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('admin license actions', () => {
  it('create manual licenses through the signed admin API and return only what the page needs', async () => {
    const calls = backend(() => ({ status: 201, body: { license: { id: LICENSE, reference: 'FC-1111111122', supportNote: 'intern' }, code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N' } }));

    const result = await actions.createManualLicense({ reason: 'creator', validUntil: '2026-12-31T22:59:59.000Z', note: 'Kooperation' });

    expect(result).toEqual({ ok: true, value: { id: LICENSE, reference: 'FC-1111111122', code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N' } });
    expect(calls).toEqual([
      { method: 'POST', path: '/api/admin/licenses', body: { reason: 'creator', validUntil: '2026-12-31T22:59:59.000Z', note: 'Kooperation' }, forwardedFor: '198.51.100.7' }
    ]);
  });

  it('send every change to the matching endpoint', async () => {
    const calls = backend((path) => ({ status: 200, body: path.endsWith('/code') ? { code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N', mailed: false } : { id: LICENSE } }));

    expect(await actions.setBlocked(LICENSE, true)).toEqual({ ok: true, value: null });
    expect(await actions.saveNote(LICENSE, 'Hinweis')).toEqual({ ok: true, value: null });
    expect(await actions.setValidity(LICENSE, null)).toEqual({ ok: true, value: null });
    expect(await actions.renewCode(LICENSE, 'show')).toEqual({ ok: true, value: { code: 'FC-7K2QM-9XH4D-PZ1RT-W8C3N', mailed: false } });
    expect(await actions.deactivateInstallation(LICENSE, 'installation-aaaaaaaaaaaa')).toEqual({ ok: true, value: null });

    expect(calls.map((call) => [call.path.replace(LICENSE, ':id'), call.body])).toEqual([
      ['/api/admin/licenses/:id/block', { blocked: true }],
      ['/api/admin/licenses/:id/note', { note: 'Hinweis' }],
      ['/api/admin/licenses/:id/validity', { validUntil: null }],
      ['/api/admin/licenses/:id/code', { delivery: 'show' }],
      ['/api/admin/licenses/:id/installations/installation-aaaaaaaaaaaa/deactivate', {}]
    ]);
    expect(requireAdmin).toHaveBeenCalledTimes(10);
  });

  it('refuse invalid input before calling the backend', async () => {
    const calls = backend(() => ({ status: 200, body: {} }));

    for (const result of [
      await actions.setBlocked('../../customers', true),
      await actions.saveNote(LICENSE, 42 as unknown as string),
      await actions.setValidity(LICENSE, 'bald'),
      await actions.renewCode(LICENSE, 'sms' as 'show'),
      await actions.deactivateInstallation(LICENSE, '../x'),
      await actions.createManualLicense({ reason: 'friend', validUntil: null, note: null })
    ]) {
      expect(result).toEqual({ ok: false, message: 'Die Eingabe ist ungültig.' });
    }
    expect(calls).toEqual([]);
  });

  it('require an administrator for every action', async () => {
    backend(() => ({ status: 200, body: {} }));
    requireAdmin.mockRejectedValueOnce(new Error('redirect:/admin/login'));

    await expect(actions.setBlocked(LICENSE, true)).rejects.toThrow('redirect:/admin/login');
  });

  it('translate backend errors for administrators', async () => {
    backend(() => ({ status: 409, body: { error: 'provider-managed' } }));

    expect(await actions.setValidity(LICENSE, null)).toEqual({ ok: false, message: 'Das wird im Stripe-Dashboard geändert, nicht hier.' });
  });
});
