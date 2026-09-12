import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devHost = process.env['TAURI_DEV_HOST'];

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    port: 1420,
    strictPort: true,
    host: devHost || false,
    hmr: devHost ? { protocol: 'ws', host: devHost, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**']
    }
  },
  build: {
    target: 'chrome105',
    sourcemap: Boolean(process.env['TAURI_ENV_DEBUG'])
  }
});
