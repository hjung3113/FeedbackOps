// nextReporterStates — reads the reporter-facing status transition matrix
// from voc.reporter_facing_status_transitions. Service code MUST NOT
// hard-code transitions; always call this reader instead.
//
// Spec: docs/frontend/specs/voc.md §4.5
// Refs: Slice 3 #12 Task 6

import { eq } from 'drizzle-orm';

import { reporterFacingStatusTransitions } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';

// All valid reporter-facing VOC statuses. Must match the DB CHECK constraint
// vocs_reporter_facing_status_enum and the seed data in 0010 migration.
export const REPORTER_FACING_STATUSES = [
  'received',
  'reviewing',
  'assigned',
  'progress',
  'prep',
  'resolved',
  'reopened',
  'closed',
] as const;

export type ReporterFacingStatus = (typeof REPORTER_FACING_STATUSES)[number];

export interface ReporterStateOptions {
  allowed: ReporterFacingStatus[];
  forbidden: Partial<Record<ReporterFacingStatus, string>>;
}

export async function nextReporterStates(
  currentStatus: ReporterFacingStatus,
  tx: Tx,
): Promise<ReporterStateOptions> {
  const rows = await tx
    .select()
    .from(reporterFacingStatusTransitions)
    .where(eq(reporterFacingStatusTransitions.fromStatus, currentStatus));

  const allowed: ReporterFacingStatus[] = [];
  const forbidden: Partial<Record<ReporterFacingStatus, string>> = {};
  for (const r of rows) {
    if (r.allowed) {
      allowed.push(r.toStatus as ReporterFacingStatus);
    } else if (r.forbiddenReason) {
      forbidden[r.toStatus as ReporterFacingStatus] = r.forbiddenReason;
    } else {
      // DB CHECK rfst_allowed_no_reason + rfst_disallowed_has_reason guarantee
      // this branch is unreachable. If we hit it, the seed data drifted.
      throw new Error(
        `reporter_facing_status_transitions row violates CHECK: from=${r.fromStatus} to=${r.toStatus} allowed=${r.allowed} reason=${r.forbiddenReason ?? 'null'}`,
      );
    }
  }
  return { allowed, forbidden };
}
