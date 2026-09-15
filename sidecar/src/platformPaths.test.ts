import { describe, expect, it } from 'vitest';
import { AppPaths, appPathsFromEnvironment } from './platformPaths';

describe('AppPaths', () => {
  it('joins every child with the native path separator', () => {
    const paths = new AppPaths('relative-data');
    expect(paths.history).toBeTruthy();
    expect(paths.history.endsWith('round-history.json')).toBe(true);
    expect(paths.overlayAssets.startsWith(paths.data)).toBe(true);
  });
  it('is disabled without an explicit native data directory', () => {
    expect(appPathsFromEnvironment({})).toBeNull();
  });
});
