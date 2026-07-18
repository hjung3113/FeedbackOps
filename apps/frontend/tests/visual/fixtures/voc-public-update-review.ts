import {
  type ListPublicUpdateReviewCandidatesResponse,
  type VocDetailEnvelope,
  listPublicUpdateReviewCandidatesResponseSchema,
  vocDetailEnvelopeSchema,
} from '@fops/shared';

export const VOC_REVIEW_IDS = {
  voc: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  candidate: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reporter: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  managedSystem: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const;

// Parse at fixture construction so any contract drift fails closed before a
// screenshot can silently bless an invalid mock response.
export const populatedReviewVoc: VocDetailEnvelope = vocDetailEnvelopeSchema.parse({
  id: VOC_REVIEW_IDS.voc,
  display_id: 'VOC-180',
  title: '릴리스 후 공개 안내가 필요한 VOC',
  primary_managed_system_id: VOC_REVIEW_IDS.managedSystem,
  analytics_area_id: null,
  reporter_id: VOC_REVIEW_IDS.reporter,
  owner_user_id: null,
  owner_team_id: null,
  severity: 'high',
  reporter_facing_status: 'reviewing',
  triage_state: 'triaged',
  source_context: 'direct_use',
  created_at: '2026-07-18T09:00:00.000Z',
  updated_at: '2026-07-18T09:00:00.000Z',
  similar_count: 0,
  similar: { items: [] },
  description_rich_content: { type: 'doc', content: [{ type: 'paragraph' }] },
  next_actions: [],
  next_reporter_states: { allowed: ['progress', 'resolved'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [],
  conversation_page: { has_more: false },
  permission_decisions: {},
  attachments: [],
  attachment_count: 0,
});

export const populatedReviewCandidates: ListPublicUpdateReviewCandidatesResponse =
  listPublicUpdateReviewCandidatesResponseSchema.parse({
    items: [
      {
        id: VOC_REVIEW_IDS.candidate,
        voc_id: VOC_REVIEW_IDS.voc,
        source_task_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        created_at: '2026-07-18T09:00:00.000Z',
      },
    ],
  });
