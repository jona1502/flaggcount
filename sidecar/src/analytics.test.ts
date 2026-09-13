import { describe, expect, it, vi } from 'vitest';
import { AnalyticsClient } from './analytics';

describe('AnalyticsClient', () => {
  it('sends nothing before explicit opt-in and stops immediately after opt-out', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const client = new AnalyticsClient({
      baseUrl: 'https://example.test',
      appVersion: '0.2.3',
      platform: 'win32',
      osRelease: '11.0.26100',
      fetch: fetcher
    });

    client.track({ version: 1, name: 'connection_succeeded' });
    expect(fetcher).not.toHaveBeenCalled();

    client.setEnabled(true);
    client.track({ version: 1, name: 'connection_succeeded' });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    const payload = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(payload).toEqual({
      appVersion: '0.2.3',
      platform: 'windows',
      osMajor: '11',
      event: { version: 1, name: 'connection_succeeded' }
    });
    expect(JSON.stringify(payload)).not.toMatch(/device|user|chat|relay|license/i);

    client.setEnabled(false);
    client.track({ version: 1, name: 'error', code: 'network' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
