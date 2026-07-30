// Schema-level tests for the Survey audit detail vocabulary (Slice 8 #191).
//
// The audit payload may identify a survey/question and describe structural
// changes, but it must never carry question copy, option labels, or respondent
// data. These tests pin the `.strict()` privacy boundary at write time.

import { describe, expect, it } from 'vitest';

import {
  AUDIT_EVENT_DETAIL_SCHEMAS,
  AUDIT_EVENT_TYPES,
  findingCreatedFromSurveyResponseDetailSchema,
} from '../../enums/audit-events.js';
import { CAPABILITIES, CAPABILITY_META } from '../../enums/capabilities.js';
import {
  SURVEY_QUESTION_AUDIT_FIELDS,
  surveyClosedDetailSchema,
  surveyCreatedDetailSchema,
  surveyOpenedDetailSchema,
  surveyQuestionCreatedDetailSchema,
  surveyQuestionDeletedDetailSchema,
  surveyQuestionUpdatedDetailSchema,
  surveyResponseExcerptApprovedDetailSchema,
  surveyResponsePersonalReadDetailSchema,
  surveyResponseSubmittedDetailSchema,
  surveyQuestionsReorderedDetailSchema,
  surveyUpdatedDetailSchema,
} from '../survey.js';

const U = '01919b8c-0000-7000-8000-000000000001';
const V = '01919b8c-0000-7000-8000-000000000002';
const W = '01919b8c-0000-7000-8000-000000000003';

const surveyCreated = {
  survey_id: U,
  display_id: 'SRV-001',
  survey_type: 'discovery',
  primary_managed_system_id: V,
  analytics_area_id: null,
  operator_actor_id: W,
  operator_resolution: 'explicit',
  responses_identity_protected: true,
} as const;

const surveyQuestionCreated = {
  survey_id: U,
  question_id: V,
  kind: 'single_choice',
  branch_depth: 0,
  sort_order: 1,
} as const;

const surveyQuestionUpdated = {
  survey_id: U,
  question_id: V,
  changed_fields: ['sort_order'],
  ordering_changed: true,
} as const;

const surveyQuestionDeleted = {
  survey_id: U,
  question_id: V,
  kind: 'text',
  branch_depth: 1,
} as const;

const surveyOpened = {
  survey_id: U,
  display_id: 'SRV-001',
  question_count: 1,
} as const;

const surveyClosed = {
  survey_id: U,
  display_id: 'SRV-001',
} as const;
const surveyUpdated = { survey_id: U } as const;
const surveyQuestionsReordered = { survey_id: U } as const;

const surveyResponseSubmitted = {
  survey_id: U,
  response_id: V,
  question_count: 3,
  identity_protected: true,
} as const;

const surveyResponsePersonalRead = { survey_id: U, survey_response_id: V, question_id: W } as const;
const surveyResponseExcerptApproved = {
  ...surveyResponsePersonalRead,
  approved_excerpt_id: '01919b8c-0000-7000-8000-000000000004',
} as const;
const findingCreatedFromSurveyResponse = {
  finding_id: U,
  source_survey_response_id: V,
  source_survey_id: W,
  primary_managed_system_id: '01919b8c-0000-7000-8000-000000000004',
  identity_protected: true,
  source_type: 'survey_response',
} as const;

