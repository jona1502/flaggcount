import type { TwitchAuthState } from '../../../shared/live';

export const TWITCH_SCOPE = 'user:read:chat';
const ID_BASE = 'https://id.twitch.tv/oauth2';

export type TwitchCredentials = { accessToken: string; refreshToken: string; expiresAt: string };
export type TwitchIdentity = { channelId: string; login: string; displayName: string };
export type TwitchDeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  intervalMs: number;
};

export class TwitchOAuthError extends Error {
  constructor(readonly code: 'pending' | 'denied' | 'expired' | 'invalid-token' | 'network') {
    super(code);
  }
}

type Fetch = typeof fetch;

async function json(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => ({}));
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

export class TwitchOAuthClient {
  constructor(private readonly clientId: string, private readonly request: Fetch = fetch, private readonly now = Date.now) {}

  async startDeviceAuthorization(): Promise<TwitchDeviceAuthorization> {
    const body = new URLSearchParams({ client_id: this.clientId, scopes: TWITCH_SCOPE });
    const response = await this.request(`${ID_BASE}/device`, { method: 'POST', body });
    const value = await json(response);
    if (!response.ok) throw new TwitchOAuthError('network');
    if (typeof value['device_code'] !== 'string' || typeof value['user_code'] !== 'string' ||
        typeof value['verification_uri'] !== 'string' || typeof value['expires_in'] !== 'number') {
      throw new TwitchOAuthError('network');
    }
    return {
      deviceCode: value['device_code'],
      userCode: value['user_code'],
      verificationUri: value['verification_uri'],
      expiresAt: new Date(this.now() + value['expires_in'] * 1000).toISOString(),
      intervalMs: Math.max(1000, (typeof value['interval'] === 'number' ? value['interval'] : 5) * 1000)
    };
  }

  async exchangeDeviceCode(deviceCode: string): Promise<TwitchCredentials> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      scopes: TWITCH_SCOPE,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
    return this.tokenRequest(body);
  }

  async refresh(refreshToken: string): Promise<TwitchCredentials> {
    return this.tokenRequest(new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }));
  }

  async revoke(accessToken: string): Promise<void> {
    const response = await this.request(`${ID_BASE}/revoke`, {
      method: 'POST', body: new URLSearchParams({ client_id: this.clientId, token: accessToken })
    });
    if (!response.ok) throw new TwitchOAuthError('network');
  }

  private async tokenRequest(body: URLSearchParams): Promise<TwitchCredentials> {
    const response = await this.request(`${ID_BASE}/token`, { method: 'POST', body });
    const value = await json(response);
    if (!response.ok) {
      const message = String(value['message'] ?? '').toLowerCase();
      if (message.includes('authorization_pending')) throw new TwitchOAuthError('pending');
      if (message.includes('denied')) throw new TwitchOAuthError('denied');
      if (message.includes('expired') || message.includes('invalid device')) throw new TwitchOAuthError('expired');
      throw new TwitchOAuthError('invalid-token');
    }
    if (typeof value['access_token'] !== 'string' || typeof value['refresh_token'] !== 'string' || typeof value['expires_in'] !== 'number') {
      throw new TwitchOAuthError('network');
    }
    const scopes = Array.isArray(value['scope']) ? value['scope'] : [];
    if (!scopes.includes(TWITCH_SCOPE)) throw new TwitchOAuthError('denied');
    return { accessToken: value['access_token'], refreshToken: value['refresh_token'], expiresAt: new Date(this.now() + value['expires_in'] * 1000).toISOString() };
  }

  async validate(accessToken: string): Promise<TwitchIdentity> {
    const response = await this.request(`${ID_BASE}/validate`, { headers: { Authorization: `OAuth ${accessToken}` } });
    const value = await json(response);
    if (!response.ok || value['client_id'] !== this.clientId || typeof value['user_id'] !== 'string' || typeof value['login'] !== 'string') {
      throw new TwitchOAuthError('invalid-token');
    }
    const scopes = Array.isArray(value['scopes']) ? value['scopes'] : [];
    if (!scopes.includes(TWITCH_SCOPE)) throw new TwitchOAuthError('denied');
    return { channelId: value['user_id'], login: value['login'], displayName: typeof value['display_name'] === 'string' ? value['display_name'] : value['login'] };
  }
}

export function authState(identity: TwitchIdentity): TwitchAuthState {
  return { status: 'signed-in', ...identity };
}
