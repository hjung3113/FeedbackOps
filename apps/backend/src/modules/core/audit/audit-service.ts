// Audit application service. Owned by the Core module per
// docs/implementation/02-domain-module-boundaries.md:32-42.
//
// Contract (ADR-0008):
//   * Every domain mutation that produces an audit_log row MUST commit the
//     row in the SAME transaction as the underlying mutation. To enforce
//     this at compile time, the only public API takes a Drizzle transaction
//     handle as its first parameter. There is no `record-without-tx` variant.
//   * `event_type` is constrained to the AUDIT_EVENT_TYPES enum (ADR-0008:53).
//     Unknown event_type → thrown error; this is a programmer error, not a
//     user-facing 422.
//   * `detail` is validated against the per-event-type schema in
//     AUDIT_EVENT_DETAIL_SCHEMAS. A malformed detail throws; the application
//     service that emitted the audit is responsible for shaping it correctly.

import {
  AUDIT_EVENT_DETAIL_SCHEMAS,
  type AuditEventType,
  auditEventTypeSchema,
} from '@fops/shared';

import type { Tx } from '../../../db/tx.js';
import { auditLog } from '../../../db/schema/core.js';

export type { Tx };

export interface AuditRecordInput {
  workspace_id: string;
  actor_id: string;
  event_type: AuditEventType;
  subject_type: string;
  subject_id: string;
  summary: string;
  detail: Record<string, unknown>;
}

export function createAuditService() {
  async function record(tx: Tx, input: AuditRecordInput): Promise<void> {
    // Validate event_type against the closed enum. Throws on unknown.
    const eventType = auditEventTypeSchema.parse(input.event_type);
    // Validate detail against the per-event schema. Throws on shape error.
    const schema = AUDIT_EVENT_DETAIL_SCHEMAS[eventType];
    const detail = schema.parse(input.detail);

    await tx.insert(auditLog).values({
      workspaceId: input.workspace_id,
      actorId: input.actor_id,
      eventType,
      subjectType: input.subject_type,
      subjectId: input.subject_id,
      summary: input.summary,
      detail: detail as object,
    });
  }

  return { record };
}

export type AuditService = ReturnType<typeof createAuditService>;
