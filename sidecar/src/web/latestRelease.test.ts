import { describe, expect, it, vi } from 'vitest';
import { createLatestRelease, parseRelease } from './latestRelease';

const GITHUB_RELEASE = {
  tag_name: 'app-v0.2.0',
  html_url: 'https://github.com/jona1502/flaggcount/releases/tag/app-v0.2.0',
  published_at: '2026-09-13T14:30:00Z',
  assets: [
    { name: 'latest.json', browser_download_url: 'https://example.test/latest.json', size: 400 },
    { name: 'FlagCount_0.2.0_x64-setup.exe.sig', browser_download_url: 'https://example.test/setup.exe.sig', size: 420 },
    { name: 'FlagCount_0.2.0_x64-setup.exe', browser_download_url: 'https://example.test/setup.exe', size: 27_798_807 }
  ]
};

function respond(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('parseRelease', () => {
  it('picks the installer and strips the tag prefix', () => {
    expect(parseRelease(GITHUB_RELEASE)).toEqual({
      version: '0.2.0',
      downloadUrl: 'https://example.test/setup.exe',
      sizeBytes: 27_798_807,
      publishedAt: '2026-09-13T14:30:00Z',
      pageUrl: 'https://github.com/jona1502/flaggcount/releases/tag/app-v0.2.0'
    });
  });

  it('ignores releases without an installer', () => {
    expect(parseRelease({ ...GITHUB_RELEASE, assets: [] })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe('createLatestRelease', () => {
  it('caches the release until it is stale', async () => {
    let clock = 0;
    const fetchRelease = vi.fn<typeof fetch>(async () => respond(GITHUB_RELEASE));
    const latest = createLatestRelease({ repo: 'owner/repo', fetch: fetchRelease, now: () => clock, ttlMs: 1000 });

    expect((await latest())?.version).toBe('0.2.0');
    await latest();
    expect(fetchRelease).toHaveBeenCalledTimes(1);
    expect(fetchRelease.mock.calls[0]?.[0]).toBe('https://api.github.com/repos/owner/repo/releases/latest');

    clock = 1001;
    await latest();
    expect(fetchRelease).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known release while GitHub fails', async () => {
    let clock = 0;
    const fetchRelease = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(GITHUB_RELEASE))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(respond({ message: 'rate limited' }, false));
    const latest = createLatestRelease({ repo: 'owner/repo', fetch: fetchRelease, now: () => clock, ttlMs: 1000 });

    await latest();
    clock = 5_000;
    expect((await latest())?.version).toBe('0.2.0');
    clock = 100_000;
    expect((await latest())?.version).toBe('0.2.0');
  });

  it('returns null before the first release exists', async () => {
    const latest = createLatestRelease({ repo: 'owner/repo', fetch: async () => respond({}, false) });

    expect(await latest()).toBeNull();
  });
});
