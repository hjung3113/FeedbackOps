import { defineConfig } from 'drizzle-kit';

// Per ADR-0015: hand-reviewed SQL files; no `drizzle-kit push` outside local dev.
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/feedbackops',
  },
  strict: true,
  verbose: true,
});
