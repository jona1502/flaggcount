import 'server-only';
import { MIN_ASSERTION_SECRET_LENGTH } from '../../../../sidecar/src/web/admin/adminAssertion';
import { AdminSessions, GitHubOAuth, readAdminConfig, type AdminConfig } from '../../../../sidecar/src/web/admin/adminAuth';
import { RateLimiter } from '../../../../sidecar/src/web/licensing/rateLimiter';
import { createJsonLogger, type StructuredLogger } from '../../../../sidecar/src/web/structuredLog';

/** Everything the admin login of the web container needs; exists only while it is fully configured. */
export type AdminRuntime = {
  config: AdminConfig;
  sessions: AdminSessions;
  oauth: Pick<GitHubOAuth, 'authorizeUrl' | 'identify'>;
  /** Shared with the backend, which accepts admin requests only with a proof signed by it. */
  assertionSecret: string;
  loginLimiter: RateLimiter;
  logger: StructuredLogger;
};

/**
 * Reads either the single-operator password login or the legacy GitHub login plus
 * `ADMIN_ASSERTION_SECRET`. `null` if the selected configuration is incomplete.
 */
export function createAdminRuntime(env: Record<string, string | undefined>): AdminRuntime | null {
  const login = readAdminConfig(env);
  const assertionSecret = env['ADMIN_ASSERTION_SECRET']?.trim() ?? '';
  if (login.kind !== 'enabled' || assertionSecret.length < MIN_ASSERTION_SECRET_LENGTH) return null;
  return {
    config: login.config,
    // Server-side sessions in the memory of this process; a restart signs administrators out.
    sessions: new AdminSessions(),
    oauth: new GitHubOAuth(login.config),
    assertionSecret,
    loginLimiter: new RateLimiter({ limit: 20, windowMs: 15 * 60_000 }),
    logger: createJsonLogger()
  };
}

type Holder = { runtime?: AdminRuntime | null };
// One instance per server process, also across module reloads in development.
const holder = globalThis as typeof globalThis & { __flagcountAdminRuntime?: Holder };

export function adminRuntime(): AdminRuntime | null {
  const store = (holder.__flagcountAdminRuntime ??= {});
  if (store.runtime === undefined) store.runtime = createAdminRuntime(process.env);
  return store.runtime;
}

/** Replaces the runtime, e.g. in tests; `undefined` reads the configuration again on next use. */
export function setAdminRuntime(runtime: AdminRuntime | null | undefined): void {
  (holder.__flagcountAdminRuntime ??= {}).runtime = runtime;
}
