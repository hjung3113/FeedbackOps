import type { NotificationDto, NotificationSubjectReference } from '@fops/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import { createNoopNotificationDispatcher } from '../port.js';
import { type NotificationActor, createNotificationService } from '../service.js';

const notificationRepo = vi.hoisted(() => ({
  archiveNotification: vi.fn(),
  decodeNotificationCursor: vi.fn(),
  listNotificationRows: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock('../repo.js', () => notificationRepo);

const SHARED_SUBJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UNIQUE_SUBJECTS: Array<{
  subject_type: NotificationDto['subject_type'];
  subject_id: string;
}> = [
  { subject_type: 'voc', subject_id: SHARED_SUBJECT_ID },
  { subject_type: 'task', subject_id: SHARED_SUBJECT_ID },
  { subject_type: 'task_request', subject_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  { subject_type: 'permission_request', subject_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
  {
    subject_type: 'public_update_review_candidate',
    subject_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  },
  { subject_type: 'voc', subject_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
  { subject_type: 'task', subject_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
  { subject_type: 'task_request', subject_id: '11111111-1111-4111-8111-111111111111' },
  { subject_type: 'permission_request', subject_id: '22222222-2222-4222-8222-222222222222' },
  { subject_type: 'voc', subject_id: '33333333-3333-4333-8333-333333333333' },
];

function makeRow(
  index: number,
  subject: (typeof UNIQUE_SUBJECTS)[number],
): {
  id: string;
  eventType: string;
  subjectType: NotificationDto['subject_type'];
  subjectId: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
} {
  return {
    id: `44444444-4444-4444-8444-${index.toString().padStart(12, '0')}`,
    eventType: 'voc.reporter_replied',
    subjectType: subject.subject_type,
    subjectId: subject.subject_id,
    summary: 'Notification test summary',
    detail: {},
    createdAt: new Date('2026-07-20T08:00:00.000Z'),
    readAt: null,
    archivedAt: null,
  };
}

describe('notification service subject reference resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates per type and id, caps concurrency at eight, and resolves each request afresh', async () => {
    const rows = [
      ...UNIQUE_SUBJECTS.map((subject, index) => makeRow(index, subject)),
      makeRow(10, { subject_type: 'voc', subject_id: SHARED_SUBJECT_ID }),
      makeRow(11, { subject_type: 'task', subject_id: SHARED_SUBJECT_ID }),
    ];
    notificationRepo.listNotificationRows.mockResolvedValue({
      items: rows,
      cursor: undefined,
      has_more: false,
      unread_count: rows.length,
    });

    const actor: NotificationActor = {
      actor_id: '55555555-5555-4555-8555-555555555555',
      workspace_id: '66666666-6666-4666-8666-666666666666',
      role_level: 'developer',
    };
    const query = { include_archived: false, limit: 100 };
    let requestVersion = 'first';
    let activeResolvers = 0;
    let maxActiveResolvers = 0;
    let startedCount = 0;
    const pendingResolutions: Array<() => void> = [];
    const startWaiters: Array<{ count: number; resolve: () => void }> = [];
    const waitForStarted = (count: number): Promise<void> => {
      if (startedCount >= count) return Promise.resolve();
      return new Promise((resolve) => startWaiters.push({ count, resolve }));
    };
    const signalStarted = (): void => {
      for (let index = startWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = startWaiters[index];
        if (waiter && startedCount >= waiter.count) {
          startWaiters.splice(index, 1);
          waiter.resolve();
        }
      }
    };
    const referenceFor = (
      subjectType: NotificationDto['subject_type'],
      subjectId: string,
    ): NotificationSubjectReference => ({
      visibility_state: 'allowed',
      display_id: `${subjectType}-${subjectId.slice(0, 8)}`,
      title: `${requestVersion}:${subjectType}:${subjectId}`,
    });
    const resolveSubjectReference = vi.fn(
      ({
        subject_type: subjectType,
        subject_id: subjectId,
      }: {
        actor: NotificationActor;
        subject_type: NotificationDto['subject_type'];
        subject_id: string;
      }): Promise<NotificationSubjectReference> => {
        startedCount += 1;
        signalStarted();
        if (requestVersion === 'second') {
          return Promise.resolve(referenceFor(subjectType, subjectId));
        }
        activeResolvers += 1;
        maxActiveResolvers = Math.max(maxActiveResolvers, activeResolvers);
        return new Promise((resolve) => {
          pendingResolutions.push(() => {
            activeResolvers -= 1;
            resolve(referenceFor(subjectType, subjectId));
          });
        });
      },
    );
    const service = createNotificationService({
      db: {} as Db,
      notificationDispatcher: createNoopNotificationDispatcher(),
      resolveSubjectReference,
    });

    const firstList = service.list(actor, query);
    await waitForStarted(8);
    expect(activeResolvers).toBe(8);
    expect(maxActiveResolvers).toBe(8);
    expect(resolveSubjectReference).toHaveBeenCalledTimes(8);

    for (const resolve of pendingResolutions.splice(0)) resolve();
    await waitForStarted(UNIQUE_SUBJECTS.length);
    expect(activeResolvers).toBe(2);
    expect(maxActiveResolvers).toBe(8);
    for (const resolve of pendingResolutions.splice(0)) resolve();

    const firstResponse = await firstList;
    expect(resolveSubjectReference).toHaveBeenCalledTimes(UNIQUE_SUBJECTS.length);
    expect(firstResponse.items[0]?.subject_ref).toMatchObject({
      title: `first:voc:${SHARED_SUBJECT_ID}`,
    });
    expect(firstResponse.items[1]?.subject_ref).toMatchObject({
      title: `first:task:${SHARED_SUBJECT_ID}`,
    });

    requestVersion = 'second';
    const secondResponse = await service.list(actor, query);
    expect(resolveSubjectReference).toHaveBeenCalledTimes(UNIQUE_SUBJECTS.length * 2);
    expect(secondResponse.items[0]?.subject_ref).toMatchObject({
      title: `second:voc:${SHARED_SUBJECT_ID}`,
    });
    expect(secondResponse.items[1]?.subject_ref).toMatchObject({
      title: `second:task:${SHARED_SUBJECT_ID}`,
    });
  });
});
