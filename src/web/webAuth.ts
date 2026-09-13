export type LoginResult =
  | { status: 'signed-in' }
  | { status: 'invalid-password' }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'unavailable' };

const DEFAULT_LOCKOUT_SECONDS = 60;

function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/** Whether the browser holds a valid session cookie (the cookie itself is HttpOnly). */
export async function fetchSession(): Promise<boolean> {
  const response = await fetch('/api/session');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const session = (await response.json()) as { authenticated?: unknown };
  return session.authenticated === true;
}

export async function login(password: string): Promise<LoginResult> {
  let response: Response;
  try {
    response = await postJson('/api/login', { password });
  } catch {
    return { status: 'unavailable' };
  }
  if (response.ok) {
    return { status: 'signed-in' };
  }
  if (response.status === 401) {
    return { status: 'invalid-password' };
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    return { status: 'locked', retryAfterSeconds: seconds > 0 ? seconds : DEFAULT_LOCKOUT_SECONDS };
  }
  return { status: 'unavailable' };
}

export async function logout(): Promise<void> {
  await postJson('/api/logout', {});
}
