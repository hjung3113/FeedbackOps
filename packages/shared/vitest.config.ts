// @fops/shared has no test infra at root; each workspace package owns its
// vitest config. Keep this file in sync with apps/backend/vitest.config.ts
// for shared options (node env, file glob). Drift is the responsibility
// of whoever first changes the root convention.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
