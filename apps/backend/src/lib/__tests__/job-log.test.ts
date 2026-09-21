// Unit tests for the job logging wrapper (ADR-0013, amended 2026-09-22).
//
// Contracts under test: the per-job event SET (start/retry/success/failure),
// the bounded field shape (ids + duration; never error messages, never
// payload data), and error RETHROW so the pg-boss retry contract survives.
// Assertions filter by job_id / event — no global call-order coupling across
// different jobs.

import type { Job } from 'pg-boss';
import { pino } from 'pino';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { type JobLog, errorFields, toJobLog, warningFields, withJobLogging } from '../job-log.js';

interface Payload {
  correlation_id?: string;
  blob?: string;
}

function recordingLog() {
  const calls: Array<{ level: string; msg: string; meta: Record<string, unknown> }> = [];
  const log: JobLog = {
    info: (msg, meta) => calls.push({ level: 'info', msg, meta: meta ?? {} }),
    warn: (msg, meta) => calls.push({ level: 'warn', msg, meta: meta ?? {} }),
    error: (msg, meta) => calls.push({ level: 'error', msg, meta: meta ?? {} }),
  };
  return { log, calls };
}

function fakeJob<T>(id: string, data: T, retryCount?: number): Job<T> {
  return retryCount === undefined
    ? ({ id, data } as unknown as Job<T>)
    : ({ id, data, retryCount } as unknown as Job<T>);
}

function eventsFor(
  calls: Array<{ msg: string; meta: Record<string, unknown> }>,
  jobId: string,
): unknown[] {
  return calls.filter((c) => c.meta.job_id === jobId).map((c) => c.meta.event);
}

describe('withJobLogging', () => {
  it('emits job.start then job.success with queue, job_id, correlation_id and numeric duration_ms', async () => {
    const { log, calls } = recordingLog();
    const wrapped = withJobLogging<Payload>(log, 'core.test_queue', async () => {});

    await wrapped([fakeJob('j1', { correlation_id: 'c1' })]);

    expect(eventsFor(calls, 'j1')).toEqual(['job.start', 'job.success']);
    const start = calls.find((c) => c.meta.event === 'job.start');
    expect(start?.meta.queue).toBe('core.test_queue');
    expect(start?.meta.job_id).toBe('j1');
    expect(start?.meta.correlation_id).toBe('c1');
    expect(start?.meta.duration_ms).toBeUndefined();
    const success = calls.find((c) => c.meta.event === 'job.success');
    expect(success?.meta.queue).toBe('core.test_queue');
    expect(success?.meta.job_id).toBe('j1');
    expect(success?.meta.correlation_id).toBe('c1');
    expect(typeof success?.meta.duration_ms).toBe('number');
  });

  it('rethrows handler errors and emits job.failure with err_name but never the message or payload', async () => {
    const { log, calls } = recordingLog();
    const boom = new Error('boom postgres://u:s3cr3t@h/x');
    const wrapped = withJobLogging<Payload>(log, 'q.fail', async () => {
      throw boom;
    });

    await expect(
      wrapped([fakeJob('j2', { correlation_id: 'c2', blob: 'PAYLOAD-MARKER' })]),
    ).rejects.toBe(boom);

    expect(eventsFor(calls, 'j2')).toEqual(['job.start', 'job.failure']);
    const failure = calls.find((c) => c.meta.event === 'job.failure');
    expect(failure?.meta.err_name).toBe('Error');
    expect(typeof failure?.meta.duration_ms).toBe('number');
    // A plain Error carries no string/number `code`, so err_code is omitted.
    expect('err_code' in (failure?.meta ?? {})).toBe(false);

    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain('s3cr3t');
    expect(serialized).not.toContain('boom');
    expect(serialized).not.toContain('PAYLOAD-MARKER');
  });

  it('adds err_code only when the error carries a string or number code', async () => {
    const { log, calls } = recordingLog();
    const coded = Object.assign(new Error('coded failure'), { code: 'EPIPE' });
    const wrapped = withJobLogging<Payload>(log, 'q.code', async () => {
      throw coded;
    });

    await expect(wrapped([fakeJob('j3', {})])).rejects.toBe(coded);

    const failure = calls.find((c) => c.meta.event === 'job.failure');
    expect(failure?.meta.err_code).toBe('EPIPE');
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain('coded failure');
  });

  it('emits job.retry instead of job.start when retry_count > 0', async () => {
    const { log, calls } = recordingLog();
    const wrapped = withJobLogging<Payload>(log, 'q.retry', async () => {});

    await wrapped([fakeJob('j4', { correlation_id: 'c4' }, 2)]);

    expect(eventsFor(calls, 'j4')).toEqual(['job.retry', 'job.success']);
    const retry = calls.find((c) => c.meta.event === 'job.retry');
    expect(retry?.meta.retry_count).toBe(2);
    expect(retry?.meta.correlation_id).toBe('c4');
  });

  it('gives every job in a batch its own start/success with its own ids', async () => {
    const { log, calls } = recordingLog();
    const wrapped = withJobLogging<Payload>(log, 'q.batch', async () => {});

    await wrapped([fakeJob('a', { correlation_id: 'ca' }), fakeJob('b', {})]);

    expect(eventsFor(calls, 'a')).toEqual(['job.start', 'job.success']);
    expect(eventsFor(calls, 'b')).toEqual(['job.start', 'job.success']);
    const aSuccess = calls.find((c) => c.meta.event === 'job.success' && c.meta.job_id === 'a');
    expect(aSuccess?.meta.correlation_id).toBe('ca');
    const bSuccess = calls.find((c) => c.meta.event === 'job.success' && c.meta.job_id === 'b');
    expect(typeof bSuccess?.meta.duration_ms).toBe('number');
  });

  it('omits correlation_id entirely (no undefined key) when the payload has none', async () => {
    const { log, calls } = recordingLog();
    const wrapped = withJobLogging<Payload>(log, 'q.nocorr', async () => {});

    await wrapped([fakeJob('j5', {})]);

    const start = calls.find((c) => c.meta.event === 'job.start');
    expect('correlation_id' in (start?.meta ?? {})).toBe(false);
    const success = calls.find((c) => c.meta.event === 'job.success');
    expect('correlation_id' in (success?.meta ?? {})).toBe(false);
  });

  it('lets a queue add allowlisted id fields via extraFields on every event', async () => {
    const { log, calls } = recordingLog();
    interface WidePayload extends Payload {
      task_id: string;
    }
    const wrapped = withJobLogging<WidePayload>(
      log,
      'tasks.queue',
      async () => {},
      (job) => ({ task_id: job.data.task_id }),
    );

    await wrapped([fakeJob('j6', { correlation_id: 'c6', task_id: 't-9' })]);

    for (const event of ['job.start', 'job.success']) {
      const line = calls.find((c) => c.meta.event === event);
      expect(line?.meta.task_id).toBe('t-9');
    }
  });
});