describe('Survey audit detail schemas', () => {
  it.each([
    ['survey_created', surveyCreatedDetailSchema, surveyCreated],
    ['survey_updated', surveyUpdatedDetailSchema, surveyUpdated],
    ['survey_questions_reordered', surveyQuestionsReorderedDetailSchema, surveyQuestionsReordered],
    ['survey_question_created', surveyQuestionCreatedDetailSchema, surveyQuestionCreated],
    ['survey_question_updated', surveyQuestionUpdatedDetailSchema, surveyQuestionUpdated],
    ['survey_question_deleted', surveyQuestionDeletedDetailSchema, surveyQuestionDeleted],
    ['survey_opened', surveyOpenedDetailSchema, surveyOpened],
    ['survey_closed', surveyClosedDetailSchema, surveyClosed],
    ['survey_response_submitted', surveyResponseSubmittedDetailSchema, surveyResponseSubmitted],
    [
      'survey_response_personal_read',
      surveyResponsePersonalReadDetailSchema,
      surveyResponsePersonalRead,
    ],
    [
      'survey_response_excerpt_approved',
      surveyResponseExcerptApprovedDetailSchema,
      surveyResponseExcerptApproved,
    ],
    [
      'finding_created_from_survey_response',
      findingCreatedFromSurveyResponseDetailSchema,
      findingCreatedFromSurveyResponse,
    ],
  ])('%s round-trips canonical detail', (_event, schema, payload) => {
    expect(schema.parse(payload)).toEqual(payload);
  });

  it.each([
    ['prompt', 'What should we ask?'],
    ['options', ['Yes', 'No']],
    ['respondent_actor_id', W],
  ])('rejects forbidden %s detail (privacy invariant — .strict())', (field, value) => {
    expect(() =>
      surveyQuestionCreatedDetailSchema.parse({ ...surveyQuestionCreated, [field]: value }),
    ).toThrow();
  });

  it('rejects respondent data on survey creation (privacy invariant — .strict())', () => {
    expect(() =>
      surveyCreatedDetailSchema.parse({ ...surveyCreated, respondent_actor_id: W }),
    ).toThrow();
  });

  it('rejects an empty changed_fields array', () => {
    expect(() =>
      surveyQuestionUpdatedDetailSchema.parse({ ...surveyQuestionUpdated, changed_fields: [] }),
    ).toThrow();
  });

  it.each([
    'What is your favorite color?',
    'respondent@example.com',
    '01919b8c-0000-7000-8000-000000000004',
  ])('rejects non-field changed_fields values', (changedField) => {
    expect(() =>
      surveyQuestionUpdatedDetailSchema.parse({
        ...surveyQuestionUpdated,
        changed_fields: [changedField],
      }),
    ).toThrow();
  });

  it('accepts a valid subset of survey question audit fields', () => {
    const changed_fields = ['prompt', 'options', 'sort_order'] as const;

    expect(SURVEY_QUESTION_AUDIT_FIELDS).toEqual(expect.arrayContaining([...changed_fields]));
    expect(
      surveyQuestionUpdatedDetailSchema.parse({ ...surveyQuestionUpdated, changed_fields }),
    ).toEqual({
      ...surveyQuestionUpdated,
      changed_fields,
    });
  });

  it('rejects a zero question_count', () => {
    expect(() => surveyOpenedDetailSchema.parse({ ...surveyOpened, question_count: 0 })).toThrow();
  });

  it.each([true, false])(
    'accepts a response submission with identity_protected=%s',
    (identity_protected) => {
      expect(
        surveyResponseSubmittedDetailSchema.parse({
          ...surveyResponseSubmitted,
          identity_protected,
        }),
      ).toEqual({
        ...surveyResponseSubmitted,
        identity_protected,
      });
    },
  );

  it.each(['survey_id', 'response_id', 'question_count', 'identity_protected'] as const)(
    'rejects a response submission missing %s',
    (field) => {
      const { [field]: _missing, ...payload } = surveyResponseSubmitted;

      expect(() => surveyResponseSubmittedDetailSchema.parse(payload)).toThrow();
    },
  );

  it.each([
    ['answer_text', 'My answer'],
    ['prompt', 'How satisfied are you?'],
    ['answers', [{ question_id: W, value: 'yes' }]],
  ])('rejects response submission %s (privacy invariant — .strict())', (field, value) => {
    expect(() =>
      surveyResponseSubmittedDetailSchema.parse({ ...surveyResponseSubmitted, [field]: value }),
    ).toThrow();
  });

  it.each([0, -1, 1.5])(
    'rejects invalid response submission question_count %s',
    (question_count) => {
      expect(() =>
        surveyResponseSubmittedDetailSchema.parse({ ...surveyResponseSubmitted, question_count }),
      ).toThrow();
    },
  );

  it('accepts response submission question_count 1', () => {
    expect(
      surveyResponseSubmittedDetailSchema.parse({ ...surveyResponseSubmitted, question_count: 1 }),
    ).toEqual({
      ...surveyResponseSubmitted,
      question_count: 1,
    });
  });
});

describe('Survey-response Finding audit privacy', () => {
  it.each([
    ['survey_response_personal_read', surveyResponsePersonalRead],
    ['survey_response_excerpt_approved', surveyResponseExcerptApproved],
    ['finding_created_from_survey_response', findingCreatedFromSurveyResponse],
  ] as const)('rejects respondent_actor_id smuggling for %s', (event, detail) => {
    expect(() =>
      AUDIT_EVENT_DETAIL_SCHEMAS[event].parse({ ...detail, respondent_actor_id: U }),
    ).toThrow();
  });

  it.each([
    ['survey_response_personal_read', surveyResponsePersonalRead],
    ['survey_response_excerpt_approved', surveyResponseExcerptApproved],
    ['finding_created_from_survey_response', findingCreatedFromSurveyResponse],
  ] as const)('rejects raw_text in %s audit detail', (event, detail) => {
    expect(() =>
      AUDIT_EVENT_DETAIL_SCHEMAS[event].parse({ ...detail, raw_text: 'raw answer' }),
    ).toThrow();
  });

  it('rejects redacted_excerpt in survey_response_excerpt_approved audit detail', () => {
    expect(() =>
      AUDIT_EVENT_DETAIL_SCHEMAS.survey_response_excerpt_approved.parse({
        ...surveyResponseExcerptApproved,
        redacted_excerpt: 'Approved text must not enter the audit detail.',
      }),
    ).toThrow();
  });
});

describe('Survey audit event registration', () => {
  const surveyEvents = [
    'survey_created',
    'survey_updated',
    'survey_questions_reordered',
    'survey_question_created',
    'survey_question_updated',
    'survey_question_deleted',
    'survey_opened',
    'survey_closed',
    'survey_response_submitted',
    'survey_response_personal_read',
    'survey_response_excerpt_approved',
    'finding_created_from_survey_response',
  ] as const;

  it.each(surveyEvents)('registers %s in the event vocabulary and detail schemas', (event) => {
    expect(AUDIT_EVENT_TYPES).toContain(event);
    expect(AUDIT_EVENT_DETAIL_SCHEMAS).toHaveProperty(event);
  });

  it('maps survey_response_submitted to its response submission schema', () => {
    const schema = AUDIT_EVENT_DETAIL_SCHEMAS.survey_response_submitted;

    expect(schema.parse(surveyResponseSubmitted)).toEqual(surveyResponseSubmitted);
    expect(() => schema.parse({ ...surveyResponseSubmitted, question_count: 0 })).toThrow();
  });
});

describe('CAPABILITY_META', () => {
  it('covers every capability', () => {
    expect(Object.keys(CAPABILITY_META).sort()).toEqual([...CAPABILITIES].sort());
  });
});
