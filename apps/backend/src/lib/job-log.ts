// Structured job logging (ADR-0013, amended 2026-09-22: jobs).
//
// `JobLog` is the narrow `(msg, meta)` logger shape job deps already use;
// `toJobLog` adapts a Pino root logger to it (Pino's argument order is
// `(meta, msg)`). `withJobLogging` wraps every `boss.work` handler so all
// queues emit the same bounded lifecycle events — `job.start`, `job.retry`,
// `job.success`, `job.failure` — while RETHROWING handler errors so the
// pg-boss retry config (ADR-0009:35) keeps applying.
//
// Bounded fields only: ids, queue name, duration, error name/code. Never the
// error message, cause, or stack (they can embed secrets such as DSNs), and
// never job payload data.

import type { Job } from 'pg-boss';
import type pino from 'pino';

/** The `(msg, meta)` logger shape used by job deps (same shape as before). */
export interface JobLog {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** Adapt a Pino logger to the `(msg, meta)` argument order job deps use. */
export function toJobLog(logger: pino.Logger): JobLog {
  return {
    info(msg, meta) {
      if (meta === undefined) logger.info(msg);
      else logger.info(meta, msg);
    },
    warn(msg, meta) {
      if (meta === undefined) logger.warn(msg);
      else logger.warn(meta, msg);
    },
    error(msg, meta) {
      if (meta === undefined) logger.error(msg);
      else logger.error(meta, msg);
    },
  };
}

/**
 * Bounded projection of an error for log fields: the constructor/name and a
 * string/number `code` only. NEVER the message, cause, or stack — they can
 * embed DSNs, credentials or tokens (driver, provider and storage errors do).
 * Use this everywhere a job path logs a caught error; do not pass raw `err`.
 */
export function errorFields(err: unknown): { err_name: string; err_code?: string | number } {
  const name = err instanceof Error ? err.name : typeof err;
  const rawCode = (err as { code?: unknown } | null | undefined)?.code;
  return typeof rawCode === 'string' || typeof rawCode === 'number'
    ? { err_name: name, err_code: rawCode }
    : { err_name: name };
}

/**
 * Bounded projection of a pg-boss `warning` event payload. pg-boss v12 emits
 * `{ message, data }` where both can carry SQL text and parameters, so nothing
 * from the payload is logged except a string `type` if a future pg-boss adds
 * one; today the line is just the event name.
 */
export function warningFields(warning: unknown): { warning_type?: string } {
  const type = (warning as { type?: unknown } | null | undefined)?.type;
  return typeof type === 'string' ? { warning_type: type } : {};
}

/**
 * Pass as the `boss.work` options argument: without `includeMetadata`, pg-boss
 * v12 hands handlers a bare `Job` (no `retryCount`), so `job.retry` could never
 * be emitted in production wiring.
 */
export const JOB_WORK_OPTIONS = { includeMetadata: true } as const;

/** Handlers registered with JOB_WORK_OPTIONS receive `retryCount`; it stays optional for plain jobs. */
interface JobWithRetryCount {
  retryCount?: unknown;
}

function correlationIdOf(job: Job<unknown>): string | undefined {
  const data = job.data as { correlation_id?: unknown } | undefined;
  const correlationId = data?.correlation_id;
  return typeof correlationId === 'string' ? correlationId : undefined;
}

function retryCountOf(job: Job<unknown>): number | undefined {
  const retryCount = (job as JobWithRetryCount).retryCount;
  return typeof retryCount === 'number' ? retryCount : undefined;
}

/**
 * Wrap a `boss.work` handler with per-job lifecycle logging.
 *
 * Each job in the batch gets a `job.start` line (or `job.retry` when the job
 * carries `retry_count > 0`), and after the batch handler resolves (or
 * throws) every job gets `job.success` / `job.failure` with `duration_ms`.
 * Failure lines add `err_name` and — only when the error carries a
 * string/number `code` — `err_code`. The error is always rethrown.
 *
 * `extraFields` (optional) lets a queue add allowlisted id fields from its
 * payload (e.g. `task_id`); it must never return payload bodies.
 */
export function withJobLogging<T>(
  log: JobLog,
  queue: string,
  handler: (jobs: Array<Job<T>>) => Promise<void>,
  extraFields?: (job: Job<T>) => Record<string, unknown>,
): (jobs: Array<Job<T>>) => Promise<void> {
  const baseFields = (job: Job<T>): Record<string, unknown> => {
    const fields: Record<string, unknown> = { queue, job_id: job.id };
    const correlationId = correlationIdOf(job);
    if (correlationId !== undefined) fields.correlation_id = correlationId;
    const retryCount = retryCountOf(job);
    if (retryCount !== undefined) fields.retry_count = retryCount;
    if (extraFields) Object.assign(fields, extraFields(job));
    return fields;
  };

  return async (jobs) => {
    for (const job of jobs) {
      const retryCount = retryCountOf(job);
      const event = retryCount !== undefined && retryCount > 0 ? 'job.retry' : 'job.start';
      log.info(event, { event, ...baseFields(job) });
    }

    const startedAt = Date.now();
    try {
      await handler(jobs);
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const projected = errorFields(err);
      for (const job of jobs) {
        log.error('job.failure', {
          event: 'job.failure',
          ...baseFields(job),
          duration_ms: durationMs,
          ...projected,
        });
      }
      throw err;
    }
    const durationMs = Date.now() - startedAt;
    for (const job of jobs) {
      log.info('job.success', {
        event: 'job.success',
        ...baseFields(job),
        duration_ms: durationMs,
      });
    }
  };
}
