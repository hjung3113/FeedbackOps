import {
  conversationEntrySchema,
  listActorsResponseSchema,
  listPublicUpdateReviewCandidatesResponseSchema,
  vocDetailEnvelopeSchema,
  vocListItemSchema,
} from '@fops/shared';
import { z } from 'zod';

export const triageAreaVisualScenarios = [
  'triage-analytics-area-populated',
  'create-finding-area-inherited',
] as const;
export type TriageAreaVisualScenario = (typeof triageAreaVisualScenarios)[number];

export const TRIAGE_AREA_IDS = {
  workspace: '30000000-0000-4000-8000-000000000001',
  actor: '30000000-0000-4000-8000-000000000002',
  managedSystem: '30000000-0000-4000-8000-000000000003',
  voc: '30000000-0000-4000-8000-000000000004',
  currentArea: '30000000-0000-4000-8000-000000000005',
  alternativeArea: '30000000-0000-4000-8000-000000000006',
} as const;

const analyticsAreaSchema = z
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

export const triageAreaAnalyticsAreasResponseSchema = z
  .object({
    items: z.array(analyticsAreaSchema),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const triageAreaAnalyticsAreas = triageAreaAnalyticsAreasResponseSchema.parse({
  items: [
    {
      id: TRIAGE_AREA_IDS.currentArea,
      workspace_id: TRIAGE_AREA_IDS.workspace,
      managed_system_id: TRIAGE_AREA_IDS.managedSystem,
      slug: 'marketing-attribution',
      name: 'Marketing Attribution',
      owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    },
    {
      id: TRIAGE_AREA_IDS.alternativeArea,
      workspace_id: TRIAGE_AREA_IDS.workspace,
      managed_system_id: TRIAGE_AREA_IDS.managedSystem,
      slug: 'subscription-health',
      name: 'Subscription Health',
      owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    },
  ],
  total: 2,
});

const vocBase = {
  id: TRIAGE_AREA_IDS.voc,
  display_id: 'VOC-2812',
  title: 'Looker 모델 변경 후 알림이 오지 않음',
  primary_managed_system_id: TRIAGE_AREA_IDS.managedSystem,
  analytics_area_id: TRIAGE_AREA_IDS.currentArea,
  reporter_id: TRIAGE_AREA_IDS.actor,
  owner_user_id: null,
  owner_team_id: null,
  severity: 'medium' as const,
  reporter_facing_status: 'received' as const,
  triage_state: 'untriaged' as const,
  source_context: 'direct_use' as const,
  created_at: '2026-07-21T06:00:00.000Z',
  updated_at: '2026-07-21T06:00:00.000Z',
  similar_count: 0,
  attachment_count: 0,
};

export const triageAreaTriageVoc = vocListItemSchema.parse(vocBase);

export const triageAreaFindingSourceVoc = vocDetailEnvelopeSchema.parse({
  ...vocBase,
  description_rich_content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '데이터 모델 변경 이후 구독 알림 발송이 멈췄습니다.' }],
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

export const triageAreaActors = listActorsResponseSchema.parse({ actors: [] });

export const triageAreaConversationPage = z
  .object({
    items: z.array(conversationEntrySchema),
    next_cursor: z.string().optional(),
    has_more: z.boolean(),
  })
  .parse({ items: [], has_more: false });

export const triageAreaReviewCandidates = listPublicUpdateReviewCandidatesResponseSchema.parse({
  items: [],
});
