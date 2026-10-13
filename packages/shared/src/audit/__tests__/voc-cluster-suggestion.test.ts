import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS } from '../../index.js';

const detail = {
  voc_a_id: '00000000-0000-4000-8000-000000000001',
  voc_b_id: '00000000-0000-4000-8000-000000000002',
  primary_managed_system_id: '00000000-0000-4000-8000-000000000003',
  revision: 2,
  embedding_version: 1,
  source_hash_a: 'a'.repeat(64),
  source_hash_b: 'b'.repeat(64),
  score: 0.9,
  cut: 0.85,
};
const events = [
  'voc_cluster_suggestion_confirmed',
  'voc_cluster_suggestion_discarded',
  'voc_cluster_suggestion_restored',
] as const;

describe('Cluster suggestion human audit details', () => {
  it.each(events)('registers a metadata-only strict %s schema', (event) => {
    const schema = AUDIT_EVENT_DETAIL_SCHEMAS[event];
    const value =
      event === 'voc_cluster_suggestion_confirmed'
        ? { ...detail, voc_cluster_id: '00000000-0000-4000-8000-000000000004' }
        : detail;
    expect(schema.safeParse(value).success).toBe(true);
    expect(schema.safeParse({ ...value, title: 'private copied title' }).success).toBe(false);
    expect(schema.safeParse({ ...value, description_rich_content: {} }).success).toBe(false);
    expect(schema.safeParse({ ...value, revision: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...value, source_hash_a: '' }).success).toBe(false);
    expect(schema.safeParse({ ...value, embedding_version: 0 }).success).toBe(false);
    expect(schema.safeParse({ ...value, voc_b_id: detail.voc_a_id }).success).toBe(false);
    expect(schema.safeParse({ ...value, score: 2 }).success).toBe(false);
  });
  it('requires the resulting Cluster only on confirmation', () => {
    const schema = AUDIT_EVENT_DETAIL_SCHEMAS.voc_cluster_suggestion_confirmed;
    expect(schema.safeParse(detail).success).toBe(false);
  });
});
