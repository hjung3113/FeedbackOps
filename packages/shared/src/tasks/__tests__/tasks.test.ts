import { describe, expect, it } from 'vitest';

import { assignTaskMilestoneRequestSchema, taskDetailDtoSchema, taskDtoSchema } from '../index.js';

const U1 = '01919b8c-0000-7000-8000-000000000001';
const U2 = '01919b8c-0000-7000-8000-000000000002';
const U3 = '01919b8c-0000-7000-8000-000000000003';
const U4 = '01919b8c-0000-7000-8000-000000000004';

const baseTask = {
  id: U1,
  workspace_id: U2,
  display_id: 'TASK-1000',
  primary_managed_system_id: U3,
  title: 'Stabilize export pipeline',
  status: 'backlog',
  priority: 'high',
  assignee_actor_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: U4,
  created_by: U2,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} as const;

describe('taskDtoSchema', () => {
  it('accepts the task list DTO shape', () => {
    expect(() => taskDtoSchema.parse(baseTask)).not.toThrow();
  });
});

describe('taskDetailDtoSchema', () => {
  it('accepts a task detail with source request and source finding summary', () => {
    const parsed = taskDetailDtoSchema.parse({
      ...baseTask,
      source: {
        task_request: {
          id: U4,
          status: 'converted',
        },
        finding: {
          id: U1,
          title: 'Export failures',
          summary: 'VOC evidence needs execution.',
          evidence_count: 2,
        },
      },
    });

    expect(parsed.source?.finding?.evidence_count).toBe(2);
  });

  it('accepts a standalone task with null source', () => {
    expect(() =>
      taskDetailDtoSchema.parse({
        ...baseTask,
        source_task_request_id: null,
        source: null,
      }),
    ).not.toThrow();
  });

  it('rejects undeclared source fields', () => {
    expect(() =>
      taskDetailDtoSchema.parse({
        ...baseTask,
        source: {
          finding: {
            id: U1,
            title: 'Export failures',
            summary: 'VOC evidence needs execution.',
            evidence_count: 2,
            private_note: 'not allowed',
          },
        },
      }),
    ).toThrow();
  });
});

describe('taskDetailDtoSchema source.voc (#378)', () => {
  const vocAllowed = {
    visibility_state: 'allowed',
    id: U3,
    display_id: 'V-1042',
    title: 'Login latency complaints',
  } as const;

  it('accepts the allowed verdict with id, display_id, and title', () => {
    const parsed = taskDetailDtoSchema.parse({
      ...baseTask,
      source: {
        task_request: { id: U4, status: 'approved' },
        voc: vocAllowed,
      },
    });

    expect(parsed.source?.voc).toEqual(vocAllowed);
  });

  it('accepts summary_visible carrying no identifiers', () => {
    const parsed = taskDetailDtoSchema.parse({
      ...baseTask,
      source: { voc: { visibility_state: 'summary_visible' } },
    });

    expect(parsed.source?.voc).toEqual({ visibility_state: 'summary_visible' });
  });

  it('accepts denied carrying no identifiers', () => {
    const parsed = taskDetailDtoSchema.parse({
      ...baseTask,
      source: { voc: { visibility_state: 'denied' } },
    });

    expect(parsed.source?.voc).toEqual({ visibility_state: 'denied' });
  });

  it('accepts a source without voc (hidden is omitted, never serialized)', () => {
    const parsed = taskDetailDtoSchema.parse({
      ...baseTask,
      source: { task_request: { id: U4, status: 'approved' } },
    });

    expect(parsed.source?.voc).toBeUndefined();
  });

  it('rejects the hidden state — the key is omitted instead', () => {
    expect(() =>
      taskDetailDtoSchema.parse({
        ...baseTask,
        source: { voc: { visibility_state: 'hidden' } },
      }),
    ).toThrow();
  });

  it('rejects allowed without id', () => {
    const { id: _id, ...withoutId } = vocAllowed;
    expect(() =>
      taskDetailDtoSchema.parse({
        ...baseTask,
        source: { voc: withoutId },
      }),
    ).toThrow();
  });

  it('rejects allowed without title', () => {
    const { title: _title, ...withoutTitle } = vocAllowed;
    expect(() =>
      taskDetailDtoSchema.parse({
        ...baseTask,
        source: { voc: withoutTitle },
      }),
    ).toThrow();
  });

  it('rejects extra keys on the denied verdict', () => {
    expect(() =>
      taskDetailDtoSchema.parse({
        ...baseTask,
        source: { voc: { visibility_state: 'denied', id: U3 } },
      }),
    ).toThrow();
  });

  it('rejects unknown visibility_state values', () => {
    expect(() =>
      taskDetailDtoSchema.parse({
        ...baseTask,
        source: { voc: { visibility_state: 'public' } },
      }),
    ).toThrow();
  });
});

describe('assignTaskMilestoneRequestSchema (#514 B1b)', () => {
  const U5 = '01919b8c-0000-7000-8000-000000000005';

  it('accepts a milestone uuid', () => {
    expect(assignTaskMilestoneRequestSchema.parse({ milestone_id: U5 })).toEqual({
      milestone_id: U5,
    });
  });

  it('accepts null to unassign', () => {
    expect(assignTaskMilestoneRequestSchema.parse({ milestone_id: null })).toEqual({
      milestone_id: null,
    });
  });

  it('rejects a non-uuid milestone_id', () => {
    expect(() => assignTaskMilestoneRequestSchema.parse({ milestone_id: 'MLS-1' })).toThrow();
  });

  it('rejects a missing milestone_id', () => {
    expect(() => assignTaskMilestoneRequestSchema.parse({})).toThrow();
  });

  it('rejects unknown keys (strict)', () => {
    expect(() =>
      assignTaskMilestoneRequestSchema.parse({ milestone_id: U5, status: 'planning' }),
    ).toThrow();
  });
});
