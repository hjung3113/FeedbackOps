import { notificationEventTypeSchema } from '@fops/shared';
import { describe, expect, it, vi } from 'vitest';

import type { NotificationTx } from '../port.js';

import { notificationCatalogue } from '../catalogue.js';
import { createNotificationNotifier } from '../dispatcher.js';
import { createRecordingNotificationDispatcher } from '../port.js';

function txWithActorRows(rows: Array<{ id: string }>) {
  const execute = vi.fn().mockResolvedValue({ rows });
  return { tx: { execute } as unknown as NotificationTx };
}

describe('notification catalogue', () => {
  it('keeps the catalogue keys identical to the shared event-type enum the frontend parses', () => {
    expect(Object.keys(notificationCatalogue).sort()).toEqual(
      [...notificationEventTypeSchema.options].sort(),
    );
  });

  it('pins the implemented event keys and email flags', () => {
    expect(Object.keys(notificationCatalogue)).toEqual([
      'voc.assigned_to_me',
      'voc.reporter_replied',
      'voc.severity_set_high_or_critical',
      'task_request.approved',
      'task_request.rejected',
      'task_request.needs_more_evidence',
      'task.assigned_to_me',
      'task.released',
      'permission_request.submitted',
      'permission_request.decided',
    ]);
    expect(
      Object.fromEntries(
        Object.entries(notificationCatalogue).map(([eventType, row]) => [eventType, row.email]),
      ),
    ).toEqual({
      'voc.assigned_to_me': false,
      'voc.reporter_replied': false,
      'voc.severity_set_high_or_critical': true,
      'task_request.approved': false,
      'task_request.rejected': true,
      'task_request.needs_more_evidence': false,
      'task.assigned_to_me': false,
      'task.released': false,
      'permission_request.submitted': true,
      'permission_request.decided': true,
    });
  });

  it('renders the exact Korean summaries from catalogue parameters', () => {
    expect(notificationCatalogue['voc.assigned_to_me'].summary()).toBe(
      'VOC 담당자로 지정되었습니다.',
    );
    expect(notificationCatalogue['voc.reporter_replied'].summary()).toBe(
      'VOC에 작성자 답변이 등록되었습니다.',
    );
    expect(
      notificationCatalogue['voc.severity_set_high_or_critical'].summary({ severity: 'high' }),
    ).toBe('VOC 심각도가 높음으로 설정되었습니다.');
    expect(
      notificationCatalogue['voc.severity_set_high_or_critical'].summary({
        severity: 'critical',
      }),
    ).toBe('VOC 심각도가 매우 높음으로 설정되었습니다.');
    expect(notificationCatalogue['task_request.approved'].summary()).toBe(
      '작업 요청이 승인되었습니다.',
    );
    expect(notificationCatalogue['task_request.rejected'].summary()).toBe(
      '작업 요청이 반려되었습니다.',
    );
    expect(notificationCatalogue['task_request.needs_more_evidence'].summary()).toBe(
      '작업 요청에 추가 근거가 필요합니다.',
    );
    expect(notificationCatalogue['task.assigned_to_me'].summary()).toBe(
      '작업 담당자로 지정되었습니다.',
    );
    expect(notificationCatalogue['task.released'].summary()).toBe(
      '연결된 VOC에 공개 업데이트 검토 요청이 등록되었습니다.',
    );
    expect(notificationCatalogue['permission_request.submitted'].summary()).toBe(
      '새 권한 요청이 등록되었습니다.',
    );
    expect(
      notificationCatalogue['permission_request.decided'].summary({ outcome: 'approved' }),
    ).toBe('권한 요청이 승인되었습니다.');
    expect(
      notificationCatalogue['permission_request.decided'].summary({ outcome: 'rejected' }),
    ).toBe('권한 요청이 반려되었습니다.');
  });

  it('does not enqueue empty recipient lists and rejects unknown runtime event types', async () => {
    const dispatcher = createRecordingNotificationDispatcher();
    const notify = createNotificationNotifier(dispatcher);
    const tx = {} as NotificationTx;
    const base = {
      workspace_id: 'a9f5593a-cfc7-472d-a008-cf8d965371c6',
      actor_ids: [],
      subject_id: '2dd696db-60bf-4ab1-b5df-76c028e7020a',
      correlation_id: '6db8368e-dd72-49d2-9abc-27091ac16eca',
      params: {},
    };

    await expect(notify(tx, 'voc.assigned_to_me', base)).resolves.toBeUndefined();
    expect(dispatcher.jobs).toEqual([]);
    await expect(
      notify(tx, 'unsupported.event' as never, { ...base, actor_ids: ['actor'] } as never),
    ).rejects.toThrow("Unknown notification event_type 'unsupported.event'.");
  });

  it('enqueues only workspace members and silently drops unknown or foreign recipients', async () => {
    const dispatcher = createRecordingNotificationDispatcher();
    const notify = createNotificationNotifier(dispatcher);
    const memberTx = txWithActorRows([{ id: 'member' }]);
    const envelope = {
      workspace_id: 'a9f5593a-cfc7-472d-a008-cf8d965371c6',
      actor_ids: ['member', 'foreign-or-unknown', 'member'],
      subject_id: '2dd696db-60bf-4ab1-b5df-76c028e7020a',
      correlation_id: '6db8368e-dd72-49d2-9abc-27091ac16eca',
      params: {},
    };

    await expect(notify(memberTx.tx, 'task.assigned_to_me', envelope)).resolves.toBeUndefined();
    expect(dispatcher.jobs.map((job) => job.actor_id)).toEqual(['member']);

    const noMembersTx = txWithActorRows([]);
    await expect(
      notify(noMembersTx.tx, 'task.assigned_to_me', {
        ...envelope,
        actor_ids: ['foreign', 'unknown'],
      }),
    ).resolves.toBeUndefined();
    expect(dispatcher.jobs).toHaveLength(1);
  });
});
