// ADR-0012 stable error codes. Authoritative list lives in this file; both
// apps import from `@fops/shared`. Slice 1 ships only the codes the auth path
// emits — additional codes are added by their owning slice in lockstep with
// the i18n catalog (when that lands).

import { z } from "zod";

export const ERROR_CODES = [
  // auth.* → 401
  "auth.session_invalid",
  "auth.session_required",
  "auth.session_expired",
  // permission.* → 403
  "auth.workspace_mismatch",
  "permission.denied",
  // rate_limited.* → 429
  "rate_limited.actor",
  "rate_limited.ip",
  // validation.* → 422
  "validation.failed",
  "validation.malformed_request",
  "validation.unknown_capability",
  // conflict.* → 409
  "conflict.idempotency_key_reuse",
  "conflict.capability_already_granted",
  "conflict.capability_already_denied",
  "conflict.permission_request_duplicate",
  // validation.* → 422 (continued)
  "validation.malformed_idempotency_key",
  "validation.sensitive_reason_required",
  "validation.immutable_field",
  // conflict.* → 409 (Slice 2 #10/#11)
  "conflict.duplicate_slug",
  "conflict.parent_archived",
  // conflict.* → 409 (ADR-0019 Section A — archived row is itself
  // immutable; distinct from `conflict.parent_archived` which rejects
  // because the referenced parent is archived).
  "conflict.record_archived",
  // not_found.* → 404
  "not_found.record",
  // internal.* → 500
  "internal.unexpected",
  // validation.* / voc.* / rich_content.* / attachment.* → 422 (Slice 3 #13)
  "voc.severity_not_user_settable",
  "validation.unexpected_field",
  "rich_content.disallowed_node",
  "rich_content.disallowed_attr",
  "rich_content.invalid_attr_value",
  "rich_content.missing_required_attr",
  "rich_content.external_image_forbidden",
  // PLAN-22 C7b: `attachment.unsupported_pending_storage_slice` retired —
  // the storage slice (C3a/C3b) shipped and attachments now ride as
  // `attachment_ids: string[]` on the wire (linked from voc.voc_attachments).
  // conflict.* → 409 (Slice 3 #14 — optimistic concurrency)
  "conflict.stale_write",
  // voc.* → 422 (Slice 3 #14 — forbidden field on PATCH)
  "voc.reporter_status_via_public_update_only",
  // permission.* → 403 (Slice 3 #14 — MS-scope required)
  "permission.scope_required",
  // reporter_facing_status.* → 422 (Slice 3 #16 — transition validation + gate)
  "reporter_facing_status.invalid_transition",
  "reporter_facing_status.gate_blocked",
  // conflict.* → 409 (Slice 3 #17 — Reporter edit blocked by committed triage)
  "conflict.triage_already_committed",
  // storage.* → 502 (Slice 3 #22 / PLAN-22 C3a — object-store unavailable)
  "storage.unavailable",
  // attachment.* → 422 (PLAN-22 C3a — declared content type / size cap)
  "attachment.too_large",
  "attachment.unsupported_type",
  // not_implemented.* → 501 (PLAN-22 C3a — stubbed happy path until C3b)
  "not_implemented.todo",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * ADR-0012 response envelope. `detail` and `requestable_permission` are
 * optional and code-specific; the shape itself is universal.
 */
export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  detail?: Record<string, unknown>;
  requestable_permission?: {
    permission: string;
    managed_system_id?: string;
    reason_required?: boolean;
  };
}
