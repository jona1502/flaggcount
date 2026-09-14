import { passwordLogin, startLogin } from '../../../../lib/admin/authFlow';
import { adminRuntime } from '../../../../lib/admin/runtime';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const runtime = adminRuntime();
  return runtime && !runtime.config.email ? startLogin(runtime, request) : new Response('Not found', { status: 404 });
}

export async function POST(request: Request) {
  const runtime = adminRuntime();
  return runtime?.config.email ? passwordLogin(runtime, request) : new Response('Not found', { status: 404 });
}
