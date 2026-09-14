import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_LOGIN_TTL_MS,
  ADMIN_MAX_SESSION_MS,
  AdminSessions,
  GitHubOAuth,
  GitHubOAuthError,
  adminLoginCookie,
  adminSessionCookie,
  readAdminConfig,
  type AdminConfig
} from './adminAuth';

const ENV = {
  ADMIN_GITHUB_CLIENT_ID: 'Ov23liAbCdEfGh123456',
  ADMIN_GITHUB_CLIENT_SECRET: '0123456789abcdef0123456789abcdef01234567',
  ADMIN_GITHUB_USER_IDS: '4242, 99',
  PUBLIC_BASE_URL: 'https://flagcount.example/'
};

const CONFIG: AdminConfig = {
  clientId: ENV.ADMIN_GITHUB_CLIENT_ID,
  clientSecret: ENV.ADMIN_GITHUB_CLIENT_SECRET,
  allowedUserIds: new Set(['4242']),
  publicBaseUrl: 'https://flagcount.example'
};

describe('readAdminConfig', () => {
  it('stays disabled without admin variables', () => {
    expect(readAdminConfig({ PUBLIC_BASE_URL: 'https://flagcount.example' })).toEqual({ kind: 'disabled' });
  });

  it('reads the GitHub app and the allowed account ids', () => {
    expect(readAdminConfig(ENV)).toEqual({
      kind: 'enabled',
      config: {
        clientId: 'Ov23liAbCdEfGh123456',
        clientSecret: '0123456789abcdef0123456789abcdef01234567',
        allowedUserIds: new Set(['4242', '99']),
        publicBaseUrl: 'https://flagcount.example'
      }
    });
  });

  it('names invalid variables without revealing values', () => {
    const result = readAdminConfig({
      ADMIN_GITHUB_CLIENT_ID: 'bad id',
      ADMIN_GITHUB_CLIENT_SECRET: 'short',
      ADMIN_GITHUB_USER_IDS: 'jona1502',
      PUBLIC_BASE_URL: 'http://flagcount.example'
    });

    expect(result).toEqual({
      kind: 'invalid',
      problems: [
        'ADMIN_GITHUB_CLIENT_ID has an invalid format',
        'ADMIN_GITHUB_CLIENT_SECRET has an invalid format',
        'ADMIN_GITHUB_USER_IDS must be numeric GitHub account ids separated by commas',
        'PUBLIC_BASE_URL must be an https origin without a path'
      ]
    });
    expect(readAdminConfig({ ADMIN_GITHUB_CLIENT_ID: ENV.ADMIN_GITHUB_CLIENT_ID })).toMatchObject({
      kind: 'invalid',
      problems: ['ADMIN_GITHUB_CLIENT_SECRET is missing', 'ADMIN_GITHUB_USER_IDS is missing', 'PUBLIC_BASE_URL is missing']
    });
    expect(JSON.stringify(result)).not.toContain('short');
  });
});

describe('AdminSessions', () => {
  it('ends sessions after idle time and after the maximum duration', () => {
    let now = 0;
    const sessions = new AdminSessions(() => now);
    const { token, session } = sessions.create('github:4242', 'jona');

    expect(session.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    now += ADMIN_IDLE_TIMEOUT_MS - 1;
    expect(sessions.verify(token)).toMatchObject({ subject: 'github:4242' });
    now += ADMIN_IDLE_TIMEOUT_MS + 1;
    expect(sessions.verify(token)).toBeNull();

    const long = sessions.create('github:4242', 'jona');
    for (let elapsed = 0; elapsed < ADMIN_MAX_SESSION_MS; elapsed += ADMIN_IDLE_TIMEOUT_MS / 2) {
      now += ADMIN_IDLE_TIMEOUT_MS / 2;
      sessions.verify(long.token);
    }
    now += 1;
    expect(sessions.verify(long.token)).toBeNull();
    expect(sessions.verify('unknown')).toBeNull();
    expect(sessions.verify(undefined)).toBeNull();
  });

  it('signs out a destroyed session', () => {
    const sessions = new AdminSessions();
    const { token } = sessions.create('github:4242', 'jona');

    sessions.destroy(token);

    expect(sessions.verify(token)).toBeNull();
  });

  it('accepts each login state once and only within its lifetime', () => {
    let now = 0;
    const sessions = new AdminSessions(() => now);
    const first = sessions.beginLogin();
    const second = sessions.beginLogin();

    expect(first.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sessions.finishLogin(first.state)).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(sessions.finishLogin(first.state)).toBeNull();
    now += ADMIN_LOGIN_TTL_MS;
    expect(sessions.finishLogin(second.state)).toBeNull();
    expect(sessions.finishLogin(42)).toBeNull();
  });

  it('uses host-only, secure cookies', () => {
    expect(adminSessionCookie('abc')).toBe('__Host-flagcount_admin=abc; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict');
    expect(adminLoginCookie('xyz')).toBe('__Host-flagcount_admin_login=xyz; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax');
  });
});

describe('GitHubOAuth', () => {
  it('builds the authorization URL with state and PKCE', () => {
    const url = new URL(new GitHubOAuth(CONFIG).authorizeUrl('state-1', 'challenge-1'));

    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'Ov23liAbCdEfGh123456',
      redirect_uri: 'https://flagcount.example/admin/auth/callback',
      state: 'state-1',
      code_challenge: 'challenge-1',
      code_challenge_method: 'S256',
      allow_signup: 'false'
    });
  });

  it('exchanges the code and reads the account id', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'gho_token', token_type: 'bearer' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 4242, login: 'jona' })));

    expect(await new GitHubOAuth(CONFIG, { fetch }).identify('code-1', 'verifier-1')).toEqual({ id: '4242', login: 'jona' });

    const tokenBody = new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body));
    expect(Object.fromEntries(tokenBody)).toMatchObject({ code: 'code-1', code_verifier: 'verifier-1', redirect_uri: 'https://flagcount.example/admin/auth/callback' });
    expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer gho_token' });
  });

  it('fails on GitHub errors, which arrive with HTTP 200', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'bad_verification_code' })));

    await expect(new GitHubOAuth(CONFIG, { fetch }).identify('code-1', 'verifier-1')).rejects.toBeInstanceOf(GitHubOAuthError);
  });
});
