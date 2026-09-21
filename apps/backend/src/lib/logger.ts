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

/** Request-header lines that carry secrets (session cookie, bearer token, idempotency key). */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers.authorization',
  'req.headers["idempotency-key"]',
];

export function createRootLogger(config: Pick<AppConfig, 'NODE_ENV'>): pino.Logger {
  return pino({
    level: config.NODE_ENV === 'test' ? 'silent' : 'info',
    // Review HTTP-M-3: redact request-header lines that carry secrets
    // (cookie holds the session id; idempotency-key correlates a single
    // actor's retries). Without this, anyone with log access can lift a
    // live session out of stdout (CWE-532).
    redact: {
      paths: [...REDACT_PATHS],
      remove: true,
    },
  });
}
