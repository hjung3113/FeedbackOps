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
      // #143 navigation badge counts are a backend-only root path.
      '/nav': 'http://127.0.0.1:3011',
      // #143 actor-private saved-view CRUD is a backend-only root resource.
      '/saved-views': 'http://127.0.0.1:3011',
      // #197 workspace policy endpoints are backend-only root paths, so
      // forward them unconditionally in development.
      '/workspace': 'http://127.0.0.1:3011',
      // Slice 2 / Slice 3 data endpoints (root-level, no /api prefix).
      '/entity-links': 'http://127.0.0.1:3011',
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
      // Slice 5 #123: GET /findings, GET /findings/:id. `/findings` overlaps
      // with the FE route of the same name, so bypass the proxy for browser
      // HTML navigations and only forward JSON/XHR requests (mirrors /vocs).
      '/findings': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      '/permission-requests': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      // #175 permission review console uses /permissions/requests. This is a
      // backend-only root prefix, so forward it unconditionally in dev.
      '/permissions': 'http://127.0.0.1:3011',
      '/task-requests': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      '/tasks': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      // `/surveys` overlaps with the FE route of the same name, so bypass the
      // proxy for browser HTML navigations and only forward JSON/XHR requests.
      '/surveys': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
      // #187: POST /survey-responses/:id/{create-finding,
      // evidence-excerpt-candidates,approved-excerpts}. A backend-only root
      // prefix — no FE route of this name — so forward it unconditionally.
      // Missing until #206: the proxy check could not see the shorthand
      // `app.post('/survey-responses/...')` form these routes use.
      '/survey-responses': 'http://127.0.0.1:3011',
      // Slice 3 #22: POST /attachments (multipart upload) + GET
      // /attachments/:id/download (streaming). No FE-route collision; forward
      // root path unconditionally.
      '/attachments': 'http://127.0.0.1:3011',
      // Post-#21 drift fix: GET /actors?workspace=current for Triage
      // OwnerPicker. No FE-route collision; forward root path unconditionally.
      '/actors': 'http://127.0.0.1:3011',
      // Slice 5 #126: GET/POST /voc-clusters + sub-routes. `/voc-clusters` overlaps
      // with the FE route of the same name, so bypass the proxy for browser
      // HTML navigations and only forward JSON/XHR requests (mirrors /findings).
      '/voc-clusters': {
        target: 'http://127.0.0.1:3011',
        bypass: (req) => (req.headers.accept?.includes('text/html') ? req.url : undefined),
      },
    },
  },
});
