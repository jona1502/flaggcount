import { createInterface } from 'node:readline';
import { parseCommand, serializeEvent, type SidecarEvent } from './protocol';
import { createTikTokConnection } from './tiktok/tiktokConnection';
import { TikTokLiveService } from './tiktok/TikTokLiveService';

// stdout is reserved for protocol events; route all console output to stderr.
const writeStdout = process.stdout.write.bind(process.stdout);
console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);

function send(event: SidecarEvent): void {
  writeStdout(serializeEvent(event));
}

const service = new TikTokLiveService(createTikTokConnection, {
  onStatus: (state) => send({ type: 'status', ...state }),
  onChat: (message) => send({ type: 'chat', message }),
  onError: (error) => send({ type: 'error', ...error })
});

const commands = createInterface({ input: process.stdin });

commands.on('line', (line) => {
  const command = parseCommand(line);
  if (!command) {
    console.error('Ignoring invalid command');
    return;
  }

  switch (command.type) {
    case 'connect':
      void service.connect(command.username);
      break;
    case 'disconnect':
      void service.disconnect();
      break;
  }
});

// The sidecar only lives as long as the Tauri app keeps its stdin open.
commands.on('close', () => {
  void service.disconnect().finally(() => process.exit(0));
});

send({ type: 'ready' });
