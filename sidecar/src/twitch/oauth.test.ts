import { describe, expect, it, vi } from 'vitest';
import { TWITCH_SCOPE, TwitchOAuthClient } from './oauth';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('TwitchOAuthClient', () => {
  it('starts the device flow with only the chat-read scope', async () => {
    const request = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response({ device_code: 'device', user_code: 'ABCD', verification_uri: 'https://www.twitch.tv/activate', expires_in: 600, interval: 2 }));
    const client = new TwitchOAuthClient('client', request as typeof fetch, () => 0);
    await expect(client.startDeviceAuthorization()).resolves.toEqual({ deviceCode: 'device', userCode: 'ABCD', verificationUri: 'https://www.twitch.tv/activate', expiresAt: '1970-01-01T00:10:00.000Z', intervalMs: 2000 });
    expect(String(request.mock.calls[0]?.[1]?.body)).toContain(`scopes=${encodeURIComponent(TWITCH_SCOPE)}`);
  });

  it('recognizes pending authorization without exposing response data', async () => {
    const client = new TwitchOAuthClient('client', (async () => response({ status: 400, message: 'authorization_pending' }, 400)) as typeof fetch);
    await expect(client.exchangeDeviceCode('secret-device-code')).rejects.toMatchObject({ code: 'pending' });
  });

  it('requires the exact permission and validates the account identity', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(response({ access_token: 'access', refresh_token: 'refresh', expires_in: 100, scope: [TWITCH_SCOPE] }))
      .mockResolvedValueOnce(response({ client_id: 'client', user_id: '42', login: 'streamer', scopes: [TWITCH_SCOPE] }));
    const client = new TwitchOAuthClient('client', request as typeof fetch, () => 0);
    await expect(client.exchangeDeviceCode('device')).resolves.toEqual({ accessToken: 'access', refreshToken: 'refresh', expiresAt: '1970-01-01T00:01:40.000Z' });
    await expect(client.validate('access')).resolves.toEqual({ channelId: '42', login: 'streamer', displayName: 'streamer' });
  });

  it('rejects tokens without user:read:chat', async () => {
    const client = new TwitchOAuthClient('client', (async () => response({ access_token: 'a', refresh_token: 'r', expires_in: 100, scope: [] })) as typeof fetch);
    await expect(client.exchangeDeviceCode('device')).rejects.toMatchObject({ code: 'denied' });
  });
});
