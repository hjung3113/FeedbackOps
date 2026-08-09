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

/**
 * True when the staged next status is neither the current status nor an allowed
 * transition from it.
 *
 * #356: the picker renders non-allowed options as `disabled`, so a user cannot
 * select one directly, and `nextStatus` is initialised to the current status
 * (which is never forbidden). The only way this returns true is that
 * `voc.reporter_facing_status` / `allowed` changed underneath a selection the
 * user had already made — another actor moved the VOC and the detail query
 * refetched. `nextStatus` is deliberately NOT resynced (that would silently drop
 * the user's choice), so both the composer and the block derive the blocked
 * state from here instead of duplicating the comparison.
 */
export function isForbiddenTransition(
  transitions: Pick<ReporterStatusTransitions, 'allowed'>,
  currentStatus: ReporterFacingStatusEnum,
  nextStatus: ReporterFacingStatusEnum,
): boolean {
  return nextStatus !== currentStatus && !transitions.allowed.includes(nextStatus);
}
