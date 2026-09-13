import { createInterface } from 'node:readline';
import { SidecarApp } from './app';
import { LicenseManager } from './license/licenseManager';
import { licensePublicKeys } from './license/publicKeys';
import { createEntitlementVerifier } from './license/signature';
import { describeError } from './logging';
import { PROTOCOL_VERSION, parseCommand, serializeEvent, type LogLevel, type SidecarEvent } from './protocol';
import { startBoardRelays, type BoardRelays } from './relay/boardRelay';
import { startOverlayRelay, type OverlayRelay } from './relay/overlayRelay';
import { DEFAULT_RELAY_URL } from './relay/relayChannel';
import { loadOrCreateRelayKey } from './relay/relayKey';
import { DEFAULT_OVERLAY_PORT, createSessionToken, startLocalServer } from './server/localServer';
import { createTikTokConnection } from './tiktok/tiktokConnection';
import { AnalyticsClient } from './analytics';

declare const __FLAGCOUNT_VERSION__: string;

// stdout is reserved for protocol events; route all console output to stderr.
const writeStdout = process.stdout.write.bind(process.stdout);
console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);

function send(event: SidecarEvent): void {
  writeStdout(serializeEvent(event));
}

function log(level: LogLevel, message: string): void {
  send({ type: 'log', level, message });
}

// A broken pipe means the Tauri app is gone: nobody is left to serve.
process.stdout.on('error', () => process.exit(0));

// Keep the current round and the overlay alive even if a library callback throws.
process.on('uncaughtException', (error) => log('error', `Uncaught exception: ${describeError(error)}`));
process.on('unhandledRejection', (reason) => log('error', `Unhandled promise rejection: ${describeError(reason)}`));

/**
 * Mirrors the overlay to the FlagCount server, so streaming tools that cannot open local
 * addresses (e.g. TikTok LIVE Studio) get a public URL. Tauri passes the data directory.
 */
type RunningRelays = { classic: OverlayRelay; boards: BoardRelays; stop(): void };

async function startRelay(app: SidecarApp): Promise<RunningRelays | null> {
  const dataDir = process.env['FLAGCOUNT_DATA_DIR'];
  if (!dataDir) {
    return null;
  }
  let key: string;
  try {
    key = await loadOrCreateRelayKey(dataDir);
  } catch (error) {
    log('warn', `Online overlay unavailable: the relay key could not be loaded (${describeError(error)})`);
    return null;
  }
  const baseUrl = process.env['FLAGCOUNT_RELAY_URL'] || DEFAULT_RELAY_URL;
  const classic = startOverlayRelay({
    baseUrl,
    key,
    source: {
      getVotes: () => app.getVotes(),
      subscribeVotes: (listener) => app.subscribeVotes(listener),
      getOverlaySettings: () => app.getOverlaySettings(),
      subscribeOverlaySettings: (listener) => app.subscribeOverlaySettings(listener)
    },
    log
  });
  const boards = startBoardRelays({
    baseUrl,
    masterKey: key,
    source: app,
    entitlement: () => app.getSignedEntitlement(),
    onUrls: (urls) => send({ type: 'overlayUrls', urls }),
    log
  });
  return {
    classic,
    boards,
    stop: () => {
      classic.stop();
      boards.stop();
    }
  };
}

async function main(): Promise<void> {
  const serviceUrl = process.env['FLAGCOUNT_RELAY_URL'] || DEFAULT_RELAY_URL;
  const appVersion = typeof __FLAGCOUNT_VERSION__ === 'string' ? __FLAGCOUNT_VERSION__ : '0.0.0';
  const analytics = new AnalyticsClient({ baseUrl: serviceUrl, appVersion });
  // The license service runs on the same FlagCount server as the online overlay.
  const license = new LicenseManager({
    send,
    baseUrl: process.env['FLAGCOUNT_LICENSE_URL'] || DEFAULT_RELAY_URL,
    verify: createEntitlementVerifier(licensePublicKeys()),
    onEntitlements: (entitlements) => app.setEntitlements(entitlements),
    log
  });
  const app = new SidecarApp(createTikTokConnection, send, {
    license,
    onTelemetry: (event) => analytics.track(event),
    onTelemetryEnabled: (enabled) => analytics.setEnabled(enabled)
  });

  // Fresh secret per app start, shared with Tauri only over the private stdout pipe.
  const token = createSessionToken();
  const server = await startLocalServer(
    {
      token,
      getState: () => app.getState(),
      getVotes: () => app.getVotes(),
      subscribeVotes: (listener) => app.subscribeVotes(listener),
      getOverlaySettings: () => app.getOverlaySettings(),
      subscribeOverlaySettings: (listener) => app.subscribeOverlaySettings(listener),
      getBoard: (scope) => app.getBoard(scope),
      subscribeBoard: (listener) => app.subscribeBoard(listener),
      onOverlayOpened: () => analytics.track({ version: 1, name: 'overlay_opened', kind: 'local' })
    },
    DEFAULT_OVERLAY_PORT
  );
  if (server.port !== DEFAULT_OVERLAY_PORT) {
    log('warn', `Port ${DEFAULT_OVERLAY_PORT} is in use; the overlay uses port ${server.port} instead`);
  }
  const relay = await startRelay(app);

  const commands = createInterface({ input: process.stdin });

  commands.on('line', (line) => {
    const command = parseCommand(line);
    if (!command) {
      log('warn', 'Ignoring invalid command');
      return;
    }
    app.handleCommand(command).catch((error: unknown) => {
      log('error', `Command ${command.type} failed: ${describeError(error)}`);
    });
  });

  // The sidecar only lives as long as the Tauri app keeps its stdin open.
  commands.on('close', () => {
    relay?.stop();
    void Promise.allSettled([app.shutdown(), server.close()]).finally(() => process.exit(0));
  });

  send({
    type: 'ready',
    protocolVersion: PROTOCOL_VERSION,
    port: server.port,
    token,
    publicOverlayUrl: relay?.classic.publicUrl ?? null
  });
  await app.handleCommand({ type: 'getState' });
}

main().catch((error: unknown) => {
  // Tauri restarts the sidecar with a backoff when it exits unexpectedly.
  log('error', `Sidecar failed to start: ${describeError(error)}`);
  process.exit(1);
});
