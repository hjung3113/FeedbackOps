import { describe, expect, it } from 'vitest';

import {
  entityLinkRelationTypeSchema,
  registeredEntityLinkPairSchema,
  taskReporterSummarySchema,
} from '../entity-links.js';

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

describe('Survey response Entity Link registry', () => {
  it.each([
    { source_type: 'survey_response', target_type: 'finding', relation_type: 'generated_finding' },
    { source_type: 'survey_response', target_type: 'finding', relation_type: 'evidence_of' },
  ] as const)('registers the allowed survey-response pair: %o', (pair) => {
    expect(registeredEntityLinkPairSchema.parse(pair)).toEqual(pair);
  });

  it.each([
    { source_type: 'survey_response', target_type: 'finding', relation_type: 'created_finding' },
    { source_type: 'finding', target_type: 'survey_response', relation_type: 'generated_finding' },
    { source_type: 'survey_response', target_type: 'voc', relation_type: 'evidence_of' },
  ])('rejects an unregistered survey-response pair: %o', (pair) => {
    expect(() => registeredEntityLinkPairSchema.parse(pair)).toThrow();
  });

  it('does not add generated_voc to the relation vocabulary', () => {
    expect(entityLinkRelationTypeSchema.options).not.toContain('generated_voc');

    // @ts-expect-error generated_voc must never become an Entity Link relation.
    const forbiddenRelation: import('../entity-links.js').EntityLinkRelationType = 'generated_voc';
    expect(forbiddenRelation).toBe('generated_voc');
  });
});
