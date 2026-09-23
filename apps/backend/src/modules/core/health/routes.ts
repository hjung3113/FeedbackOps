// Health routes (ADR-0013 "Health endpoints", amended 2026-09-22).
// Both probes are unauthenticated and exempt from rate limit; the probe
// implementation itself lives in lib/health.ts.

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';

import {
  type HealthCheckName,
  type InFlightProbe,
  runReadinessChecks,
} from '../../../lib/health.js';
import type { StorageBackend } from '../../../lib/storage/index.js';

export interface HealthRoutesOptions {
  pool: pg.Pool;
  /**
   * pg-boss handle. Absent/undefined fails the readiness check closed.
   * `| undefined` is explicit so callers can pass a possibly-undefined
   * binding through under `exactOptionalPropertyTypes`.
   */
  boss?: PgBoss | undefined;
  storage: StorageBackend;
  healthProbeTimeoutMs?: number;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, opts) => {
  const { pool, boss, storage, healthProbeTimeoutMs } = opts;
  // One map per buildServer, not a module singleton: health tests build
  // several apps in one process and must not share probe state.
  const readinessInFlight = new Map<HealthCheckName, InFlightProbe>();

  app.route({
    method: 'GET',
    url: '/health',
    schema: {
      response: {
        200: z.object({
          status: z.literal('ok'),
          ts: z.string().datetime(),
        }),
      },
    },
    handler: async () => ({ status: 'ok' as const, ts: new Date().toISOString() }),
  });

  // Liveness: the process is up. Depends on NOTHING downstream (no DB, no
  // boss, no storage) so it never flaps with dependency blips.
  // Probe routes opt out of @fastify/rate-limit at the ROUTE level
  // (`config.rateLimit: false`). The global `allowList` runs only AFTER the
  // plugin's `keyGenerator`, which resolves the session cookie via a DB
  // lookup — a hung DB would hang even liveness. Route-level opt-out skips
  // the key generator entirely.
  app.route({
    method: 'GET',
    url: '/health/live',
    config: { rateLimit: false },
    schema: {
      response: {
        200: z.object({ status: z.literal('ok') }),
      },
    },
    handler: async () => ({ status: 'ok' as const }),
  });

  // Readiness: Postgres answers, pg-boss is usable, storage is reachable.
  // Checks run in parallel, each bounded by `healthProbeTimeoutMs` (default
  // 2000 ms; ADR-0013). Bodies are fixed-shape and never carry error text —
  // DSN-bearing messages stay server-side, logged as `{ check, errName }`.
  const healthChecksSchema = z.object({
    database: z.enum(['ok', 'fail']),
    pg_boss: z.enum(['ok', 'fail']),
    storage: z.enum(['ok', 'fail']),
  });
  app.route({
    method: 'GET',
    url: '/health/ready',
    config: { rateLimit: false },
    schema: {
      response: {
        200: z.object({ status: z.literal('ok'), checks: healthChecksSchema }),
        503: z.object({ status: z.literal('unavailable'), checks: healthChecksSchema }),
      },
    },
    handler: async (req, reply) => {
      const result = await runReadinessChecks({
        pool,
        boss,
        storage,
        timeoutMs: healthProbeTimeoutMs,
        log: req.log,
        inFlight: readinessInFlight,
      });
      if (!result.ok) {
        return reply.code(503).send({ status: 'unavailable', checks: result.checks });
      }
      return reply.code(200).send({ status: 'ok' as const, checks: result.checks });
    },
  });
};
