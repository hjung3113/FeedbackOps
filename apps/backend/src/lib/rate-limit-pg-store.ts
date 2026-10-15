// Postgres-backed store for @fastify/rate-limit. ADR-0015:7-8 requires that
// limits survive across pods, which the bundled in-memory store cannot do.
// Backed by `core.rate_limits` (one row per `(key, route_group)`); each call
// to `incr` does a single atomic UPSERT that resets the counter when the
// window has elapsed.
//
// The plugin's store contract:
//   constructor(options)  — receives merged plugin + route options.
//   incr(key, cb)         — atomic increment; cb(err, { current, ttl }).
//   child(routeOptions)   — return a new store keyed for a specific route.
//
// We attach a route_group tag so per-route tiers (mutation, sensitive) share
// the table without colliding with the global per-Actor / per-IP tier.

import type pg from 'pg';
import { HttpError } from './errors.js';

export interface PgStoreOptions {
  pool: pg.Pool;
  timeWindow: number; // ms; injected by the plugin
  routeGroup?: string; // 'global' | 'mutation' | 'sensitive'; merged via child()
}

export interface IncrResult {
  current: number;
  ttl: number;
}

/**
 * Build a store class bound to a pg.Pool and a route_group label. The
 * @fastify/rate-limit plugin instantiates whatever class is passed via
 * `store`, forwarding only the plugin/route options it knows about — so to
 * inject the pool we close over it in the returned class definition.
 */
export function createPgRateLimitStore(pool: pg.Pool, routeGroup: string) {
  return class BoundPgStore extends PgRateLimitStore {
    constructor(options: { timeWindow: number }) {
      super({ pool, routeGroup, timeWindow: options.timeWindow });
    }
  };
}

export class PgRateLimitStore {
  readonly options: PgStoreOptions;

  constructor(options: PgStoreOptions) {
    this.options = { routeGroup: 'global', ...options };
  }

  incr(key: string, cb: (err: Error | null, result?: IncrResult) => void): void {
    const windowMs = this.options.timeWindow;
    const routeGroup = this.options.routeGroup ?? 'global';
    // Single statement: insert a fresh row, or — if the existing row's
    // window has elapsed — overwrite its counter+expiry, otherwise just
    // bump the counter. Postgres `now()` is the source of truth so multiple
    // pods agree on the window boundary.
    const sql = `
      insert into core.rate_limits (key, route_group, counter, expires_at)
      values ($1, $2, 1, now() + ($3 || ' milliseconds')::interval)
      on conflict (key, route_group) do update
        set counter = case
              when core.rate_limits.expires_at <= now() then 1
              else core.rate_limits.counter + 1
            end,
            expires_at = case
              when core.rate_limits.expires_at <= now()
                then now() + ($3 || ' milliseconds')::interval
              else core.rate_limits.expires_at
            end
      returning counter, ceil(extract(epoch from (expires_at - now())) * 1000)::bigint as ttl_ms
    `;
    this.options.pool
      .query<{ counter: number; ttl_ms: string }>(sql, [key, routeGroup, String(windowMs)])
      .then((res) => {
        const row = res.rows[0];
        if (!row) {
          cb(new Error('rate_limits upsert returned no row'));
          return;
        }
        cb(null, { current: row.counter, ttl: Number(row.ttl_ms) });
      })
      .catch((err) => cb(err as Error));
  }

  child(routeOptions: Record<string, unknown>): PgRateLimitStore {
    const merged: PgStoreOptions = {
      ...this.options,
      ...(routeOptions as Partial<PgStoreOptions>),
    };
    const child = Object.create(Object.getPrototypeOf(this) as object) as PgRateLimitStore;
    (child as unknown as { options: PgStoreOptions }).options = merged;
    return child;
  }
}

/** An independent increment: Fastify's per-request guard skips a second plugin handler. */
export function createSensitiveActorRateLimit(pool: pg.Pool) {
  const store = new PgRateLimitStore({ pool, routeGroup: 'sensitive', timeWindow: 60_000 });
  return async (actor: { workspace_id: string; actor_id: string }): Promise<void> => {
    const result = await new Promise<IncrResult>((resolve, reject) => {
      store.incr(`${actor.workspace_id}:${actor.actor_id}`, (error, value) => {
        if (error) reject(error);
        else if (value) resolve(value);
        else reject(new Error('rate_limits increment returned no result'));
      });
    });
    if (result.current > 5) {
      throw new HttpError('rate_limited.actor', 'rate limit exceeded', {
        retry_after_seconds: Math.ceil(result.ttl / 1000),
      });
    }
  };
}
