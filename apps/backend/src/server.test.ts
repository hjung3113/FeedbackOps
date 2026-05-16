import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { buildServer } from './server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('GET /health', () => {
  let app: FastifyInstance;
  let dbHandle: ReturnType<typeof createDb>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await dbHandle?.close();
  });

  test('returns 200 with status ok and ISO timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(() => new Date(body.ts).toISOString()).not.toThrow();
  });

  test('sets X-Content-Type-Options nosniff', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

// F-006: AUTH_PROVIDER switch in buildServer. Mock is the only supported
// provider in Slice 1; oidc must throw a clear error rather than silently
// serve mock.
describe.skipIf(!runIntegration)('buildServer AUTH_PROVIDER switch', () => {
  test('AUTH_PROVIDER=mock boots cleanly', async () => {
    process.env.NODE_ENV = 'test';
    const dbHandle = createDb(APP_URL);
    try {
      const cfg = { ...loadConfig(), AUTH_PROVIDER: 'mock' as const };
      const app = await buildServer({ config: cfg, dbHandle });
      await app.ready();
      await app.close();
    } finally {
      await dbHandle.close();
    }
  });

  test('AUTH_PROVIDER=oidc throws Error mentioning ADR-0006', async () => {
    process.env.NODE_ENV = 'test';
    const dbHandle = createDb(APP_URL);
    try {
      const cfg = { ...loadConfig(), AUTH_PROVIDER: 'oidc' as const };
      await expect(buildServer({ config: cfg, dbHandle })).rejects.toThrow(/ADR-0006/);
    } finally {
      await dbHandle.close();
    }
  });
});
