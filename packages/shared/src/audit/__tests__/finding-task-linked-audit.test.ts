import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS, AUDIT_EVENT_TYPES } from '../../enums/audit-events.js';

const U1 = '01919b8c-0000-7000-8000-000000000001';
const U2 = '01919b8c-0000-7000-8000-000000000002';
const U3 = '01919b8c-0000-7000-8000-000000000003';

describe('finding_task_linked audit event', () => {
  it('is registered with strict detail fields', () => {
    expect(AUDIT_EVENT_TYPES).toContain('finding_task_linked');
    expect(AUDIT_EVENT_DETAIL_SCHEMAS).toHaveProperty('finding_task_linked');

    const parsed = AUDIT_EVENT_DETAIL_SCHEMAS.finding_task_linked.parse({
      finding_id: U1,
      task_id: U2,
      primary_managed_system_id: U3,
    });
    expect(parsed.task_id).toBe(U2);
  });

  it('rejects undeclared detail fields', () => {
    expect(() =>
      AUDIT_EVENT_DETAIL_SCHEMAS.finding_task_linked.parse({
        finding_id: U1,
        task_id: U2,
        primary_managed_system_id: U3,
        relation_type: 'requested_task',
      }),
    ).toThrow();
  });
});
