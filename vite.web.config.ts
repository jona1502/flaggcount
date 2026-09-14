import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browser dashboard and admin area of the web version, served by sidecar/src/web (see Dockerfile).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    rolldownOptions: {
      input: { web: 'web.html', admin: 'admin.html' }
    }
  }
});
