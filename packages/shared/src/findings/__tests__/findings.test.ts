import { describe, expect, it } from 'vitest';

import {
  createFindingRequestSchema,
  findingDtoSchema,
  findingStatusSchema,
  linkTaskRequestSchema,
} from '../index.js';

const U1 = '01919b8c-0000-7000-8000-000000000001';
const U2 = '01919b8c-0000-7000-8000-000000000002';
const U3 = '01919b8c-0000-7000-8000-000000000003';

describe('createFindingRequestSchema', () => {
  it('accepts the VOC create-finding body shape', () => {
    const result = createFindingRequestSchema.parse({
      title: 'Export failures',
      summary: 'VOC evidence needs synthesis.',
      severity: 'high',
      confidence: 'medium',
      analytics_area_id: U1,
      primary_managed_system_id: U2,
    });

    expect(result.severity).toBe('high');
    expect(result.confidence).toBe('medium');
  });

  it('rejects source fields because source is route-shaped', () => {
    expect(() =>
      createFindingRequestSchema.parse({
        title: 'Export failures',
        summary: 'VOC evidence needs synthesis.',
        severity: 'high',
        source_id: U1,
      }),
    ).toThrow();
  });
});

describe('findingDtoSchema', () => {
  it('accepts a finding with immutable source columns and source link metadata', () => {
    expect(() =>
      findingDtoSchema.parse({
        id: U1,
        workspace_id: U2,
        primary_managed_system_id: U3,
        title: 'Export failures',
        summary: 'VOC evidence needs synthesis.',
        source_type: 'voc',
        source_id: U1,
        evidence_count: 0,
        severity: 'high',
        confidence: null,
        status: 'draft',
        analytics_area_id: null,
        linked_task_id: null,
        linked_milestone_id: null,
        created_by: U2,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        source: {
          type: 'voc',
          id: U1,
          relation_type: 'created_finding',
          link_id: U3,
        },
      }),
    ).not.toThrow();
  });
});

describe('findingStatusSchema', () => {
  it.each(['draft', 'active', 'not_actionable', 'converted', 'archived'] as const)(
    'accepts status=%s',
    (status) => {
      expect(findingStatusSchema.parse(status)).toBe(status);
    },
  );
});

describe('linkTaskRequestSchema', () => {
  it('accepts the Finding Link Task body shape', () => {
    expect(linkTaskRequestSchema.parse({ task_id: U1 })).toEqual({ task_id: U1 });
  });

  it('rejects undeclared fields', () => {
    expect(() => linkTaskRequestSchema.parse({ task_id: U1, finding_id: U2 })).toThrow();
  });
});
