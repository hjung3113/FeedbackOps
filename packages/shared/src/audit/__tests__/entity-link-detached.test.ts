import { describe, expect, it } from 'vitest';

import { entityLinkDetachedDetailSchema } from '../entity-link.js';

const LINK = '01919b8c-0000-7000-8000-000000000001';
const SOURCE = '01919b8c-0000-7000-8000-000000000002';
const TARGET = '01919b8c-0000-7000-8000-000000000003';

// Generic-creatable tuples in entity-links/service.ts (not command-only writes).
const genericTuples = [
  ['voc', 'voc', 'related_to'],
  ['voc', 'finding', 'created_finding'],
  ['voc', 'finding', 'evidence_of'],
  ['voc_cluster', 'finding', 'created_finding'],
  ['finding', 'task_request', 'requested_task'],
  ['task_request', 'task', 'converted_to'],
  ['finding', 'task', 'requested_task'],
  ['voc', 'task', 'evidence_of'],
] as const;

describe('entity_link.detached details', () => {
  it.each(genericTuples)('accepts generic %s -> %s %s', (source, target, relation_type) => {
    const detail = {
      link_id: LINK,
      source: { type: source, id: SOURCE },
      target: { type: target, id: TARGET },
      relation_type,
      reason: 'Remove the obsolete link',
    };

    expect(entityLinkDetachedDetailSchema.parse(detail)).toEqual(detail);
  });

  // The owner-specific Cluster unlink command (voc-clusters/conversion.ts) also emits
  // entity_link.detached; that command-only tuple stays accepted for the event.
  it('accepts the Cluster unlink command tuple voc_cluster -> finding evidence_of', () => {
    const detail = {
      link_id: LINK,
      source: { type: 'voc_cluster', id: SOURCE },
      target: { type: 'finding', id: TARGET },
      relation_type: 'evidence_of',
      reason: 'Unlink the Cluster evidence',
    };
    expect(entityLinkDetachedDetailSchema.parse(detail)).toEqual(detail);
  });

  it.each([
    ['task_request', 'task', 'converted_to'],
    ['finding', 'task', 'requested_task'],
    ['voc', 'task', 'evidence_of'],
  ] as const)('rejects unexpected fields on %s -> %s %s', (source, target, relation_type) => {
    expect(
      entityLinkDetachedDetailSchema.safeParse({
        link_id: LINK,
        source: { type: source, id: SOURCE },
        target: { type: target, id: TARGET },
        relation_type,
        reason: 'Remove the obsolete link',
        unexpected_field: true,
      }).success,
    ).toBe(false);
  });

  it.each([
    ['survey_response', 'finding', 'generated_finding'],
    ['survey_response', 'finding', 'evidence_of'],
    ['voc', 'task_request', 'requested_task'],
    ['voc_cluster', 'task_request', 'requested_task'],
  ])('rejects command-only %s -> %s %s', (source, target, relation_type) => {
    expect(
      entityLinkDetachedDetailSchema.safeParse({
        link_id: LINK,
        source: { type: source, id: SOURCE },
        target: { type: target, id: TARGET },
        relation_type,
        reason: 'Remove the obsolete link',
      }).success,
    ).toBe(false);
  });
});
