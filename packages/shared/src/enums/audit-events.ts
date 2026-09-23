// Audit event vocabulary. The canonical verb list is locked verbatim by
// the "Audit events" list in docs/implementation/05-permission-policy.md
// under the heading "### Permission Request self-approval policy"
// (snake_case, single token, no dot — e.g. `permission_requested`,
// `permission_approved`).
// ADR-0008's older `subject_type.verb` convention is a non-binding stylistic
// suggestion and explicitly defers to the policy doc's verb vocabulary for
// any event listed there. New events MUST take their name from that list,
// or — if no policy-doc entry exists — adopt the same snake_case style.
//
// Both apps import the canonical list from `@fops/shared`.
//
// This file is the registry only. Each domain module under `src/audit/`
// owns its event-type strings, detail schemas, and inferred types, and is
// spread in below. New events MUST add (a) the event_type string to the
// owning domain module's `*_AUDIT_EVENT_TYPES` tuple and (b) a zod schema
// for the `detail` payload to that module's detail map, so the audit
// service can validate the call site at write time. Never add a new
// string literal directly here.

import { z } from 'zod';

import {
  ANALYTICS_AREA_AUDIT_EVENT_DETAIL_SCHEMAS,
  ANALYTICS_AREA_AUDIT_EVENT_TYPES,
} from '../audit/analytics-area.js';
import {
  ATTACHMENT_AUDIT_EVENT_DETAIL_SCHEMAS,
  ATTACHMENT_AUDIT_EVENT_TYPES,
} from '../audit/attachments.js';
import {
  ENTITY_LINK_AUDIT_EVENT_DETAIL_SCHEMAS,
  ENTITY_LINK_AUDIT_EVENT_TYPES,
} from '../audit/entity-link.js';
import {
  FINDING_FROM_SURVEY_RESPONSE_AUDIT_EVENT_DETAIL_SCHEMAS,
  FINDING_FROM_SURVEY_RESPONSE_AUDIT_EVENT_TYPES,
  FINDING_FROM_VOC_AUDIT_EVENT_DETAIL_SCHEMAS,
  FINDING_FROM_VOC_AUDIT_EVENT_TYPES,
  FINDING_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS,
  FINDING_LIFECYCLE_AUDIT_EVENT_TYPES,
  FINDING_TASK_LINKED_AUDIT_EVENT_DETAIL_SCHEMAS,
  FINDING_TASK_LINKED_AUDIT_EVENT_TYPES,
} from '../audit/finding.js';
import {
  MANAGED_SYSTEM_AUDIT_EVENT_DETAIL_SCHEMAS,
  MANAGED_SYSTEM_AUDIT_EVENT_TYPES,
} from '../audit/managed-system.js';
import {
  PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS,
  PERMISSION_AUDIT_EVENT_TYPES,
} from '../audit/permission.js';
import {
  SURVEY_AUDIT_EVENT_DETAIL_SCHEMAS,
  SURVEY_AUDIT_EVENT_TYPES,
} from '../audit/survey.js';
import {
  TASK_AUDIT_EVENT_DETAIL_SCHEMAS,
  TASK_AUDIT_EVENT_TYPES,
} from '../audit/task.js';
import {
  TASK_REQUEST_AUDIT_EVENT_DETAIL_SCHEMAS,
  TASK_REQUEST_AUDIT_EVENT_TYPES,
} from '../audit/task-request.js';
import {
  VOC_AUDIT_EVENT_DETAIL_SCHEMAS,
  VOC_AUDIT_EVENT_TYPES,
  VOC_RECOMMENDATION_AUDIT_EVENT_DETAIL_SCHEMAS,
  VOC_RECOMMENDATION_AUDIT_EVENT_TYPES,
  VOC_REVIEW_CANDIDATE_AUDIT_EVENT_DETAIL_SCHEMAS,
  VOC_REVIEW_CANDIDATE_AUDIT_EVENT_TYPES,
} from '../audit/voc.js';
import {
  VOC_CLUSTER_AUDIT_EVENT_DETAIL_SCHEMAS,
  VOC_CLUSTER_AUDIT_EVENT_TYPES,
} from '../audit/voc-cluster.js';
import {
  WORKSPACE_SETTINGS_AUDIT_EVENT_DETAIL_SCHEMAS,
  WORKSPACE_SETTINGS_AUDIT_EVENT_TYPES,
} from '../audit/workspace-settings.js';

// Spread order preserves the historical AUDIT_EVENT_TYPES order byte-for-byte
// (Zod's enum option list is order-sensitive). Do not reorder or re-group.
export const AUDIT_EVENT_TYPES = [
  ...PERMISSION_AUDIT_EVENT_TYPES,
  ...MANAGED_SYSTEM_AUDIT_EVENT_TYPES,
  ...ANALYTICS_AREA_AUDIT_EVENT_TYPES,
  ...VOC_AUDIT_EVENT_TYPES,
  ...ATTACHMENT_AUDIT_EVENT_TYPES,
  ...ENTITY_LINK_AUDIT_EVENT_TYPES,
  ...FINDING_FROM_VOC_AUDIT_EVENT_TYPES,
  ...VOC_CLUSTER_AUDIT_EVENT_TYPES,
  ...FINDING_LIFECYCLE_AUDIT_EVENT_TYPES,
  ...TASK_REQUEST_AUDIT_EVENT_TYPES,
  ...FINDING_TASK_LINKED_AUDIT_EVENT_TYPES,
  ...TASK_AUDIT_EVENT_TYPES,
  ...VOC_REVIEW_CANDIDATE_AUDIT_EVENT_TYPES,
  ...SURVEY_AUDIT_EVENT_TYPES,
  ...FINDING_FROM_SURVEY_RESPONSE_AUDIT_EVENT_TYPES,
  ...WORKSPACE_SETTINGS_AUDIT_EVENT_TYPES,
  ...VOC_RECOMMENDATION_AUDIT_EVENT_TYPES,
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);

export const AUDIT_EVENT_DETAIL_SCHEMAS = {
  ...PERMISSION_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...MANAGED_SYSTEM_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...ANALYTICS_AREA_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...VOC_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...ATTACHMENT_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...ENTITY_LINK_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...FINDING_FROM_VOC_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...VOC_CLUSTER_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...FINDING_LIFECYCLE_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...TASK_REQUEST_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...FINDING_TASK_LINKED_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...TASK_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...VOC_REVIEW_CANDIDATE_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...SURVEY_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...FINDING_FROM_SURVEY_RESPONSE_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...WORKSPACE_SETTINGS_AUDIT_EVENT_DETAIL_SCHEMAS,
  ...VOC_RECOMMENDATION_AUDIT_EVENT_DETAIL_SCHEMAS,
} as const satisfies Record<AuditEventType, z.ZodTypeAny>;
