import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import type { AppConfig } from '../config.js';
import type { Db, DbHandle } from '../db/client.js';
import { SESSION_COOKIE_NAME } from '../middleware/require-session.js';
import { buildServer } from '../server.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000025';

type FakeSession = {
  actor_id: string;
  workspace_id: string;
};

function config(): AppConfig {
  return {
    NODE_ENV: 'test',
    PORT: 3001,
    HOST: '127.0.0.1',
    AUTH_PROVIDER: 'mock',
    WORKSPACE_ID,
    WORKSPACE_NAME: 'FeedbackOps',
    SEED_MODE: 'core',
    PUBLIC_ATTACHMENT_ORIGIN: "'self'",
    TRUSTED_PROXY_HOPS: 0,
  };
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function extractSqlParams(query: unknown): unknown[] {
  if (!query || typeof query !== 'object') return [];
  const chunks = (query as { queryChunks?: unknown }).queryChunks;
  return Array.isArray(chunks)
    ? chunks.filter((chunk) => typeof chunk === 'string' || typeof chunk === 'number')
    : [];
}

function createDbHandle(opts: {
  sessions?: Record<string, FakeSession>;
  failSessionLookup?: boolean;
}): DbHandle {
  const sessions = opts.sessions ?? {};
  const counters = new Map<string, number>();

  const db = {
    execute: async (query: unknown): Promise<{ rows: FakeSession[] }> => {
      if (opts.failSessionLookup) {
        throw new Error('simulated session lookup failure');
      }
      const token = extractSqlParams(query).find((param) => typeof param === 'string');
      const session = typeof token === 'string' ? sessions[token] : undefined;
      return { rows: session ? [session] : [] };
    },
  } as unknown as Db;

  const pool = {
    query: async <T>(_sql: string, values?: unknown[]): Promise<{ rows: T[] }> => {
      const key = typeof values?.[0] === 'string' ? values[0] : '';
      const routeGroup = typeof values?.[1] === 'string' ? values[1] : '';
      const counterKey = `${routeGroup}:${key}`;
      const counter = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, counter);
      return { rows: [{ counter, ttl_ms: '60000' } as T] };
    },
  };

  return {
    db,
    pool: pool as unknown as DbHandle['pool'],
    close: async () => undefined,
  };
}

async function buildFakeServer(dbHandle: DbHandle): Promise<FastifyInstance> {
  const app = await buildServer({ config: config(), dbHandle });
  app.get('/issue-25-global-probe', async () => ({ ok: true }));
  await app.ready();
  return app;
}

async function statusesFor(
  app: FastifyInstance,
  count: number,
  headers?: Record<string, string>,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: '/issue-25-global-probe',
      ...(headers ? { headers } : {}),
    });
    statuses.push(res.statusCode);
  }
  return statuses;
}

describe('global rate limit actor resolution', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('gives two distinct session cookies independent 100/min buckets', async () => {
    app = await buildFakeServer(
      createDbHandle({
        sessions: {
          'session-a': {
            workspace_id: WORKSPACE_ID,
            actor_id: '10000000-0000-4000-8000-000000000001',
          },
          'session-b': {
            workspace_id: WORKSPACE_ID,
            actor_id: '10000000-0000-4000-8000-000000000002',
          },
        },
      }),
    );

    expect(await statusesFor(app, 100, { cookie: sessionCookie('session-a') })).toEqual(
      Array(100).fill(200),
    );
    expect(await statusesFor(app, 100, { cookie: sessionCookie('session-b') })).toEqual(
      Array(100).fill(200),
    );

    const actorAOverLimit = await statusesFor(app, 1, { cookie: sessionCookie('session-a') });
    const actorBOverLimit = await statusesFor(app, 1, { cookie: sessionCookie('session-b') });
    expect(actorAOverLimit).toEqual([429]);
    expect(actorBOverLimit).toEqual([429]);
  });

  it('uses a 50/min IP bucket without a session cookie', async () => {
    app = await buildFakeServer(createDbHandle({}));

    expect(await statusesFor(app, 50)).toEqual(Array(50).fill(200));
    expect(await statusesFor(app, 1)).toEqual([429]);
  });

  it('falls back to the 50/min IP bucket when session lookup fails', async () => {
    app = await buildFakeServer(createDbHandle({ failSessionLookup: true }));

    expect(await statusesFor(app, 50, { cookie: sessionCookie('session-a') })).toEqual(
      Array(50).fill(200),
    );
    expect(await statusesFor(app, 1, { cookie: sessionCookie('session-a') })).toEqual([429]);
  });
});
