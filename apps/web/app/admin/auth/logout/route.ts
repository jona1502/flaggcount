import { logout } from '../../../../lib/admin/authFlow';
import { adminRuntime } from '../../../../lib/admin/runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const runtime = adminRuntime();
  return runtime ? logout(runtime, request) : new Response('Not found', { status: 404 });
}
