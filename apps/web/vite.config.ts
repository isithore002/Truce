import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In server mode the browser can call the API on the same origin: Vite forwards /api and /healthz to apps/server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/healthz': 'http://127.0.0.1:8787',
    },
  },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['src/test/**/*.test.{ts,tsx}'], environment: 'node' },
});
