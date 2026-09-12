import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'sidecar/src/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true
  }
});
