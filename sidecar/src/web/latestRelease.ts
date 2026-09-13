export type ReleaseInfo = {
  version: string;
  downloadUrl: string;
  sizeBytes: number | null;
  publishedAt: string | null;
  pageUrl: string;
};

export type LatestReleaseOptions = {
  /** GitHub repository as `owner/name`; it must be public. */
  repo: string;
  fetch?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
};

const DEFAULT_TTL_MS = 10 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5000;

type GitHubAsset = { name?: unknown; browser_download_url?: unknown; size?: unknown };
type GitHubRelease = { tag_name?: unknown; html_url?: unknown; published_at?: unknown; assets?: unknown };

/** Picks the NSIS installer from a GitHub release; `null` if the release has none. */
export function parseRelease(data: unknown): ReleaseInfo | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const release = data as GitHubRelease;
  const assets = Array.isArray(release.assets) ? (release.assets as GitHubAsset[]) : [];
  const installer = assets.find(
    (asset) =>
      typeof asset.name === 'string' && asset.name.endsWith('-setup.exe') && typeof asset.browser_download_url === 'string'
  );
  if (!installer || typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') {
    return null;
  }
  return {
    version: release.tag_name.replace(/^app-v/, ''),
    downloadUrl: installer.browser_download_url as string,
    sizeBytes: typeof installer.size === 'number' ? installer.size : null,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    pageUrl: release.html_url
  };
}

/**
 * Looks up the newest release without a token. GitHub allows only 60 anonymous API calls per hour,
 * so the result is cached, and the last known release is kept while GitHub is unreachable.
 */
export function createLatestRelease(options: LatestReleaseOptions): () => Promise<ReleaseInfo | null> {
  const fetchRelease = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  let cached: ReleaseInfo | null = null;
  let freshUntil = 0;
  let pending: Promise<ReleaseInfo | null> | null = null;

  const load = async (): Promise<ReleaseInfo | null> => {
    let release: ReleaseInfo | null = null;
    try {
      const response = await fetchRelease(`https://api.github.com/repos/${options.repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FlagCount-Web' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      release = response.ok ? parseRelease(await response.json()) : null;
    } catch {
      // Keep the last known release.
    }
    if (release) {
      cached = release;
      freshUntil = now() + ttlMs;
    } else {
      freshUntil = now() + Math.min(ttlMs, RETRY_AFTER_FAILURE_MS);
    }
    return cached;
  };

  return () => {
    if (now() < freshUntil) {
      return Promise.resolve(cached);
    }
    pending ??= load().finally(() => {
      pending = null;
    });
    return pending;
  };
}
