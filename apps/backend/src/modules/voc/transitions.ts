// nextReporterStates — reads the reporter-facing status transition matrix
// from voc.reporter_facing_status_transitions. Service code MUST NOT
// hard-code transitions; always call this reader instead.
//
// Spec: docs/frontend/specs/voc.md §4.5
// Refs: Slice 3 #12 Task 6

import { eq } from 'drizzle-orm';

import { reporterFacingStatusTransitions } from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';

export interface ReporterStateOptions {
  allowed: string[];
  forbidden: Record<string, string>;
}

export async function nextReporterStates(
  currentStatus: string,
  tx: Tx,
): Promise<ReporterStateOptions> {
  const rows = await tx
    .select()
    .from(reporterFacingStatusTransitions)
    .where(eq(reporterFacingStatusTransitions.fromStatus, currentStatus));

  const allowed: string[] = [];
  const forbidden: Record<string, string> = {};
  for (const r of rows) {
    if (r.allowed) {
      allowed.push(r.toStatus);
    } else if (r.forbiddenReason) {
      forbidden[r.toStatus] = r.forbiddenReason;
    }
  }
  return { allowed, forbidden };
}
