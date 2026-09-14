import { describe, expect, it } from 'vitest';
import { parseSavedLiveSource } from './live';

describe('saved live source', () => {
  it('migrates a legacy username to TikTok', () => {
    expect(parseSavedLiveSource(undefined, 'streamer')).toEqual({ platform: 'tiktok', channelInput: 'streamer' });
  });

  it('accepts Twitch without inventing a channel input', () => {
    expect(parseSavedLiveSource({ platform: 'twitch', channelInput: '' }, 'old')).toEqual({ platform: 'twitch', channelInput: '' });
  });

  it('rejects unknown providers', () => {
    expect(parseSavedLiveSource({ platform: 'other', channelInput: 'x' }, 'legacy')).toEqual({ platform: 'tiktok', channelInput: 'legacy' });
  });
});
