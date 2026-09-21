// Unit tests (no DB) for the released-review-candidates job logging
// (ADR-0013, amended 2026-09-22). The suite registers the handler exactly as
// production wiring does — via `registerReleasedReviewCandidates`, whose
// `boss.work` callback is the `withJobLogging` wrapper — using a fake boss
// that captures the work callback. Asserts the lifecycle event shape and the
// rethrow-on-failure retry contract.

import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';

import type { JobLog } from '../../../../lib/job-log.js';
import type { PublicUpdateReviewCandidatesService } from '../../../voc/public-update-review-candidates/service.js';
import {
  TASK_RELEASED_REVIEW_CANDIDATES_QUEUE,
  registerReleasedReviewCandidates,
  type TaskReleasedReviewCandidatesPayload,
} from '../released-review-candidates.js';

function payload(
  overrides?: Partial<TaskReleasedReviewCandidatesPayload>,
): TaskReleasedReviewCandidatesPayload {
  return {
    workspace_id: 'w-1',
    task_id: 't-1',
    release_event_id: 're-1',
    correlation_id: 'c-1',
    triggered_by_actor_id: 'a-1',
    linked_vocs: [],
    ...overrides,
  };
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

function fakeService(
  createForReleasedTask: PublicUpdateReviewCandidatesService['createForReleasedTask'],
): PublicUpdateReviewCandidatesService {
  return { createForReleasedTask } as unknown as PublicUpdateReviewCandidatesService;
}

async function captureWorkHandler(
  service: PublicUpdateReviewCandidatesService,
  log: JobLog,
): Promise<
  (jobs: Array<{ id?: string; data: TaskReleasedReviewCandidatesPayload }>) => Promise<void>
> {
  let captured:
    | ((jobs: Array<{ id?: string; data: TaskReleasedReviewCandidatesPayload }>) => Promise<void>)
    | undefined;
  const boss = {
    getQueues: vi.fn(async () => [{ name: TASK_RELEASED_REVIEW_CANDIDATES_QUEUE }]),
    work: vi.fn(async (_queue: string, options: unknown, handler: NonNullable<typeof captured>) => {
      // Production wiring must request job metadata so `retryCount` reaches
      // the wrapper (otherwise `job.retry` can never fire).
      expect(options).toEqual({ includeMetadata: true });
      captured = handler;
      return 'worker-1';
    }),
  } as unknown as PgBoss;

  await registerReleasedReviewCandidates(boss, {
    publicUpdateReviewCandidatesService: service,
    log,
  });

  if (!captured) throw new Error('boss.work was not called');
  return captured;
}

describe('released-review-candidates job logging (ADR-0013)', () => {
  it('emits job.start/job.success with task_id, release_event_id and correlation_id', async () => {
    const { log, calls } = recordingLog();
    const createForReleasedTask = vi.fn(async () => ({ inserted: 0 }));
    const handler = await captureWorkHandler(fakeService(createForReleasedTask), log);

    await handler([{ id: 'job-1', data: payload() }]);

    expect(createForReleasedTask).toHaveBeenCalledWith(payload());

    const events = calls.map((c) => c.meta.event);
    expect(events).toEqual(['job.start', 'job.success']);

    const start = calls.find((c) => c.meta.event === 'job.start');
    expect(start?.meta.queue).toBe(TASK_RELEASED_REVIEW_CANDIDATES_QUEUE);
    expect(start?.meta.task_id).toBe('t-1');
    expect(start?.meta.release_event_id).toBe('re-1');
    expect(start?.meta.correlation_id).toBe('c-1');
    expect(start?.meta.job_id).toBe('job-1');

    const success = calls.find((c) => c.meta.event === 'job.success');
    expect(success?.meta.task_id).toBe('t-1');
    expect(success?.meta.release_event_id).toBe('re-1');
    expect(success?.meta.job_id).toBe('job-1');
    expect(typeof success?.meta.duration_ms).toBe('number');
  });

  it('rethrows service failures after a job.failure line (pg-boss retry contract)', async () => {
    const { log, calls } = recordingLog();
    const boom = new Error('candidate service down');
    const createForReleasedTask = vi.fn(async (): Promise<{ inserted: number }> => {
      throw boom;
    });
    const handler = await captureWorkHandler(fakeService(createForReleasedTask), log);

    await expect(handler([{ id: 'job-1', data: payload() }])).rejects.toBe(boom);

    const failure = calls.find((c) => c.meta.event === 'job.failure');
    expect(failure).toBeDefined();
    expect(failure?.meta.err_name).toBe('Error');
    expect(failure?.meta.task_id).toBe('t-1');
    expect(failure?.meta.job_id).toBe('job-1');
    expect(failure?.meta.release_event_id).toBe('re-1');
    expect(typeof failure?.meta.duration_ms).toBe('number');

    // Bounded fields only: the error message never reaches the log.
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain('candidate service down');
  });

  it('a batch where a later job throws logs a failure per job (own ids) and no success', async () => {
    const { log, calls } = recordingLog();
    let seen = 0;
    const createForReleasedTask = vi.fn(async (): Promise<{ inserted: number }> => {
      seen += 1;
      if (seen === 2) throw new Error('second job down');
      return { inserted: 0 };
    });
    const handler = await captureWorkHandler(fakeService(createForReleasedTask), log);

    await expect(
      handler([
        { id: 'job-a', data: payload({ task_id: 't-a', correlation_id: 'c-a' }) },
        { id: 'job-b', data: payload({ task_id: 't-b', correlation_id: 'c-b' }) },
      ]),
    ).rejects.toThrow('second job down');

    const failures = calls.filter((c) => c.meta.event === 'job.failure');
    expect(
      failures.map((c) => [c.meta.job_id, c.meta.task_id, c.meta.correlation_id]).sort(),
    ).toEqual([
      ['job-a', 't-a', 'c-a'],
      ['job-b', 't-b', 'c-b'],
    ]);
    expect(calls.some((c) => c.meta.event === 'job.success')).toBe(false);
  });
});
