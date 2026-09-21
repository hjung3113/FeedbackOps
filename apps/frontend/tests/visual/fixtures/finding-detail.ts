import {
  type CreateTaskRequestFromFindingRequest,
  type FindingDto,
  type ListEvidenceHighlightsResponse,
  type ListFindingsResponse,
  type TaskDetailDto,
  type TaskRequestDto,
  createTaskRequestFromFindingRequestSchema,
  evidenceHighlightDtoSchema,
  findingDtoSchema,
  listActorsResponseSchema,
  listEvidenceHighlightsResponseSchema,
  listFindingsResponseSchema,
  taskDetailDtoSchema,
  taskRequestDtoSchema,
  vocDetailEnvelopeSchema,
} from '@fops/shared';
import { z } from 'zod';

// Issue #399 Finding detail baseline: deterministic ids/timestamps so the
// pre- and post-refactor pixels stay comparable. Every export is parsed with
// the shared client schemas at import time (fail-closed mock contract); the
// two registry responses use local strict schemas because @fops/shared does
// not export response schemas for GET /managed-systems / GET /analytics-areas
// (same approach as managed-system-owner.ts / triage-analytics-area.ts).
export const FINDING_DETAIL_IDS = {
  workspace: 'd1000000-0000-4000-8000-000000000001',
  actor: 'd1000000-0000-4000-8000-000000000002',
  managedSystem: 'd1000000-0000-4000-8000-000000000003',
  finding: 'd1000000-0000-4000-8000-000000000004',
  voc: 'd1000000-0000-4000-8000-000000000005',
  task: 'd1000000-0000-4000-8000-000000000006',
  analyticsArea: 'd1000000-0000-4000-8000-000000000007',
  taskRequest: 'd1000000-0000-4000-8000-000000000008',
  vocEvidence: 'd1000000-0000-4000-8000-000000000009',
  noteEvidence: 'd1000000-0000-4000-8000-00000000000a',
} as const;

const dates = {
  voc: '2026-07-17T06:00:00.000Z',
  evidenceVoc: '2026-07-18T03:00:00.000Z',
  findingCreated: '2026-07-18T09:00:00.000Z',
  findingUpdated: '2026-07-20T09:00:00.000Z',
  evidenceNote: '2026-07-19T03:00:00.000Z',
  taskCreated: '2026-07-19T09:00:00.000Z',
  taskUpdated: '2026-07-20T09:00:00.000Z',
  registry: '2026-07-01T00:00:00.000Z',
} as const;

// Rendered both as the evidence quote and asserted in the spec.
export const EVIDENCE_QUOTES = {
  voc: '재로그인해도 하루 만에 세션이 끊겨 재인증을 반복하고 있습니다.',
  note: '백엔드 로그에서 refresh_token 재사용 401 응답 다발을 확인했습니다.',
} as const;

export const populatedFinding: FindingDto = findingDtoSchema.parse({
  id: FINDING_DETAIL_IDS.finding,
  workspace_id: FINDING_DETAIL_IDS.workspace,
  display_id: 'FND-4102',
  primary_managed_system_id: FINDING_DETAIL_IDS.managedSystem,
  title: 'OAuth 토큰 재발급 실패 패턴',
  summary: '모바일 클라이언트에서 리프레시 토큰 만료 이후 재로그인이 반복적으로 실패합니다.',
  evidence_count: 2,
  severity: 'high',
  confidence: 'high',
  status: 'active',
  analytics_area_id: FINDING_DETAIL_IDS.analyticsArea,
  linked_task_id: FINDING_DETAIL_IDS.task,
  linked_milestone_id: null,
  created_by: FINDING_DETAIL_IDS.actor,
  created_at: dates.findingCreated,
  updated_at: dates.findingUpdated,
  source_type: 'voc',
  source_id: FINDING_DETAIL_IDS.voc,
});

export const findingList: ListFindingsResponse = listFindingsResponseSchema.parse({
  items: [populatedFinding],
});

export const vocEvidence = evidenceHighlightDtoSchema.parse({
  id: FINDING_DETAIL_IDS.vocEvidence,
  workspace_id: FINDING_DETAIL_IDS.workspace,
  finding_id: FINDING_DETAIL_IDS.finding,
  primary_managed_system_id: FINDING_DETAIL_IDS.managedSystem,
  source_type: 'voc',
  source_id: FINDING_DETAIL_IDS.voc,
  source_title: '로그인 후 곧바로 세션이 만료됩니다',
  source_meta: 'VOC-4410',
  quote_or_summary: EVIDENCE_QUOTES.voc,
  analytics_area_id: FINDING_DETAIL_IDS.analyticsArea,
  sentiment: 'negative',
  importance: 'high',
  created_by: FINDING_DETAIL_IDS.actor,
  created_at: dates.evidenceVoc,
});

export const noteEvidence = evidenceHighlightDtoSchema.parse({
  id: FINDING_DETAIL_IDS.noteEvidence,
  workspace_id: FINDING_DETAIL_IDS.workspace,
  finding_id: FINDING_DETAIL_IDS.finding,
  primary_managed_system_id: FINDING_DETAIL_IDS.managedSystem,
  source_type: 'note',
  source_id: null,
  source_title: null,
  source_meta: null,
  quote_or_summary: EVIDENCE_QUOTES.note,
  analytics_area_id: FINDING_DETAIL_IDS.analyticsArea,
  sentiment: 'neutral',
  importance: 'medium',
  created_by: FINDING_DETAIL_IDS.actor,
  created_at: dates.evidenceNote,
});

