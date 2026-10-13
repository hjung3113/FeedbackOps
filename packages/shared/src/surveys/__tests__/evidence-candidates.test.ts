import { describe, expect, it } from 'vitest';
import {
  attachSurveyEvidenceRequestSchema,
  attachSurveyEvidenceResponseSchema,
  surveyEvidenceCandidateSchema,
  surveyEvidenceCandidatesQuerySchema,
  surveyEvidenceCandidatesResponseSchema,
} from '../../index.js';

const id = '11111111-1111-4111-8111-111111111111';
const candidate = {
  approved_excerpt_id: id,
  redacted_excerpt: 'Approved fragment',
  question_label: 'What could improve?',
  survey_type: 'discovery',
  survey_display_id: 'SRV-1',
  identity_protected: true,
};

describe('approved Survey selection contract (#1109)', () => {
  it('accepts bounded strict queries and safe candidates', () => {
    expect(surveyEvidenceCandidatesQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(surveyEvidenceCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      surveyEvidenceCandidatesResponseSchema.parse({
        response_state: 'visible',
        items: [candidate],
        page: { has_more: false },
      }).items,
    ).toEqual([candidate]);
  });

  it.each(['response_id', 'respondent_actor_id', 'raw_text', 'submitted_at', 'survey_title'])(
    'rejects private candidate field %s even for a holder',
    (field) => {
      expect(surveyEvidenceCandidateSchema.safeParse({ ...candidate, [field]: id }).success).toBe(
        false,
      );
    },
  );

  it.each([{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { q: 'text' }, { dimension: id }])(
    'rejects invalid or unsupported candidate query %j',
    (query) => {
      expect(surveyEvidenceCandidatesQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  it('suppressed states carry no items or continuation', () => {
    expect(
      surveyEvidenceCandidatesResponseSchema.safeParse({
        response_state: 'below_threshold',
        items: [candidate],
        page: { has_more: false },
      }).success,
    ).toBe(false);
    expect(
      surveyEvidenceCandidatesResponseSchema.safeParse({
        response_state: 'none',
        items: [],
        page: { has_more: true, cursor: 'opaque' },
      }).success,
    ).toBe(false);
  });

  it('requires a selection and returns only local mutation metadata', () => {
    expect(attachSurveyEvidenceRequestSchema.parse({ approved_excerpt_id: id })).toEqual({
      approved_excerpt_id: id,
    });
    expect(
      attachSurveyEvidenceResponseSchema.parse({ evidence_highlight_id: id, finding_id: id }),
    ).toEqual({ evidence_highlight_id: id, finding_id: id });
    for (const field of ['response_id', 'quote_or_summary', 'source_id', 'source_title']) {
      expect(
        attachSurveyEvidenceRequestSchema.safeParse({ approved_excerpt_id: id, [field]: id })
          .success,
      ).toBe(false);
      expect(
        attachSurveyEvidenceResponseSchema.safeParse({
          evidence_highlight_id: id,
          finding_id: id,
          [field]: id,
        }).success,
      ).toBe(false);
    }
  });
});
