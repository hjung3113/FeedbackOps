import { describe, expect, it } from 'vitest';

import { taskReporterSummarySchema } from '../entity-links.js';

describe('taskReporterSummarySchema', () => {
  it('accepts a Task reporter summary without a public update timestamp', () => {
    expect(
      taskReporterSummarySchema.parse({
        target_type: 'task',
        public_title: 'Reporter-safe Task title',
        reporter_facing_status: '진행 중',
      }),
    ).toEqual({
      target_type: 'task',
      public_title: 'Reporter-safe Task title',
      reporter_facing_status: '진행 중',
    });
  });

  it('rejects unknown fields so forbidden Task internals cannot enter the summary', () => {
    expect(() =>
      taskReporterSummarySchema.parse({
        target_type: 'task',
        public_title: 'Reporter-safe Task title',
        reporter_facing_status: '진행 중',
        priority: 'urgent',
        due_date: '2099-12-31',
      }),
    ).toThrow();
  });
});
