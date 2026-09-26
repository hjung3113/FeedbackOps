// Lock test for the audit event registry (#490 domain split).
//
// `audit-events.ts` is now a registry that spreads per-domain tuples and
// detail maps. This test pins the public surface so the split (and any
// future domain-module move) cannot reshuffle or drop events: the tuple
// order must stay byte-for-byte the pre-split order (Zod's enum option list
// is order-sensitive), the list must have no duplicates, and the detail
// map must cover exactly the same keys in the same order.
//
// The expected list is copied verbatim from the pre-split AUDIT_EVENT_TYPES
// literal (audit-events.ts lines 51–139 at e57326b).

import { describe, expect, it } from 'vitest';

import { AUDIT_EVENT_DETAIL_SCHEMAS, AUDIT_EVENT_TYPES } from '../../enums/audit-events.js';

const EXPECTED_AUDIT_EVENT_TYPES = [
  'permission_requested',
  'permission_approved',
  'permission_rejected',
  'permission_needs_more_info',
  'permission_denied',
  'managed_system_registered',
  'managed_system_updated',
  'managed_system_archived',
  'analytics_area_registered',
  'analytics_area_updated',
  'analytics_area_archived',
  'voc_created',
  'voc_triage_committed',
  'voc_severity_set',
  'voc_owner_assigned',
  'voc_analytics_area_linked',
  'voc_cluster_decision_recorded',
  'public_update_created',
  'reporter_facing_status_changed',
  'reporter_reply_created',
  'internal_comment_created',
  'voc_triage_postponed',
  'voc_description_edited',
  'attachment_uploaded',
  'entity_link.created',
  'entity_link.detached',
  'finding_created_from_voc',
  'voc_cluster_created',
  'voc_cluster_updated',
  'voc_cluster_member_added',
  'voc_cluster_member_removed',
  'finding_created_from_voc_cluster',
  'finding_linked_to_voc_cluster',
  'finding_unlinked_from_voc_cluster',
  'evidence_highlight_added',
  'finding_status_changed',
  'finding_comment_created',
  'task_request_created_from_finding',
  'task_request_created_from_voc',
  'task_request_created_from_voc_cluster',
  'task_request_approved',
  'task_request_rejected',
  'task_request_needs_more_evidence',
  'task_request_self_approval_denied',
  'task_created_from_request',
  'task_linked_to_request',
  'finding_task_linked',
  'task_status_changed',
  'task_comment_created',
  'milestone_created',
  'milestone_updated',
  'public_update_review_candidate_created',
  'public_update_review_candidate_dismissed',
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
  'survey_response_excerpt_revoked',
  'finding_created_from_survey_response',
  'workspace_settings_updated',
  'voc_recommendation_dismissed',
  'voc_recommendation_confirmed',
] as const;

describe('audit event registry', () => {
  it('locks event-type order, uniqueness, and detail-map key coverage', () => {
    expect([...AUDIT_EVENT_TYPES]).toEqual([...EXPECTED_AUDIT_EVENT_TYPES]);
    expect(new Set(AUDIT_EVENT_TYPES).size).toBe(69);
    expect(Object.keys(AUDIT_EVENT_DETAIL_SCHEMAS)).toEqual([...EXPECTED_AUDIT_EVENT_TYPES]);
  });
});
