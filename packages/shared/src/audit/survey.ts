// Survey audit detail schemas (Slice 8 #191).
// Each schema describes the privacy-safe `detail` payload for one Survey
// domain event. Imported by audit-events.ts to validate audit writes.
//
// Privacy invariant: these payloads record IDs and structural metadata only.
// They must never contain question prompt text, option labels, or respondent
// data; `.strict()` rejects such fields at write time.

import { z } from 'zod';

const uuid = () => z.string().uuid();

const surveyTypeSchema = z.enum(['discovery', 'validation', 'outcome']);
const questionKindSchema = z.enum(['single_choice', 'multiple_choice', 'rating', 'text']);
const branchDepthSchema = z.union([z.literal(0), z.literal(1)]);

// Field names only. Audit detail records which mutable question fields changed,
// never the field values themselves.
export const SURVEY_QUESTION_AUDIT_FIELDS = [
  'prompt',
  'is_required',
  'options',
  'rating_min',
  'rating_max',
  'rating_low_label',
  'rating_high_label',
  'sort_order',
  'branch_parent_question_id',
  'branch_trigger_option_key',
  'kind',
] as const;

// ── survey_created ────────────────────────────────────────────────────────
export const surveyCreatedDetailSchema = z
  .object({
    survey_id: uuid(),
    display_id: z.string().min(1),
    survey_type: surveyTypeSchema,
    primary_managed_system_id: uuid(),
    analytics_area_id: uuid().nullable().optional(),
    operator_actor_id: uuid(),
    operator_resolution: z.enum(['explicit', 'managed_system_default', 'creator']),
    responses_identity_protected: z.boolean(),
  })
  .strict();
export type SurveyCreatedDetail = z.infer<typeof surveyCreatedDetailSchema>;

// ── survey_question_created ───────────────────────────────────────────────
export const surveyQuestionCreatedDetailSchema = z
  .object({
    survey_id: uuid(),
    question_id: uuid(),
    kind: questionKindSchema,
    branch_depth: branchDepthSchema,
    branch_parent_question_id: uuid().optional(),
    sort_order: z.number().int().nonnegative(),
  })
  .strict();
export type SurveyQuestionCreatedDetail = z.infer<typeof surveyQuestionCreatedDetailSchema>;

// ── survey_question_updated ───────────────────────────────────────────────
export const surveyQuestionUpdatedDetailSchema = z
  .object({
    survey_id: uuid(),
    question_id: uuid(),
    changed_fields: z.array(z.enum(SURVEY_QUESTION_AUDIT_FIELDS)).nonempty(),
    ordering_changed: z.boolean(),
  })
  .strict();
export type SurveyQuestionUpdatedDetail = z.infer<typeof surveyQuestionUpdatedDetailSchema>;

// ── survey_question_deleted ───────────────────────────────────────────────
export const surveyQuestionDeletedDetailSchema = z
  .object({
    survey_id: uuid(),
    question_id: uuid(),
    kind: questionKindSchema,
    branch_depth: branchDepthSchema,
  })
  .strict();
export type SurveyQuestionDeletedDetail = z.infer<typeof surveyQuestionDeletedDetailSchema>;

// ── survey_opened ─────────────────────────────────────────────────────────
export const surveyOpenedDetailSchema = z
  .object({
    survey_id: uuid(),
    display_id: z.string().min(1),
    question_count: z.number().int().positive(),
  })
  .strict();
export type SurveyOpenedDetail = z.infer<typeof surveyOpenedDetailSchema>;

// ── survey_closed ─────────────────────────────────────────────────────────
export const surveyClosedDetailSchema = z
  .object({
    survey_id: uuid(),
    display_id: z.string().min(1),
  })
  .strict();
export type SurveyClosedDetail = z.infer<typeof surveyClosedDetailSchema>;

// ── survey_response_submitted ─────────────────────────────────────────────
// ADR-0033 privacy invariant: NO raw answer text, question prompts, option
// labels, or answer combinations may ever appear in this detail. `.strict()`
// enforces that boundary.
export const surveyResponseSubmittedDetailSchema = z
  .object({
    survey_id: uuid(),
    response_id: uuid(),
    question_count: z.number().int().positive(),
    identity_protected: z.boolean(),
  })
  .strict();
export type SurveyResponseSubmittedDetail = z.infer<typeof surveyResponseSubmittedDetailSchema>;
