import path from 'node:path';

/** Repository root: the web app imports shared models and dashboard components from outside `apps/web`. */
const root = path.join(import.meta.dirname, '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted Node server in its own container; see apps/web/Dockerfile.
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  reactStrictMode: true
};

export default nextConfig;
