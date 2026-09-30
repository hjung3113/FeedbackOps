import { describe, expect, it } from 'vitest';

import {
  listNotificationsResponseSchema,
  notificationDtoSchema,
  notificationEventTypeSchema,
} from '../index.js';

describe('@fops/shared notifications API', () => {
  it('exports the event enum and list response schema', () => {
    expect(notificationEventTypeSchema.parse('task_request.needs_more_evidence')).toBe(
      'task_request.needs_more_evidence',
    );
    expect(() => notificationEventTypeSchema.parse('survey.assigned_to_me')).toThrow();

    const response = {
      items: [
        {
          id: '01919b8c-0000-7000-8000-000000000001',
          event_type: 'task_request.needs_more_evidence',
          subject_type: 'task_request',
          subject_id: '01919b8c-0000-7000-8000-000000000002',
          summary: '작업 요청에 추가 근거가 필요합니다.',
          detail: {},
          created_at: '2026-09-29T00:00:00.000Z',
          read_at: null,
          archived_at: null,
        },
      ],
      page: { cursor: 'opaque', has_more: true },
      unread_count: 3,
    };
    expect(listNotificationsResponseSchema.parse(response)).toEqual(response);
  });

  it('accepts allowed and unavailable subject references without text leakage', () => {
    const notification = {
      id: '01919b8c-0000-7000-8000-000000000001',
      event_type: 'task_request.needs_more_evidence',
      subject_type: 'task_request',
      subject_id: '01919b8c-0000-7000-8000-000000000002',
      summary: '작업 요청에 추가 근거가 필요합니다.',
      detail: {},
      created_at: '2026-09-29T00:00:00.000Z',
      read_at: null,
      archived_at: null,
    };
    expect(
      notificationDtoSchema.parse({
        ...notification,
        subject_ref: {
          visibility_state: 'allowed',
          display_id: 'VOC-0123',
          title: 'Could not submit the form',
        },
      }).subject_ref,
    ).toEqual({
      visibility_state: 'allowed',
      display_id: 'VOC-0123',
      title: 'Could not submit the form',
    });
    expect(
      notificationDtoSchema.parse({
        ...notification,
        subject_ref: { visibility_state: 'unavailable' },
      }).subject_ref,
    ).toEqual({ visibility_state: 'unavailable' });
    expect(() =>
      notificationDtoSchema.parse({
        ...notification,
        subject_ref: { visibility_state: 'unavailable', title: 'private subject text' },
      }),
    ).toThrow();
  });
});
