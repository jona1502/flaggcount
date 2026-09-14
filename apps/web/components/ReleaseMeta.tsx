import { fetchLatestRelease } from '../lib/backend';
import { RELEASES_URL, formatSize } from '../lib/site';

/** Version and size of the newest installer, rendered on the server; the download works without them. */
export async function ReleaseMeta() {
  const release = await fetchLatestRelease();
  const details = [release ? `Version ${release.version}` : 'Kostenlos', release?.sizeBytes ? formatSize(release.sizeBytes) : null, 'Windows 10 & 11']
    .filter(Boolean)
    .join(' · ');

  return (
    <p className="download-meta">
      <span>{details}</span>
      <a href={release?.pageUrl ?? RELEASES_URL} target="_blank" rel="noreferrer">
        Versionshinweise auf GitHub
      </a>
    </p>
  );
}
