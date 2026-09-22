// Process root logger (ADR-0013: logs-first observability via stdout JSON).
//
// One pino instance per process: src/index.ts creates it once and hands it to
// both the job wrapper (`toJobLog` in lib/job-log.ts) and Fastify
// (`buildServer({ logger })` → `loggerInstance`), so request logs and job
// logs share level + redaction.
//
// The level rule and header redaction here MUST stay identical to the inline
// fallback in `buildServer` (src/server.ts), which keeps byte-for-byte
// behavior for callers that don't pass a logger (route tests).

import { pino } from 'pino';

import type { AppConfig } from '../config.js';
import { redactSensitiveQuery } from './redact-url.js';

/** Request-header lines that carry secrets (session cookie, bearer token, idempotency key). */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers.authorization',
  'req.headers["idempotency-key"]',
];

/**
 * Pino `req` serializer (issue #390). Shape mirrors Fastify's default
 * (fastify/lib/logger-pino.js `asReqValue`) with ONE change: `url` goes
 * through `redactSensitiveQuery` so one-time OIDC codes/states never reach
 * the logs. Wired into `createRootLogger` and the inline logger options in
 * `buildServer` — the two logger constructions must stay byte-for-byte
 * equivalent.
 */
export function reqLogSerializer(req: {
  method?: string | undefined;
  url?: string | undefined;
  headers?: Record<string, unknown> | undefined;
  host?: string | undefined;
  ip?: string | undefined;
  socket?: { remotePort?: number | undefined } | undefined;
}): Record<string, unknown> {
  return {
    method: req.method,
    url: typeof req.url === 'string' ? redactSensitiveQuery(req.url) : req.url,
    version: req.headers && req.headers['accept-version'],
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket ? req.socket.remotePort : undefined,
  };
}

export function createRootLogger(
  config: Pick<AppConfig, 'NODE_ENV'>,
  // Test seam (lib/__tests__/redact-url.test.ts): redirects the default
  // stdout destination into an in-memory stream. Production callers omit it.
  destination?: pino.DestinationStream,
): pino.Logger {
  return pino(
    {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      // Review HTTP-M-3: redact request-header lines that carry secrets
      // (cookie holds the session id; idempotency-key correlates a single
      // actor's retries). Without this, anyone with log access can lift a
      // live session out of stdout (CWE-532).
      redact: {
        paths: [...REDACT_PATHS],
        remove: true,
      },
      // Issue #390: `req.url` carries the one-time authorization code on
      // /auth/callback — redact sensitive query values (see redact-url.ts).
      serializers: { req: reqLogSerializer },
    },
    destination,
  );
}
