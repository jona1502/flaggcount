import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Legacy browser dashboard of the web version, served by sidecar/src/web (see Dockerfile) until it runs on
// Next.js. The admin area is part of the Next.js web app.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    rolldownOptions: {
      input: 'web.html'
    }
  }
});
