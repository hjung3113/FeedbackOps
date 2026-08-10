// #168 step 3 — the enqueue-on-write boundary in isolation (ADR-0034 D6).
// No database: this pins the swallow-and-log contract itself.

import type { PgBoss } from 'pg-boss';
import { describe, expect, it } from 'vitest';

import { VOC_EMBED_QUEUE } from '../../jobs/embed-voc.js';
import {
  VOC_EMBED_START_AFTER_SECONDS,
  createNoopVocEmbeddingEnqueuer,
  createVocEmbeddingEnqueuer,
} from '../enqueue.js';

const args = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  vocId: '22222222-2222-4222-8222-222222222222',
  correlationId: 'corr-1',
};

function recordingBoss() {
  const sent: Array<{ queue: string; data: unknown; options: unknown }> = [];
  const boss = {
    async send(queue: string, data: unknown, options: unknown) {
      sent.push({ queue, data, options });
      return 'job-id';
    },
  } as unknown as PgBoss;
  return { boss, sent };
}

describe('createVocEmbeddingEnqueuer', () => {
  it('sends a delayed job on the embed queue', async () => {
    const { boss, sent } = recordingBoss();
    await createVocEmbeddingEnqueuer({ boss, embeddingEnabled: true }).enqueue(args);

    expect(sent).toEqual([
      {
        queue: VOC_EMBED_QUEUE,
        data: {
          workspace_id: args.workspaceId,
          voc_id: args.vocId,
          correlation_id: args.correlationId,
        },
        options: { startAfter: VOC_EMBED_START_AFTER_SECONDS },
      },
    ]);
  });

  it('sends nothing when embedding is disabled (ADR-0034 D2)', async () => {
    const { boss, sent } = recordingBoss();
    await createVocEmbeddingEnqueuer({ boss, embeddingEnabled: false }).enqueue(args);
    expect(sent).toEqual([]);
  });

  it('sends nothing when the process was booted without pg-boss', async () => {
    await expect(
      createVocEmbeddingEnqueuer({ embeddingEnabled: true }).enqueue(args),
    ).resolves.toBeUndefined();
  });

  it('swallows and logs a send failure instead of propagating it', async () => {
    const logged: Array<{ msg: string; meta?: unknown }> = [];
    const boss = {
      async send() {
        throw new Error('pg-boss is down');
      },
    } as unknown as PgBoss;

    // Resolving (not rejecting) is the entire contract: the caller is inside a
    // VOC write transaction and must never see this error.
    await expect(
      createVocEmbeddingEnqueuer({
        boss,
        embeddingEnabled: true,
        log: { error: (msg, meta) => logged.push({ msg, meta }) },
      }).enqueue(args),
    ).resolves.toBeUndefined();

    expect(logged).toHaveLength(1);
    expect(logged[0]?.msg).toContain('enqueue failed');
  });

  it('the no-op enqueuer never touches a queue', async () => {
    await expect(createNoopVocEmbeddingEnqueuer().enqueue(args)).resolves.toBeUndefined();
  });
});
