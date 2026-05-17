// C4 (Slice 3 prologue Task 8): pin that `cascadeArchiveActiveChildren`
// propagates a thrown auditService error so the parent tx rolls back.
//
// ADR-0017:58 ("in the same transaction") makes this load-bearing — a
// regression that swallowed the audit error would write partial cascade
// state without alerting. The helper currently awaits without try/catch
// around `auditService.record`, so the error naturally propagates; this
// test is the regression guard.

import { describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../../core/audit/audit-service.js';
import { cascadeArchiveActiveChildren } from '../analytics-area-service.js';

describe('cascadeArchiveActiveChildren rollback on audit failure (C4)', () => {
  it('propagates a thrown auditService error so the parent tx can rollback', async () => {
    const childId = '00000000-0000-0000-0000-0000000000aa';

    // Minimal stub satisfying the drizzle verbs the helper + nested
    // `archiveAnalyticsAreaInTx` actually call:
    //   1. cascadeArchiveActiveChildren: tx.select().from().where()
    //      -> [{ id: childId }]
    //   2. archiveAnalyticsAreaInTx: tx.update().set().where().returning()
    //      -> [{ id: childId }]
    // Anything beyond that is unused by the code paths under test.
    const fakeTx = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ id: childId }]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{ id: childId }]),
          }),
        }),
      }),
    } as unknown as Parameters<typeof cascadeArchiveActiveChildren>[0];

    const recordSpy = vi.fn().mockRejectedValue(new Error('audit failure'));
    const throwingAudit = { record: recordSpy } as unknown as AuditService;

    await expect(
      cascadeArchiveActiveChildren(fakeTx, throwingAudit, {
        workspaceId: '11111111-1111-1111-1111-111111111111',
        actorId: '11111111-aaaa-aaaa-aaaa-111111111111',
        managedSystemId: '00000000-0000-0000-0000-0000000000ff',
        now: new Date('2026-05-17T00:00:00Z'),
      }),
    ).rejects.toThrow('audit failure');

    expect(recordSpy).toHaveBeenCalledTimes(1);
  });
});
