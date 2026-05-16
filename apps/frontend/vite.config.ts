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
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
      // Slice 1 #3: auth endpoints + the /me identity probe live at root.
      '/auth': 'http://localhost:3001',
      '/me': 'http://localhost:3001',
    },
  },
});
