import { finishLogin } from '../../../../lib/admin/authFlow';
import { adminRuntime } from '../../../../lib/admin/runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const runtime = adminRuntime();
  return runtime ? finishLogin(runtime, request) : new Response('Not found', { status: 404 });
}
