import { describe, expect, it } from 'vitest';

import { taskDetailDtoSchema, taskDtoSchema } from '../index.js';

const U1 = '01919b8c-0000-7000-8000-000000000001';
const U2 = '01919b8c-0000-7000-8000-000000000002';
const U3 = '01919b8c-0000-7000-8000-000000000003';
const U4 = '01919b8c-0000-7000-8000-000000000004';

const baseTask = {
  id: U1,
  workspace_id: U2,
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