describe('toJobLog', () => {
  it('writes a JSON line with msg and the meta keys at the top level', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const jobLog = toJobLog(pino({ level: 'info' }, stream));

    jobLog.info('voc.embed_voc wrote embedding', { voc_id: 'v1', count: 2 });
    jobLog.error('plain message without meta');
    await new Promise<void>((resolve) => stream.end(() => resolve()));

    expect(lines).toHaveLength(2);
    const withMeta = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(withMeta.msg).toBe('voc.embed_voc wrote embedding');
    expect(withMeta.voc_id).toBe('v1');
    expect(withMeta.count).toBe(2);
    const plain = JSON.parse(lines[1] ?? '{}') as Record<string, unknown>;
    expect(plain.msg).toBe('plain message without meta');
  });
});

describe('errorFields / warningFields (bounded projections)', () => {
  it('projects only name and a string/number code, never the message or stack', () => {
    const err = Object.assign(new Error('connect postgres://u:s3cr3t@h/x failed'), {
      code: 'ECONNREFUSED',
    });
    const fields = errorFields(err);
    expect(fields).toEqual({ err_name: 'Error', err_code: 'ECONNREFUSED' });
    expect(JSON.stringify(fields)).not.toContain('s3cr3t');
    expect(errorFields(new Error('x'))).toEqual({ err_name: 'Error' });
    expect(errorFields('a string with s3cr3t')).toEqual({ err_name: 'string' });
    expect(errorFields({ code: { nested: 1 } })).toEqual({ err_name: 'object' });
  });

  it('logs nothing from a pg-boss warning payload (message/data can carry SQL)', () => {
    expect(warningFields({ message: 'SELECT ... s3cr3t', data: { sql: 's3cr3t' } })).toEqual({});
    expect(warningFields({ type: 'slow_query', message: 's3cr3t' })).toEqual({
      warning_type: 'slow_query',
    });
    expect(warningFields(undefined)).toEqual({});
  });
});
