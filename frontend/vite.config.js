import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // your React dev server port (default)
    proxy: {
      // Any request starting with /api gets forwarded to your Express backend
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
  // ── Vitest (jsdom component tests) ──────────────────────────────────────────
  // Runs the React component/page suite in a browser-like jsdom env. msw
  // intercepts the axios `/api` calls at the network layer, so the proxy above
  // is irrelevant under test. Asset/CSS imports are stubbed by Vite.
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup/vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    clearMocks: true,
    restoreMocks: true,
  },
});