// useReporterCanEditDescription.ts
// Gate hook: returns true only when the actor IS the VOC's reporter AND the
// VOC has not yet been triaged (triage_state === 'untriaged').
//
// This gate mirrors the backend permission check for PATCH /vocs/:id/description
// and drives the 수정 button visibility in DescriptionSection (C6.2).
//
// C6.1 of slice3 #21.

import type { TriageStateEnum } from '@fops/shared';

// Minimum VOC fields this gate needs — avoids depending on the full
// VocDetailEnvelope so the hook works with both VocListItem and VocDetailEnvelope.
export interface VocForEditGate {
  reporter_id: string;
  triage_state: TriageStateEnum | string;
}

export interface UseReporterCanEditDescriptionArgs {
  /** Authenticated actor's ID. */
  actorId: string;
  /** The VOC being viewed. */
  voc: VocForEditGate;
}

/**
 * Returns `true` when:
 *   1. The current actor is the reporter of this VOC, AND
 *   2. The VOC has not yet been triaged (`triage_state === 'untriaged'`).
 *
 * Both conditions must hold simultaneously — a reporter cannot edit after
 * triage begins (conflict.triage_already_committed from backend confirms this).
 */
export function useReporterCanEditDescription({
  actorId,
  voc,
}: UseReporterCanEditDescriptionArgs): boolean {
  return actorId === voc.reporter_id && voc.triage_state === 'untriaged';
}
