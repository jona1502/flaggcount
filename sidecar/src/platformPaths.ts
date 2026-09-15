import { join, resolve } from 'node:path';

/** All persistent sidecar paths derive from one native app-data directory. */
export class AppPaths {
  readonly data: string;
  constructor(dataDirectory: string) {
    this.data = resolve(dataDirectory);
  }
  get history(): string { return join(this.data, 'round-history.json'); }
  get overlayAssets(): string { return join(this.data, 'overlay-assets'); }
  get relayKey(): string { return join(this.data, 'relay-key.json'); }
}

export function appPathsFromEnvironment(environment: NodeJS.ProcessEnv = process.env): AppPaths | null {
  const value = environment['FLAGCOUNT_DATA_DIR']?.trim();
  return value ? new AppPaths(value) : null;
}
