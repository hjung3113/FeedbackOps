import { describe, expect, it } from 'vitest';

import {
  approvedExcerptDtoSchema,
  createFindingFromSurveyResponseRequestSchema,
  createFindingRequestSchema,
  evidenceHighlightDtoSchema,
  findingDtoSchema,
  findingSourceSchema,
  findingStatusSchema,
  linkTaskRequestSchema,
  surveyResponseExcerptCandidateDtoSchema,
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
        display_id: 'FIN-1000',
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

describe('survey-response Finding provenance and safe evidence DTOs', () => {
  const highlightBase = {
    id: U1,
    workspace_id: U2,
    finding_id: U3,
    primary_managed_system_id: U1,
    quote_or_summary: 'Approved redacted excerpt',
    analytics_area_id: null,
    sentiment: null,
    importance: null,
    created_by: U2,
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('accepts survey_response provenance and rejects an unknown source type', () => {
    expect(
      findingSourceSchema.parse({
        type: 'survey_response',
        id: U1,
        relation_type: 'generated_finding',
      }),
    ).toMatchObject({ type: 'survey_response', relation_type: 'generated_finding' });
    expect(() =>
      findingSourceSchema.parse({
        type: 'survey_result',
        id: U1,
        relation_type: 'generated_finding',
      }),
    ).toThrow();
  });

  it('omits the response UUID from survey-response evidence DTOs', () => {
    const safeHighlight = {
      ...highlightBase,
      source_type: 'survey_response',
      source_title: 'Survey response',
      source_meta: 'validation · SRV-001 · Identity protected',
    };

    expect(evidenceHighlightDtoSchema.parse(safeHighlight)).toEqual(safeHighlight);
    expect(() => evidenceHighlightDtoSchema.parse({ ...safeHighlight, source_id: U1 })).toThrow();
  });

  it('continues to require the source_id key for VOC evidence DTOs', () => {
    expect(() =>
      evidenceHighlightDtoSchema.parse({
        ...highlightBase,
        source_type: 'voc',
        source_title: 'Export failures',
        source_meta: 'VOC-001',
      }),
    ).toThrow();
  });

  it('accepts the backend-generated Survey Finding request with no excerpts', () => {
    expect(
      createFindingFromSurveyResponseRequestSchema.parse({
        severity: 'high',
        approved_excerpt_ids: [],
      }),
    ).toEqual({ severity: 'high', approved_excerpt_ids: [] });
  });

  it('rejects title, summary, and malformed approval IDs on the Survey Finding request', () => {
    expect(() =>
      createFindingFromSurveyResponseRequestSchema.parse({
        severity: 'high',
        approved_excerpt_ids: [U1],
        title: 'Must be backend generated',
      }),
    ).toThrow();
    expect(() =>
      createFindingFromSurveyResponseRequestSchema.parse({
        severity: 'high',
        approved_excerpt_ids: ['not-a-uuid'],
        summary: 'Must be backend generated',
      }),
    ).toThrow();
  });

  it('models approved excerpts and the audited-only raw-text candidate shape', () => {
    expect(
      approvedExcerptDtoSchema.parse({
        approved_excerpt_id: U1,
        question_id: U2,
        redacted_excerpt: 'Approved excerpt',
      }),
    ).toMatchObject({ approved_excerpt_id: U1, question_id: U2 });
    expect(
      surveyResponseExcerptCandidateDtoSchema.parse({
        question_id: U1,
        question_label: 'What should improve?',
        raw_text: 'Only the audited personal-candidate route may return this.',
      }),
    ).toMatchObject({ question_id: U1 });
  });
});
