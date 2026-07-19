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
  const base = {
    id: U1,
    workspace_id: U2,
    display_id: 'FIN-1000',
    primary_managed_system_id: U3,
    title: 'Export failures',
    summary: 'VOC evidence needs synthesis.',
    evidence_count: 0,
    severity: 'high' as const,
    confidence: null,
    status: 'draft' as const,
    analytics_area_id: null,
    linked_task_id: null,
    linked_milestone_id: null,
    created_by: U2,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('continues to require and accept source_id for VOC findings', () => {
    const vocFinding = {
      ...base,
      source_type: 'voc' as const,
      source_id: U1,
      source: {
        type: 'voc' as const,
        id: U1,
        relation_type: 'created_finding' as const,
        link_id: U3,
      },
    };

    expect(findingDtoSchema.parse(vocFinding)).toEqual(vocFinding);
    expect(() => {
      const { source_id: _sourceId, ...missingSourceId } = vocFinding;
      findingDtoSchema.parse(missingSourceId);
    }).toThrow();
  });

  it('omits source_id for survey_response findings', () => {
    const surveyResponseFinding = {
      ...base,
      source_type: 'survey_response' as const,
    };

    expect(findingDtoSchema.parse(surveyResponseFinding)).toEqual(surveyResponseFinding);
    expect(() => findingDtoSchema.parse({ ...surveyResponseFinding, source_id: U1 })).toThrow();
  });

  it('rejects a raw survey response ID from survey_response Finding provenance', () => {
    const surveyResponseFinding = {
      ...base,
      source_type: 'survey_response' as const,
      source: {
        type: 'survey_response' as const,
        relation_type: 'generated_finding' as const,
      },
    };

    expect(findingDtoSchema.parse(surveyResponseFinding)).toEqual(surveyResponseFinding);
    expect(() =>
      findingDtoSchema.parse({
        ...surveyResponseFinding,
        source: { ...surveyResponseFinding.source, id: U1 },
      }),
    ).toThrow();
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

  it('accepts safe survey_response provenance and rejects an unknown source type', () => {
    expect(
      findingSourceSchema.parse({
        type: 'survey_response',
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

  it('continues to parse VOC evidence DTOs with their source ID', () => {
    const vocHighlight = {
      ...highlightBase,
      source_type: 'voc' as const,
      source_id: U1,
      source_title: 'Export failures',
      source_meta: 'VOC-001',
    };

    expect(evidenceHighlightDtoSchema.parse(vocHighlight)).toEqual(vocHighlight);
  });

  it('continues to accept a nullable note source ID and reject a malformed one', () => {
    expect(
      evidenceHighlightDtoSchema.parse({
        ...highlightBase,
        source_type: 'note',
        source_id: null,
        source_title: null,
        source_meta: null,
      }),
    ).toMatchObject({ source_type: 'note', source_id: null });
    expect(() =>
      evidenceHighlightDtoSchema.parse({
        ...highlightBase,
        source_type: 'note',
        source_id: 'not-a-uuid',
        source_title: null,
        source_meta: null,
      }),
    ).toThrow();
  });

  it('continues to parse a note evidence DTO with a valid source ID', () => {
    const noteHighlight = {
      ...highlightBase,
      source_type: 'note' as const,
      source_id: U1,
      source_title: null,
      source_meta: null,
    };

    expect(evidenceHighlightDtoSchema.parse(noteHighlight)).toMatchObject({ source_id: U1 });
  });

  it('accepts the backend-generated Survey Finding request with no excerpts', () => {
    expect(
      createFindingFromSurveyResponseRequestSchema.parse({
        severity: 'high',
        approved_excerpt_ids: [],
      }),
    ).toEqual({ severity: 'high', approved_excerpt_ids: [] });
  });

  it('rejects title and summary keys on an otherwise-valid Survey Finding request', () => {
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
        approved_excerpt_ids: [U1],
        summary: 'Must be backend generated',
      }),
    ).toThrow();
  });

  it('rejects malformed approval IDs on the Survey Finding request', () => {
    expect(() =>
      createFindingFromSurveyResponseRequestSchema.parse({
        severity: 'high',
        approved_excerpt_ids: ['not-a-uuid'],
      }),
    ).toThrow();
  });

  it('requires approved_excerpt_ids on the Survey Finding request', () => {
    expect(() =>
      createFindingFromSurveyResponseRequestSchema.parse({ severity: 'high' }),
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
