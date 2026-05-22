import { fileURLToPath } from 'node:url';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3010,
    proxy: {
      '/api': 'http://127.0.0.1:3011',
      '/health': 'http://127.0.0.1:3011',
      // Slice 1 #3: auth endpoints + the /me identity probe live at root.
      '/auth': 'http://127.0.0.1:3011',
      '/me': 'http://127.0.0.1:3011',
      // Slice 2 / Slice 3 data endpoints (root-level, no /api prefix).
      // `/vocs` overlaps with the FE route of the same name, so we bypass the
      // proxy for browser HTML navigations and only forward JSON/XHR requests.
      '/managed-systems': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      '/analytics-areas': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      '/vocs': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      '/permission-requests': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      // Slice 3 #22: POST /attachments (multipart upload) + GET
      // /attachments/:id/download (streaming). No FE-route collision; forward
      // root path unconditionally.
      '/attachments': 'http://127.0.0.1:3011',
    },
  },
});
