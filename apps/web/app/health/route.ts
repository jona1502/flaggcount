/** Liveness of the web container; independent of the backend, so a backend outage does not restart it. */
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
