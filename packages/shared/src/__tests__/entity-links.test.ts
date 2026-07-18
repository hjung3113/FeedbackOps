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
});
