// Schema-level tests for the Survey audit detail vocabulary (Slice 8 #191).
//
// The audit payload may identify a survey/question and describe structural
// changes, but it must never carry question copy, option labels, or respondent
// data. These tests pin the `.strict()` privacy boundary at write time.

import { describe, expect, it } from 'vitest';

import {
  surveyClosedDetailSchema,
  surveyCreatedDetailSchema,
  surveyOpenedDetailSchema,
  surveyQuestionCreatedDetailSchema,
  surveyQuestionDeletedDetailSchema,
  surveyQuestionUpdatedDetailSchema,
} from '../survey.js';
import { AUDIT_EVENT_DETAIL_SCHEMAS, AUDIT_EVENT_TYPES } from '../../enums/audit-events.js';
import { CAPABILITIES, CAPABILITY_META } from '../../enums/capabilities.js';

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

describe('Survey audit detail schemas', () => {
  it.each([
    ['survey_created', surveyCreatedDetailSchema, surveyCreated],
    ['survey_question_created', surveyQuestionCreatedDetailSchema, surveyQuestionCreated],
    ['survey_question_updated', surveyQuestionUpdatedDetailSchema, surveyQuestionUpdated],
    ['survey_question_deleted', surveyQuestionDeletedDetailSchema, surveyQuestionDeleted],
    ['survey_opened', surveyOpenedDetailSchema, surveyOpened],
    ['survey_closed', surveyClosedDetailSchema, surveyClosed],
  ])('%s round-trips canonical detail', (_event, schema, payload) => {
    expect(schema.parse(payload)).toEqual(payload);
  });

  it.each([
    ['prompt', 'What should we ask?'],
    ['options', ['Yes', 'No']],
    ['respondent_actor_id', W],
  ])('rejects forbidden %s detail (privacy invariant — .strict())', (field, value) => {
    expect(() => surveyQuestionCreatedDetailSchema.parse({ ...surveyQuestionCreated, [field]: value })).toThrow();
  });

  it('rejects respondent data on survey creation (privacy invariant — .strict())', () => {
    expect(() => surveyCreatedDetailSchema.parse({ ...surveyCreated, respondent_actor_id: W })).toThrow();
  });

  it('rejects an empty changed_fields array', () => {
    expect(() =>
      surveyQuestionUpdatedDetailSchema.parse({ ...surveyQuestionUpdated, changed_fields: [] }),
    ).toThrow();
  });

  it('rejects a zero question_count', () => {
    expect(() => surveyOpenedDetailSchema.parse({ ...surveyOpened, question_count: 0 })).toThrow();
  });
});

describe('Survey audit event registration', () => {
  const surveyEvents = [
    'survey_created',
    'survey_question_created',
    'survey_question_updated',
    'survey_question_deleted',
    'survey_opened',
    'survey_closed',
  ] as const;

  it.each(surveyEvents)('registers %s in the event vocabulary and detail schemas', (event) => {
    expect(AUDIT_EVENT_TYPES).toContain(event);
    expect(AUDIT_EVENT_DETAIL_SCHEMAS).toHaveProperty(event);
  });
});

describe('CAPABILITY_META', () => {
  it('covers every capability', () => {
    expect(Object.keys(CAPABILITY_META).sort()).toEqual([...CAPABILITIES].sort());
  });
});
