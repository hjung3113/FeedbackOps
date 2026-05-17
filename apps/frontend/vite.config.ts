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
    },
  },
});
