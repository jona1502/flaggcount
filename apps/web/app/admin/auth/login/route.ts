import { startLogin } from '../../../../lib/admin/authFlow';
import { adminRuntime } from '../../../../lib/admin/runtime';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const runtime = adminRuntime();
  return runtime ? startLogin(runtime, request) : new Response('Not found', { status: 404 });
}
