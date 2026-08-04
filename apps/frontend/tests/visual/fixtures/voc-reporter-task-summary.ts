import {
  type VocDetailEnvelope,
  conversationEntrySchema,
  vocDetailEnvelopeSchema,
} from "@fops/shared";
import { z } from "zod";

export const VOC_REPORTER_TASK_SUMMARY_IDS = {
  voc: "11111111-1111-4111-8111-111111111179",
  reporter: "22222222-2222-4222-8222-222222222179",
  managedSystem: "33333333-3333-4333-8333-333333333179",
  link: "44444444-4444-4444-8444-444444444179",
} as const;

// Parse at fixture construction so a visual baseline cannot bless an invalid
// entity-link visibility DTO or accidentally include non-public Task fields.
export const reporterTaskSummaryVoc: VocDetailEnvelope =
  vocDetailEnvelopeSchema.parse({
    id: VOC_REPORTER_TASK_SUMMARY_IDS.voc,
    display_id: "VOC-179",
    title: "내가 신고한 개선 요청",
    primary_managed_system_id: VOC_REPORTER_TASK_SUMMARY_IDS.managedSystem,
    analytics_area_id: null,
    reporter_id: VOC_REPORTER_TASK_SUMMARY_IDS.reporter,
    owner_user_id: null,
    owner_team_id: null,
    severity: "medium",
    reporter_facing_status: "progress",
    triage_state: "triaged",
    source_context: "direct_use",
    created_at: "2026-07-18T09:00:00.000Z",
    updated_at: "2026-07-18T09:00:00.000Z",
    similar_count: 0,
    similar: { items: [] },
    description_rich_content: { type: "doc", content: [{ type: "paragraph" }] },
    next_actions: [],
    next_reporter_states: { allowed: ["resolved"], forbidden: {} },
    linked_execution: { findingRef: null, taskRef: null },
    links: [
      {
        id: VOC_REPORTER_TASK_SUMMARY_IDS.link,
        source_type: "voc",
        target_type: "task",
        relation_type: "evidence_of",
        visibility: "summary_visible",
        status: "active",
        managed_system_id: VOC_REPORTER_TASK_SUMMARY_IDS.managedSystem,
        created_by: VOC_REPORTER_TASK_SUMMARY_IDS.reporter,
        created_at: "2026-07-18T09:00:00.000Z",
        updated_at: null,
        visibility_state: "summary_visible",
        summary: {
          target_type: "task",
          public_title: "데이터 새로고침 오류 개선",
          reporter_facing_status: "진행 중",
        },
      },
    ],
    conversation_timeline: [],
    conversation_page: { has_more: false },
    permission_decisions: {},
    attachments: [
      {
        id: "55555555-5555-4555-8555-555555555179",
        name: "refresh-error.png",
        size_bytes: 1024,
        mime_type: "image/png",
        uploaded_by_actor_id: VOC_REPORTER_TASK_SUMMARY_IDS.reporter,
        created_at: "2026-07-18T09:00:00.000Z",
        linked_at: "2026-07-18T09:00:00.000Z",
      },
      {
        id: "66666666-6666-4666-8666-666666666179",
        name: "refresh-details.txt",
        size_bytes: 2048,
        mime_type: "text/plain",
        uploaded_by_actor_id: VOC_REPORTER_TASK_SUMMARY_IDS.reporter,
        created_at: "2026-07-18T09:00:00.000Z",
        linked_at: "2026-07-18T09:00:00.000Z",
      },
    ],
    attachment_count: 2,
  });

const conversationPageSchema = z.object({
  items: z.array(conversationEntrySchema),
  next_cursor: z.string().optional(),
  has_more: z.boolean(),
});

export const reporterTaskSummaryConversationPage = conversationPageSchema.parse(
  {
    items: [],
    has_more: false,
  },
);
