import path from 'node:path';

/** Repository root: the web app imports shared models and dashboard components from outside `apps/web`. */
const root = path.join(import.meta.dirname, '../..');

const development = process.env.NODE_ENV === 'development';

/**
 * Content Security Policy of the website. Overlays and API responses come from the backend with their own
 * headers. Prerendered pages carry no nonce, so inline scripts of the Next.js runtime need 'unsafe-inline';
 * `next dev` additionally needs eval and a WebSocket for hot reloading.
 */
export const WEBSITE_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${development ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

export const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: WEBSITE_CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' }
];

export const ADMIN_HEADERS = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Referrer-Policy', value: 'no-referrer' }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted Node server in its own container; see apps/web/Dockerfile.
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Admin pages show personal support data, the dashboard controls a live stream: never cache or index them.
      { source: '/admin/:path*', headers: ADMIN_HEADERS },
      { source: '/dashboard', headers: ADMIN_HEADERS }
    ];
  }
};

export default nextConfig;
