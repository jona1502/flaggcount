import { describe, expect, it } from 'vitest';
import { describeError } from './logging';

describe('describeError', () => {
  it.each([
    [new Error('user secretstreamer is offline'), 'Error'],
    [new TypeError('cannot read chat of secretstreamer'), 'TypeError'],
    [Object.assign(new Error('getaddrinfo ENOTFOUND www.tiktok.com'), { code: 'ENOTFOUND' }), 'Error (ENOTFOUND)'],
    [Object.assign(new Error('boom'), { code: 'user@secret' }), 'Error'],
    ['secretstreamer', 'string'],
    [undefined, 'undefined']
  ])('describes %o as %j without leaking details', (error, expected) => {
    expect(describeError(error)).toBe(expected);
  });
});
