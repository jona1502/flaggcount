import { describe, expect, it } from 'vitest';
// @ts-expect-error The Next.js config is plain JavaScript.
import nextConfig, { WEBSITE_CSP } from './next.config.mjs';

describe('next.config', () => {
  it('sends security headers with a strict CSP on every page', async () => {
    const [rule] = await nextConfig.headers();
    const headers = Object.fromEntries(rule.headers.map(({ key, value }: { key: string; value: string }) => [key, value]));

    expect(rule.source).toBe('/:path*');
    expect(headers['Content-Security-Policy']).toBe(WEBSITE_CSP);
    expect(WEBSITE_CSP).toContain("frame-ancestors 'none'");
    expect(WEBSITE_CSP).toContain("connect-src 'self'");
    expect(WEBSITE_CSP).not.toContain('unsafe-eval');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(nextConfig.poweredByHeader).toBe(false);

    const rules = await nextConfig.headers();
    const admin = rules.find((candidate: { source: string }) => candidate.source === '/admin/:path*');
    expect(admin.headers).toEqual(expect.arrayContaining([{ key: 'Cache-Control', value: 'no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }]));
    expect(rules.find((candidate: { source: string }) => candidate.source === '/dashboard').headers).toEqual(admin.headers);
    expect(nextConfig.output).toBe('standalone');
  });
});
