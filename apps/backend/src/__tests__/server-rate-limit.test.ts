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

type RateLimitRow = {
  key: string;
  routeGroup: string;
  counter: number;
};

const RATE_LIMIT_TIER_PROBES = [
  ['mutation', '/issue-153-mutation-probe'],
  ['sensitive', '/issue-153-sensitive-probe'],
  ['read', '/issue-153-read-probe'],
  ['reporterEdit', '/issue-153-reporter-edit-probe'],
  ['attachmentMutation', '/issue-153-attachment-mutation-probe'],
] as const;

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
}): DbHandle & {
  sessionLookupCount: () => number;
  rateLimitRows: () => RateLimitRow[];
} {
  const sessions = opts.sessions ?? {};
  const counters = new Map<string, number>();
  const rateLimitRows = new Map<string, RateLimitRow>();
  let sessionLookupCount = 0;

  const db = {
    execute: async (query: unknown): Promise<{ rows: FakeSession[] }> => {
      sessionLookupCount += 1;
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
      rateLimitRows.set(counterKey, { key, routeGroup, counter });
      return { rows: [{ counter, ttl_ms: '60000' } as T] };
    },
  };

  return {
    db,
    pool: pool as unknown as DbHandle['pool'],
    close: async () => undefined,
    sessionLookupCount: () => sessionLookupCount,
    rateLimitRows: () =>
      Array.from(rateLimitRows.values()).sort((a, b) =>
        `${a.routeGroup}:${a.key}`.localeCompare(`${b.routeGroup}:${b.key}`),
      ),
  };
}

async function buildFakeServer(dbHandle: DbHandle): Promise<FastifyInstance> {
  const app = await buildServer({ config: config(), dbHandle });
  app.get('/issue-25-global-probe', async () => ({ ok: true }));
  for (const [tier, url] of RATE_LIMIT_TIER_PROBES) {
    app.get(
      url,
      { config: { rateLimit: app.rateLimitConfig[tier] as never } },
      async () => ({ ok: true, tier }),
    );
  }
  await app.ready();
  return app;
}

async function statusesFor(
  app: FastifyInstance,
  count: number,
  headers?: Record<string, string>,
  url = '/issue-25-global-probe',
): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url,
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

  it('keeps route-level tiers in distinct Postgres route_group buckets', async () => {
    const dbHandle = createDbHandle({
      sessions: {
        'session-a': {
          workspace_id: WORKSPACE_ID,
          actor_id: '10000000-0000-4000-8000-000000000001',
        },
      },
    });
    app = await buildFakeServer(dbHandle);
    const headers = { cookie: sessionCookie('session-a') };

    expect(await statusesFor(app, 10, headers, '/issue-153-mutation-probe')).toEqual(
      Array(10).fill(200),
    );
    expect(await statusesFor(app, 1, headers, '/issue-153-mutation-probe')).toEqual([429]);
    expect(await statusesFor(app, 1, headers, '/issue-153-read-probe')).toEqual([200]);
    expect(await statusesFor(app, 1, headers, '/issue-153-sensitive-probe')).toEqual([200]);
    expect(await statusesFor(app, 1, headers, '/issue-153-reporter-edit-probe')).toEqual([200]);
    expect(await statusesFor(app, 1, headers, '/issue-153-attachment-mutation-probe')).toEqual([
      200,
    ]);

    const rows = dbHandle.rateLimitRows();
    expect(rows.map((row) => row.routeGroup).sort()).toEqual([
      'attachment_mutation',
      'mutation',
      'read',
      'reporter_edit',
      'sensitive',
    ]);
    expect(rows.find((row) => row.routeGroup === 'mutation')?.counter).toBe(11);
    expect(rows.find((row) => row.routeGroup === 'read')?.counter).toBe(1);
    expect(rows.some((row) => row.routeGroup === 'global')).toBe(false);
  });

  it('caches actor session resolution for repeated requests with the same cookie', async () => {
    const dbHandle = createDbHandle({
      sessions: {
        'session-a': {
          workspace_id: WORKSPACE_ID,
          actor_id: '10000000-0000-4000-8000-000000000001',
        },
      },
    });
    app = await buildFakeServer(dbHandle);

    expect(await statusesFor(app, 5, { cookie: sessionCookie('session-a') })).toEqual(
      Array(5).fill(200),
    );
    expect(dbHandle.sessionLookupCount()).toBe(1);
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