export const evidenceHighlights: ListEvidenceHighlightsResponse =
  listEvidenceHighlightsResponseSchema.parse({ items: [vocEvidence, noteEvidence] });

export const findingSourceVoc = vocDetailEnvelopeSchema.parse({
  id: FINDING_DETAIL_IDS.voc,
  display_id: 'VOC-4410',
  title: '로그인 후 곧바로 세션이 만료됩니다',
  primary_managed_system_id: FINDING_DETAIL_IDS.managedSystem,
  analytics_area_id: FINDING_DETAIL_IDS.analyticsArea,
  reporter_id: FINDING_DETAIL_IDS.actor,
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'received',
  triage_state: 'untriaged',
  source_context: 'direct_use',
  created_at: dates.voc,
  updated_at: dates.voc,
  similar_count: 0,
  attachment_count: 0,
  description_rich_content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '재로그인해도 세션이 곧바로 만료됩니다.' }],
      },
    ],
  },
  next_actions: [],
  next_reporter_states: { allowed: ['reviewing'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
  similar: { items: [] },
  attachments: [],
});

export const linkedTask: TaskDetailDto = taskDetailDtoSchema.parse({
  id: FINDING_DETAIL_IDS.task,
  workspace_id: FINDING_DETAIL_IDS.workspace,
  display_id: 'TASK-3301',
  primary_managed_system_id: FINDING_DETAIL_IDS.managedSystem,
  title: 'OAuth 리프레시 토큰 재발급 로직 수정',
  status: 'doing',
  priority: 'high',
  assignee_actor_id: FINDING_DETAIL_IDS.actor,
  due_date: null,
  milestone_id: null,
  analytics_area_id: FINDING_DETAIL_IDS.analyticsArea,
  source_task_request_id: null,
  created_by: FINDING_DETAIL_IDS.actor,
  created_at: dates.taskCreated,
  updated_at: dates.taskUpdated,
  source: null,
});

export const findingActors = listActorsResponseSchema.parse({
  actors: [
    {
      id: FINDING_DETAIL_IDS.actor,
      display_name: '정민수',
      email: 'minsu@example.test',
      role_level: 'admin',
    },
  ],
});

const managedSystemDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    external_key: z.string().nullable(),
    default_owner_actor_id: z.string().uuid().nullable(),
    default_owner_team_id: z.string().uuid().nullable(),
    archived_at: z.string().datetime().nullable(),
    archived_by_actor_id: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const findingManagedSystems = z
  .object({
    items: z.array(managedSystemDtoSchema),
    total: z.number().int().nonnegative(),
  })
  .strict()
  .parse({
    items: [
      {
        id: FINDING_DETAIL_IDS.managedSystem,
        workspace_id: FINDING_DETAIL_IDS.workspace,
        slug: 'identity-core',
        name: 'Identity Core',
        external_key: null,
        default_owner_actor_id: null,
        default_owner_team_id: null,
        archived_at: null,
        archived_by_actor_id: null,
        created_at: dates.registry,
        updated_at: dates.registry,
      },
    ],
    total: 1,
  });

const analyticsAreaDtoSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    managed_system_id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    owner_team_id: z.string().uuid().nullable(),
    archived_at: z.string().datetime().nullable(),
    archived_by_actor_id: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export const findingAnalyticsAreas = z
  .object({
    items: z.array(analyticsAreaDtoSchema),
    total: z.number().int().nonnegative(),
  })
  .strict()
  .parse({
    items: [
      {
        id: FINDING_DETAIL_IDS.analyticsArea,
        workspace_id: FINDING_DETAIL_IDS.workspace,
        managed_system_id: FINDING_DETAIL_IDS.managedSystem,
        slug: 'auth-session',
        name: '인증 세션',
        owner_team_id: null,
        archived_at: null,
        archived_by_actor_id: null,
        created_at: dates.registry,
        updated_at: dates.registry,
      },
    ],
    total: 1,
  });

export const requestTaskBody: CreateTaskRequestFromFindingRequest =
  createTaskRequestFromFindingRequestSchema.parse({
    evidence_summary: populatedFinding.summary,
    requested_outcome: '재발급 실패 원인을 조사하고 리프레시 토큰 로직을 수정해주세요.',
  });

export const requestTaskSuccess: TaskRequestDto = taskRequestDtoSchema.parse({
  id: FINDING_DETAIL_IDS.taskRequest,
  workspace_id: FINDING_DETAIL_IDS.workspace,
  display_id: 'TREQ-1204',
  source_type: 'finding',
  source_id: FINDING_DETAIL_IDS.finding,
  primary_managed_system_id: FINDING_DETAIL_IDS.managedSystem,
  evidence_summary: requestTaskBody.evidence_summary,
  requested_outcome: requestTaskBody.requested_outcome,
  requester_actor_id: FINDING_DETAIL_IDS.actor,
  status: 'pending_review',
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: dates.findingUpdated,
  updated_at: dates.findingUpdated,
});
