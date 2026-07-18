import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors, analyticsAreas, managedSystems, workspaces } from './core.js';

export const surveySchema = pgSchema('survey');

export const surveys = surveySchema.table(
  'surveys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    displayId: text('display_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('draft'),
    title: text('title').notNull(),
    description: text('description'),
    primaryManagedSystemId: uuid('primary_managed_system_id')
      .notNull()
      .references(() => managedSystems.id),
    analyticsAreaId: uuid('analytics_area_id').references(() => analyticsAreas.id),
    operatorActorId: uuid('operator_actor_id')
      .notNull()
      .references(() => actors.id),
    responsesIdentityProtected: boolean('responses_identity_protected').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => actors.id),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workspaceDisplayUq: uniqueIndex('surveys_workspace_display_id_uq').on(
      t.workspaceId,
      t.displayId,
    ),
    workspaceManagedSystemStatusCreatedAtIdx: index(
      'surveys_workspace_managed_system_status_created_at_idx',
    ).on(t.workspaceId, t.primaryManagedSystemId, t.status, t.createdAt.desc()),
    workspaceOperatorStatusIdx: index('surveys_workspace_operator_status_idx').on(
      t.workspaceId,
      t.operatorActorId,
      t.status,
    ),
    typeCheck: check('surveys_type_check', sql`${t.type} in ('discovery','validation','outcome')`),
    statusCheck: check('surveys_status_check', sql`${t.status} in ('draft','open','closed')`),
    lifecycleCheck: check(
      'surveys_lifecycle_check',
      sql`(${t.status} = 'draft' and ${t.openedAt} is null and ${t.closedAt} is null) or (${t.status} = 'open' and ${t.openedAt} is not null and ${t.closedAt} is null) or (${t.status} = 'closed' and ${t.openedAt} is not null and ${t.closedAt} is not null)`,
    ),
  }),
);

export const surveyQuestions = surveySchema.table(
  'survey_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id),
    kind: text('kind').notNull(),
    prompt: text('prompt').notNull(),
    isRequired: boolean('is_required').notNull().default(false),
    options: jsonb('options'),
    ratingMin: integer('rating_min'),
    ratingMax: integer('rating_max'),
    ratingLowLabel: text('rating_low_label'),
    ratingHighLabel: text('rating_high_label'),
    sortOrder: integer('sort_order').notNull(),
    branchDepth: smallint('branch_depth').notNull().default(0),
    branchParentQuestionId: uuid('branch_parent_question_id'),
    branchParentDepth: smallint('branch_parent_depth'),
    branchTriggerOptionKey: text('branch_trigger_option_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    surveyIdIdUq: unique('survey_questions_survey_id_id_uq').on(t.surveyId, t.id),
    surveyIdIdDepthUq: unique('survey_questions_survey_id_id_branch_depth_uq').on(
      t.surveyId,
      t.id,
      t.branchDepth,
    ),
    surveySortOrderIdx: index('survey_questions_survey_sort_order_idx').on(
      t.surveyId,
      t.sortOrder,
      t.id,
    ),
    kindCheck: check(
      'survey_questions_kind_check',
      sql`${t.kind} in ('single_choice','multiple_choice','rating','text')`,
    ),
    sortOrderCheck: check('survey_questions_sort_order_check', sql`${t.sortOrder} >= 0`),
    branchDepthCheck: check('survey_questions_branch_depth_check', sql`${t.branchDepth} in (0,1)`),
    branchStructureCheck: check(
      'survey_questions_branch_structure_check',
      sql`(${t.branchDepth} = 0 and ${t.branchParentQuestionId} is null and ${t.branchParentDepth} is null and ${t.branchTriggerOptionKey} is null) or (${t.branchDepth} = 1 and ${t.branchParentQuestionId} is not null and ${t.branchParentDepth} = 0 and ${t.branchTriggerOptionKey} is not null)`,
    ),
    branchParentFk: foreignKey({
      name: 'survey_questions_branch_parent_fk',
      columns: [t.surveyId, t.branchParentQuestionId, t.branchParentDepth],
      foreignColumns: [t.surveyId, t.id, t.branchDepth],
    }).onDelete('restrict'),
  }),
);

export const surveyResponses = surveySchema.table(
  'survey_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    surveyId: uuid('survey_id')
      .notNull()
      .references(() => surveys.id),
    respondentActorId: uuid('respondent_actor_id')
      .notNull()
      .references(() => actors.id),
    identityProtected: boolean('identity_protected').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ surveyIdIdUq: unique('survey_responses_survey_id_id_uq').on(t.surveyId, t.id) }),
);

export const surveyResponseAnswers = surveySchema.table(
  'survey_response_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    surveyId: uuid('survey_id').notNull(),
    responseId: uuid('response_id').notNull(),
    questionId: uuid('question_id').notNull(),
    answerKind: text('answer_kind').notNull(),
    answerValue: jsonb('answer_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    responseQuestionUq: unique('survey_response_answers_response_id_question_id_uq').on(
      t.responseId,
      t.questionId,
    ),
    answerKindCheck: check(
      'survey_response_answers_answer_kind_check',
      sql`${t.answerKind} in ('single_choice','multiple_choice','rating','text')`,
    ),
    responseSurveyFk: foreignKey({
      name: 'survey_response_answers_response_survey_fk',
      columns: [t.surveyId, t.responseId],
      foreignColumns: [surveyResponses.surveyId, surveyResponses.id],
    }),
    questionSurveyFk: foreignKey({
      name: 'survey_response_answers_question_survey_fk',
      columns: [t.surveyId, t.questionId],
      foreignColumns: [surveyQuestions.surveyId, surveyQuestions.id],
    }),
  }),
);
