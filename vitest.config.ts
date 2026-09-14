import { defineConfig } from 'vitest/config';

export default defineConfig({
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
