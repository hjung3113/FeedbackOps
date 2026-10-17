import { describe, expect, it } from 'vitest';
import {
  evidenceInventoryItemSchema,
  listEvidenceInventoryQuerySchema,
  listEvidenceInventoryResponseSchema,
} from '../index.js';

const id = '11111111-1111-4111-8111-111111111111';
const note = {
  id,
  finding_id: id,
  primary_managed_system_id: id,
  source_type: 'note',
  analytics_area_id: null,
  sentiment: null,
  importance: null,
  created_at: '2026-10-13T00:00:00.000Z',
  finding: { id, display_id: 'FIN-1', title: 'Safe parent' },
  content_state: 'available',
  quote_or_summary: 'Authored note',
};

describe('Evidence inventory wire boundary (ADR-0065)', () => {
  it('normalizes a bounded, independent inventory query', () => {
    expect(
      listEvidenceInventoryQuerySchema.parse({ q: '  Literal %_  ', managed_system_id: 'all' }),
    ).toEqual({ q: 'Literal %_', managed_system_id: 'all', limit: 50 });
    expect(listEvidenceInventoryQuerySchema.parse({ q: '  ', limit: '100' })).toEqual({
      q: '',
      limit: 100,
    });
  });
  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: '1.5' },
    { q: 'x'.repeat(201) },
    { managed_system_id: 'bad' },
    { source_type: 'survey' },
    { extra: 'value' },
  ])('rejects invalid query %j', (query) => {
    expect(listEvidenceInventoryQuerySchema.safeParse(query).success).toBe(false);
  });
  it('accepts the strict available and withheld projections without legacy provenance', () => {
    expect(evidenceInventoryItemSchema.parse(note)).toEqual(note);
    const { quote_or_summary: _, ...metadata } = note;
    expect(evidenceInventoryItemSchema.parse({ ...metadata, content_state: 'withheld' })).toEqual({
      ...metadata,
      content_state: 'withheld',
    });
    expect(
      evidenceInventoryItemSchema.safeParse({ ...note, content_state: 'withheld' }).success,
    ).toBe(false);
    expect(evidenceInventoryItemSchema.safeParse(metadata).success).toBe(false);
  });
  it.each([
    'workspace_id',
    'created_by',
    'source_id',
    'approved_excerpt_id',
    'response_id',
    'summary',
  ])('rejects non-allowlisted item field %s', (key) => {
    expect(evidenceInventoryItemSchema.safeParse({ ...note, [key]: id }).success).toBe(false);
  });
  it('enforces source-specific metadata and no parent summary, Survey jump or counts', () => {
    const source = {
      survey_type: 'outcome',
      survey_display_id: 'S-1',
      question_label: 'Safe question',
      identity_protected: true,
    };
    expect(
      evidenceInventoryItemSchema.safeParse({ ...note, source_type: 'survey_response', source })
        .success,
    ).toBe(true);
    for (const extra of [
      { response_id: id },
      { route: '/surveys/response' },
      { title: 'Private' },
    ]) {
      expect(
        evidenceInventoryItemSchema.safeParse({
          ...note,
          source_type: 'survey_response',
          source: { ...source, ...extra },
        }).success,
      ).toBe(false);
    }
    expect(evidenceInventoryItemSchema.safeParse({ ...note, source }).success).toBe(false);
    expect(
      evidenceInventoryItemSchema.safeParse({
        ...note,
        finding: { ...note.finding, summary: 'Hidden' },
      }).success,
    ).toBe(false);
    expect(listEvidenceInventoryResponseSchema.safeParse({ items: [note] }).success).toBe(false);
    expect(
      listEvidenceInventoryResponseSchema.safeParse({
        items: [note],
        page: { has_more: false, total: 1 },
      }).success,
    ).toBe(false);
  });
});
