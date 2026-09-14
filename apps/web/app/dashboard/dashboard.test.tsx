// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

let requestHeaders = new Headers();
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }));
vi.mock('../../components/dashboard/DashboardClient', () => ({
  DashboardClient: ({ initialAuth }: { initialAuth?: string }) => <p data-auth={initialAuth ?? 'unknown'}>dashboard</p>
}));

const { fetchDashboardSession } = await import('../../lib/dashboardSession');
const { default: DashboardPage, metadata } = await import('./page');

afterEach(() => {
  requestHeaders = new Headers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('dashboard session at the route boundary', () => {
  it('asks the backend with the browser cookie and the visitor address', async () => {
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://server:3010');
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => reply({ authenticated: true }));
    vi.stubGlobal('fetch', fetcher);

    expect(await fetchDashboardSession('flagcount_session=abc.def', '198.51.100.7')).toBe(true);
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://server:3010/api/session');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', headers: { cookie: 'flagcount_session=abc.def', 'X-Forwarded-For': '198.51.100.7' } });
  });

  it('knows a missing cookie without asking and reports an unreachable backend', async () => {
    const fetcher = vi.fn(async () => reply({ authenticated: false }));
    vi.stubGlobal('fetch', fetcher);

    expect(await fetchDashboardSession(null, null)).toBe(false);
    expect(await fetchDashboardSession('theme=dark', null)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await fetchDashboardSession('flagcount_session=expired', null)).toBe(false);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(await fetchDashboardSession('flagcount_session=abc', null)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: 'x' }, 502)));
    expect(await fetchDashboardSession('flagcount_session=abc', null)).toBeNull();
  });

  it('starts the page with the checked status and is never indexed', async () => {
    requestHeaders = new Headers({ cookie: 'flagcount_session=abc' });
    vi.stubGlobal('fetch', vi.fn(async () => reply({ authenticated: true })));
    expect(renderToStaticMarkup(await DashboardPage())).toContain('data-auth="signed-in"');

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(renderToStaticMarkup(await DashboardPage())).toContain('data-auth="unknown"');

    requestHeaders = new Headers();
    expect(renderToStaticMarkup(await DashboardPage())).toContain('data-auth="signed-out"');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
