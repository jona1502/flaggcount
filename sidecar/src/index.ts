import { createInterface } from 'node:readline';
import { SidecarApp } from './app';
import { parseCommand, serializeEvent, type SidecarEvent } from './protocol';
import { DEFAULT_OVERLAY_PORT, createSessionToken, startLocalServer } from './server/localServer';
import { createTikTokConnection } from './tiktok/tiktokConnection';

// stdout is reserved for protocol events; route all console output to stderr.
const writeStdout = process.stdout.write.bind(process.stdout);
console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);

function send(event: SidecarEvent): void {
  writeStdout(serializeEvent(event));
}

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
    console.error(`Port ${DEFAULT_OVERLAY_PORT} is in use; the overlay uses port ${server.port} instead`);
  }

  const commands = createInterface({ input: process.stdin });

  commands.on('line', (line) => {
    const command = parseCommand(line);
    if (!command) {
      console.error('Ignoring invalid command');
      return;
    }
    app.handleCommand(command).catch((error: unknown) => {
      console.error('Command failed:', error instanceof Error ? error.message : error);
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
  console.error('Sidecar failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
