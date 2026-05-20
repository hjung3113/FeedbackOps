// useReporterStatusTransitions.ts — pure read hook for the status picker.
// Reads voc.next_reporter_states + voc.reporter_status_gate.
//
// C4.1 (slice3 #21)
// Spec: docs/frontend/specs/voc.md §5.10
// Prototype ref: docs/design-prototype/screen-voc.jsx:522-534

import type { VocDetailEnvelope, ReporterFacingStatusEnum } from '@fops/shared';

export interface ReporterStatusGate {
  blocking_for: ReporterFacingStatusEnum[];
  reason: string;
}

export interface ReporterStatusTransitions {
  /** Statuses the actor is allowed to transition to from the current status. */
  allowed: ReporterFacingStatusEnum[];
  /** Map of forbidden statuses → reason string. */
  forbidden: Partial<Record<ReporterFacingStatusEnum, string>>;
  /** Gate from a linked-task constraint, or null if absent. */
  gate: ReporterStatusGate | null;
}

/**
 * Derives picker data from the VOC detail envelope.
 * Defaults to empty arrays when fields are absent to guard against stale shapes.
 */
export function useReporterStatusTransitions(
  voc: VocDetailEnvelope,
): ReporterStatusTransitions {
  const allowed = voc.next_reporter_states?.allowed ?? [];
  const forbidden = (voc.next_reporter_states?.forbidden ?? {}) as Partial<
    Record<ReporterFacingStatusEnum, string>
  >;

  // reporter_status_gate added to VocDetailEnvelope in C4.1
  const rawGate = voc.reporter_status_gate;

  const gate: ReporterStatusGate | null =
    rawGate != null
      ? { blocking_for: rawGate.blocking_for, reason: rawGate.reason }
      : null;

  return { allowed, forbidden, gate };
}
