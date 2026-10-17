import type { ManagedSystemDto } from '@/lib/api/managed-systems';
import {
  listActorsResponseSchema,
  surveyCopySourceResponseSchema,
  surveyCopySourcesResponseSchema,
  surveyDetailDtoSchema,
  surveyQuestionKindSchema,
  surveyTemplatesResponseSchema,
  surveyTypeSchema,
} from '@fops/shared';
import { z } from 'zod';
import { managedSystemVisualSchema } from './managed-system-owner';

const questionSchema = z.object({
  id: z.string().uuid(),
  survey_id: z.string().uuid(),
  kind: surveyQuestionKindSchema,
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
  type: surveyTypeSchema,
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
  | 'detail-empty'
  | 'builder'
  | 'builder-empty'
  | 'builder-dirty'
  | 'builder-drag-over'
  | 'create-dialog'
  | 'create-builtin'
  | 'create-existing'
  | 'empty'
  | 'empty-no-permission'
  | 'error'
  | 'no-permission';
export const surveyVisualScenarios = z
  .array(
    z.enum([
      'list',
      'detail',
      'detail-empty',
      'builder',
      'builder-empty',
      'builder-dirty',
      'builder-drag-over',
      'create-dialog',
      'create-builtin',
      'create-existing',
      'empty',
      'empty-no-permission',
      'error',
      'no-permission',
    ]),
  )
  .parse([
    'list',
    'detail',
    'detail-empty',
    'builder',
    'builder-empty',
    'builder-dirty',
    'builder-drag-over',
    'create-dialog',
    'create-builtin',
    'create-existing',
    'empty',
    'empty-no-permission',
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

export const surveyEmptyBuilderVisualFixture = surveyDetailDtoSchema.parse({
  ...surveyVisualFixture,
  questions: [],
});

const surveyVisualManagedSystem = managedSystemVisualSchema.parse({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  workspace_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  slug: 'revenue-analytics',
  name: 'Revenue Analytics',
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  default_reviewer_actor_id: null,
  default_reviewer_team_id: null,
  archived_at: null,
  archived_by_actor_id: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
});

export const surveyVisualManagedSystemsFixture = {
  items: [surveyVisualManagedSystem] satisfies ManagedSystemDto[],
  total: 1,
};

export const surveyVisualActorsFixture = listActorsResponseSchema.parse({
  actors: [
    {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      display_name: 'Dana Rivera',
      email: 'survey.operator@example.test',
      role_level: 'developer',
      actor_type: 'internal_member',
    },
  ],
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

export const surveyTemplateVisualFixture = surveyTemplatesResponseSchema.parse({
  items: [
    {
      template_id: 'discovery-basic',
      version: 1,
      type: 'discovery',
      title: 'Discovery 기본 템플릿',
      description: 'Managed System 사용 현황과 불편을 확인하세요.',
      questions: [
        {
          key: 'usage-frequency',
          kind: 'single_choice',
          prompt: '이 Managed System을 얼마나 자주 사용하나요?',
          is_required: true,
          sort_order: 0,
          options: [
            { key: 'daily', label: '매일' },
            { key: 'weekly', label: '매주' },
            { key: 'monthly-or-less', label: '월 1회 이하' },
            { key: 'never', label: '사용한 적 없음' },
          ],
        },
        {
          key: 'pain-point',
          kind: 'text',
          prompt: '업무에서 가장 불편한 점은 무엇인가요?',
          is_required: false,
          sort_order: 1,
        },
      ],
    },
    {
      template_id: 'validation-basic',
      version: 1,
      type: 'validation',
      title: 'Validation 기본 템플릿',
      description: '제안된 개선 내용을 Survey 설명에 입력하세요.',
      questions: [
        {
          key: 'expected-usefulness',
          kind: 'rating',
          prompt: '제안된 개선이 업무에 얼마나 도움이 될 것으로 예상하나요?',
          is_required: true,
          sort_order: 0,
          rating_min: 1,
          rating_max: 5,
          rating_low_label: '전혀 도움이 되지 않음',
          rating_high_label: '매우 도움이 됨',
        },
        {
          key: 'improvement-feedback',
          kind: 'text',
          prompt: '개선안에서 보완할 점은 무엇인가요?',
          is_required: false,
          sort_order: 1,
        },
      ],
    },
    {
      template_id: 'outcome-basic',
      version: 1,
      type: 'outcome',
      title: 'Outcome 기본 템플릿',
      description: '출시된 개선 내용을 Survey 설명에 입력하세요.',
      questions: [
        {
          key: 'released-usefulness',
          kind: 'rating',
          prompt: '개선 후 이 Managed System이 업무에 얼마나 도움이 되나요?',
          is_required: true,
          sort_order: 0,
          rating_min: 1,
          rating_max: 5,
          rating_low_label: '전혀 도움이 되지 않음',
          rating_high_label: '매우 도움이 됨',
        },
        {
          key: 'remaining-pain-point',
          kind: 'text',
          prompt: '개선 후에도 남아 있는 불편은 무엇인가요?',
          is_required: false,
          sort_order: 1,
        },
      ],
    },
  ],
});

export const surveyCopySourceVisualFixture = surveyCopySourceResponseSchema.parse({
  survey_id: surveyVisualFixture.id,
  display_id: 'SRV-21',
  title: '지난 라운드 문항',
  type: 'discovery',
  definition_token: 'saved-definition-v1',
  questions: [
    { ...surveyVisualFixture.questions[0], survey_id: undefined },
    {
      ...surveyVisualFixture.questions[0],
      survey_id: undefined,
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      kind: 'rating',
      prompt: '업무에 얼마나 도움이 되나요?',
      options: null,
      rating_min: 1,
      rating_max: 5,
      rating_low_label: '도움이 되지 않음',
      rating_high_label: '매우 도움이 됨',
      sort_order: 1,
      branch_depth: 1,
      branch_parent_question_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      branch_trigger_option_key: 'often',
    },
  ].map(({ survey_id: _surveyId, ...question }) => question),
});
export const surveyCopySourcesVisualFixture = surveyCopySourcesResponseSchema.parse({
  items: [
    {
      survey_id: surveyVisualFixture.id,
      display_id: 'SRV-21',
      title: '지난 라운드 문항',
      type: 'discovery',
      status: 'closed',
      question_count: 2,
    },
  ],
  page: { has_more: false },
});
