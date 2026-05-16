// ADR-0012 stable error codes. Authoritative list lives in this file; both
// apps import from `@fops/shared`. Slice 1 ships only the codes the auth path
// emits — additional codes are added by their owning slice in lockstep with
// the i18n catalog (when that lands).

import { z } from 'zod';

export const ERROR_CODES = [
  // auth.* → 401
  'auth.session_invalid',
  'auth.session_required',
  'auth.session_expired',
  // permission.* → 403
  'auth.workspace_mismatch',
  'permission.denied',
  // rate_limited.* → 429
  'rate_limited.actor',
  'rate_limited.ip',
  // validation.* → 422
  'validation.failed',
  'validation.malformed_request',
  'validation.unknown_capability',
  // conflict.* → 409
  'conflict.idempotency_key_reuse',
  'conflict.capability_already_granted',
  'conflict.permission_request_duplicate',
  // validation.* → 422 (continued)
  'validation.malformed_idempotency_key',
  'validation.sensitive_reason_required',
  'validation.immutable_field',
  // conflict.* → 409 (Slice 2 #10/#11)
  'conflict.duplicate_slug',
  'conflict.parent_archived',
  // not_found.* → 404
  'not_found.record',
  // internal.* → 500
  'internal.unexpected',
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
