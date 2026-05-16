import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    // Integration suites share a single Postgres (and the migration role's
    // tables). Running test files in parallel causes one suite's
    // `delete from core.sessions ...` cleanup to clobber another suite's
    // active fixtures. Force a single-file-at-a-time pool so the cleanup
    // story is local to each file.
    fileParallelism: false,
  },
});
