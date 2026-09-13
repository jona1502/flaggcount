import { createInterface } from 'node:readline';
import { SidecarApp } from './app';
import { describeError } from './logging';
import { parseCommand, serializeEvent, type LogLevel, type SidecarEvent } from './protocol';
import { DEFAULT_OVERLAY_PORT, createSessionToken, startLocalServer } from './server/localServer';
import { createTikTokConnection } from './tiktok/tiktokConnection';

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

async function main(): Promise<void> {
  const app = new SidecarApp(createTikTokConnection, send);

  // Fresh secret per app start, shared with Tauri only over the private stdout pipe.
  const token = createSessionToken();
  const server = await startLocalServer(
    {
      token,
      getState: () => app.getState(),
      getVotes: () => app.getVotes(),
      subscribeVotes: (listener) => app.subscribeVotes(listener)
    },
    DEFAULT_OVERLAY_PORT
  );
  if (server.port !== DEFAULT_OVERLAY_PORT) {
    log('warn', `Port ${DEFAULT_OVERLAY_PORT} is in use; the overlay uses port ${server.port} instead`);
  }

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
    void Promise.allSettled([app.shutdown(), server.close()]).finally(() => process.exit(0));
  });

  send({ type: 'ready', port: server.port, token });
  await app.handleCommand({ type: 'getState' });
}

main().catch((error: unknown) => {
  // Tauri restarts the sidecar with a backoff when it exits unexpectedly.
  log('error', `Sidecar failed to start: ${describeError(error)}`);
  process.exit(1);
});
