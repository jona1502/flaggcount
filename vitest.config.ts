import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Next.js resolves `server-only` itself; outside of it the package throws on import.
      'server-only': fileURLToPath(new URL('./apps/web/test/server-only.ts', import.meta.url))
    }
  },
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'sidecar/src/**/*.test.ts',
      'shared/**/*.test.ts',
      'apps/web/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts'
    ],
    exclude: ['**/node_modules/**', 'apps/web/.next/**'],
    environment: 'node',
    passWithNoTests: true
  }
});
