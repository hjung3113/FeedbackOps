import { z } from 'zod';

const questionSchema = z.object({
  id: z.string().uuid(),
  survey_id: z.string().uuid(),
  kind: z.enum(['single_choice', 'multiple_choice', 'rating', 'text']),
  prompt: z.string(),
  is_required: z.boolean(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).nullable(),
  rating_min: z.number().nullable(),
  rating_max: z.number().nullable(),
  rating_low_label: z.string().nullable(),
  rating_high_label: z.string().nullable(),
  sort_order: z.number(),
  branch_depth: z.number(),
  branch_parent_question_id: z.string().uuid().nullable(),
  branch_trigger_option_key: z.string().nullable(),
});
export const surveyVisualFixtureSchema = z.object({
  id: z.string().uuid(),
  display_id: z.string(),
  title: z.string(),
  type: z.enum(['discovery', 'validation', 'outcome']),
  status: z.enum(['draft', 'open', 'closed']),
  description: z.string().nullable(),
  primary_managed_system_id: z.string().uuid(),
  analytics_area_id: z.string().uuid().nullable(),
  operator_actor_id: z.string().uuid().nullable(),
  responses_identity_protected: z.boolean(),
  created_by: z.string().uuid(),
  opened_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  questions: z.array(questionSchema),
});
export type SurveyVisualScenario =
  | 'list'
  | 'detail'
  | 'builder'
  | 'builder-dirty'
  | 'builder-drag-over'
  | 'create-dialog'
  | 'empty'
  | 'error'
  | 'no-permission';
export const surveyVisualScenarios = z
  .array(
    z.enum([
      'list',
      'detail',
      'builder',
      'builder-dirty',
      'builder-drag-over',
      'create-dialog',
      'empty',
      'error',
      'no-permission',
    ]),
  )
  .parse([
    'list',
    'detail',
    'builder',
    'builder-dirty',
    'builder-drag-over',
    'create-dialog',
    'empty',
    'error',
    'no-permission',
  ]);
export const surveyVisualFixture = surveyVisualFixtureSchema.parse({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  display_id: 'SRV-21',
  title: 'Q3 매출 리포트 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: '리포트 경험을 확인합니다.',
  primary_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  analytics_area_id: null,
  operator_actor_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  responses_identity_protected: true,
  created_by: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      survey_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      kind: 'single_choice',
      prompt: '리포트를 얼마나 자주 사용하시나요?',
      is_required: true,
      options: [
        { key: 'often', label: '자주 사용' },
        { key: 'rarely', label: '거의 사용하지 않음' },
      ],
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      sort_order: 0,
      branch_depth: 0,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
});

export const surveyDetailVisualFixture = surveyVisualFixtureSchema.parse({
  ...surveyVisualFixture,
  status: 'open',
  opened_at: '2026-07-21T00:00:00.000Z',
});

export const surveyBuilderDragOverVisualFixture = surveyVisualFixtureSchema.parse({
  ...surveyVisualFixture,
  questions: [
    ...surveyVisualFixture.questions,
    {
      ...surveyVisualFixture.questions[0],
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      prompt: '리포트에서 가장 불편한 점은 무엇인가요?',
      sort_order: 1,
    },
  ],
});
