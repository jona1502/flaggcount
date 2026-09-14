import { join } from 'node:path';
import { describeError } from '../logging';
import { createEntitlementVerifier, rawPublicKey } from '../license/signature';
import type { LogLevel } from '../protocol';
import { createTikTokConnectionFactory } from '../tiktok/tiktokConnection';
import { createLatestRelease } from './latestRelease';
import { RelayChannels } from './relayChannels';
import { SettingsStore } from './settingsStore';
import { WebController } from './webController';
import { describeBilling, readLicensingConfig, startLicensing, type RunningLicensing } from './licensing/licensingConfig';
import { createLicensingHandler } from './licensing/licensingRoutes';
import { createJsonLogger } from './structuredLog';
import { clientAddress, startWebServer } from './webServer';
import { WaitlistStore } from './waitlistStore';
import { acceptsBoardEntitlement } from './boardEntitlement';
import { AdminAssertionVerifier, readAdminApiConfig } from './admin/adminAssertion';
import { createAdminHandler } from './admin/adminRoutes';

// Entry point of the web version (Docker). Configuration comes from the environment, see .env.example.
const MIN_PASSWORD_LENGTH = 12;

function log(level: LogLevel, message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  if (level === 'info') {
    console.log(line);
  } else {
    console.error(line);
  }
}

// Keep the current round and the overlay alive even if a library callback throws.
process.on('uncaughtException', (error) => log('error', `Uncaught exception: ${describeError(error)}`));
process.on('unhandledRejection', (reason) => log('error', `Unhandled promise rejection: ${describeError(reason)}`));

async function main(): Promise<void> {
  const password = process.env['DASHBOARD_PASSWORD'] ?? '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`DASHBOARD_PASSWORD must be set and at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  const host = process.env['HOST'] ?? '0.0.0.0';
  const port = Number(process.env['PORT'] ?? 3000);
  const dataDir = process.env['DATA_DIR'] ?? 'data';
  const signApiKey = process.env['TIKTOK_SIGN_API_KEY'] || undefined;
  const releaseRepo = process.env['RELEASE_REPO'] || 'jona1502/flaggcount';

  const store = new SettingsStore(join(dataDir, 'settings.json'));
  const waitlist = new WaitlistStore(join(dataDir, 'pro-waitlist.json'));
  const controller = new WebController(createTikTokConnectionFactory({ signApiKey }), await store.load(), store, log);
  await controller.start();

  // Billing is optional: without its configuration, or while its database is down, the dashboard,
  // the overlays and the relay keep working and the license API answers 503.
  const jsonLogger = createJsonLogger();
  const licensingConfig = readLicensingConfig(process.env);
  if (licensingConfig.kind === 'invalid') {
    log('warn', `FlagCount Pro billing is disabled: ${licensingConfig.problems.join('; ')}`);
  }
  let licensing: RunningLicensing | null = null;
  const licensingHandler = createLicensingHandler({
    service: () => licensing?.service ?? null,
    required: licensingConfig.kind === 'enabled',
    logger: jsonLogger,
    clientAddress
  });
  const entitlementVerifier =
    licensingConfig.kind === 'enabled'
      ? createEntitlementVerifier({
          [licensingConfig.settings.signingKeyId]: rawPublicKey(licensingConfig.settings.signingPrivateKeyPem)
        })
      : null;
  const verifyBoardEntitlement = (value: unknown): boolean =>
    entitlementVerifier ? acceptsBoardEntitlement(value, entitlementVerifier) : false;

  // The admin API accepts only requests the Next.js web container signed for its logged-in administrators.
  // It needs the license service.
  const adminApiConfig = readAdminApiConfig(process.env);
  if (adminApiConfig.kind === 'invalid') {
    log('warn', `The admin API is disabled: ${adminApiConfig.problems.join('; ')}`);
  } else if (adminApiConfig.kind === 'enabled' && licensingConfig.kind !== 'enabled') {
    log('warn', 'The admin API needs FlagCount Pro billing to be configured; it answers 503 until then');
  }
  const adminHandler =
    adminApiConfig.kind === 'enabled'
      ? createAdminHandler({
          assertions: new AdminAssertionVerifier({ secret: adminApiConfig.config.secret, allowedSubjects: () => adminApiConfig.config.allowedSubjects }),
          admin: () => licensing?.admin ?? null,
          logger: jsonLogger,
          clientAddress
        })
      : undefined;

  const server = await startWebServer({
    backend: controller,
    password,
    latestRelease: createLatestRelease({ repo: releaseRepo }),
    releasesUrl: `https://github.com/${releaseRepo}/releases/latest`,
    relay: new RelayChannels(),
    boardRelay: new RelayChannels(),
    verifyBoardEntitlement,
    licensing: licensingHandler,
    admin: adminHandler,
    waitlist,
    host,
    port,
    onError: (error) => log('error', `Request failed: ${describeError(error)}`)
  });
  log('info', `FlagCount web server listening on ${host}:${server.port}`);

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    log('info', 'Shutting down');
    void Promise.allSettled([controller.shutdown(), server.close(), licensing?.close()]).finally(() => process.exit(0));
  };

  const connectLicensing = async (attempt = 1): Promise<void> => {
    if (licensingConfig.kind !== 'enabled' || stopping) return;
    try {
      licensing = await startLicensing(licensingConfig.settings, jsonLogger);
      log('info', `FlagCount Pro billing is enabled (${describeBilling(licensingConfig.settings.billing)})`);
    } catch (error) {
      const delayMs = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
      // Only the error class: database errors can contain connection details.
      log('error', `Starting the license service failed (${error instanceof Error ? error.name : 'error'}), retrying in ${delayMs} ms`);
      setTimeout(() => void connectLicensing(attempt + 1), delayMs).unref();
    }
  };
  void connectLicensing();
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((error: unknown) => {
  log('error', `Web server failed to start: ${describeError(error)}`);
  process.exit(1);
});
