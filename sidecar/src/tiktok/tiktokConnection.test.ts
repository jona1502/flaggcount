import { describe, expect, it } from 'vitest';
import {
  ConnectTimeoutError,
  InvalidResponseCompositeError,
  InvalidUniqueIdError,
  UserOfflineError
} from 'tiktok-live-connector';
import { LiveConnectionError } from './errors';
import { classifyTikTokError } from './tiktokConnection';

function networkError(code: string): Error {
  return Object.assign(new Error(`network failure ${code}`), { code });
}

describe('classifyTikTokError', () => {
  it.each([
    [new InvalidUniqueIdError('bad'), 'invalid-username'],
    [new UserOfflineError('offline'), 'user-offline'],
    [new ConnectTimeoutError('timeout'), 'network'],
    [networkError('ENOTFOUND'), 'network'],
    [new Error('wrapped', { cause: networkError('ECONNRESET') }), 'network'],
    [new InvalidResponseCompositeError({ routeId: 'fetchRoomId', requestErrs: [networkError('EAI_AGAIN')] }), 'network'],
    [new InvalidResponseCompositeError({ routeId: 'fetchRoomId', requestErrs: [new Error('404')] }), 'user-not-found'],
    [new Error('something else'), 'unknown'],
    ['not an error', 'unknown']
  ])('classifies %o as %s', (error, code) => {
    expect(classifyTikTokError(error).code).toBe(code);
  });

  it('keeps already classified errors', () => {
    const error = new LiveConnectionError('rate-limited', 'Slow down');
    expect(classifyTikTokError(error)).toBe(error);
  });
});
