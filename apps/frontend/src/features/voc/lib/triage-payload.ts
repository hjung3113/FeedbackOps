// triage-payload.ts — triage PATCH payload serialization + snapshot assembly
// (issue #481). Pure functions: no React, no I/O.
//
// Forward PATCH /vocs/:id bodies:
//   confirm:  { triage_state:'triaged', severity, owner_user_id, owner_team_id, analytics_area_id }
//   skip:     { postpone_review: true }
//   finding:  same body as confirm (triage is committed; navigation is Slice 5)
//
// Compensating PATCH bodies:
//   confirm/finding → { triage_state:'untriaged', ...prior values }
//   skip            → { postpone_review: false }

import type { TriageInput, TriageSnapshot } from './triage-types';

/** Prior (pre-mutation) VOC fields the compensating PATCH must restore. */
export interface TriagePriorFields {
  severity: string | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  analyticsAreaId: string | null;
}

/**
 * buildPayload — forward PATCH body for the triage mutation (issue-named export).
 * Body is identical to the former private buildPayload in
 * hooks/useVocTriageMutation.ts and components/triage/TriagePanel.tsx.
 */
export function buildPayload(input: TriageInput): Record<string, unknown> {
  if (input.kind === 'skip') {
    return { postpone_review: true };
  }
  // confirm or finding — same triage payload
  return {
    triage_state: 'triaged' as const,
    severity: input.severity,
    owner_user_id: input.ownerUserId,
    owner_team_id: input.ownerTeamId,
    analytics_area_id: input.analyticsAreaId,
  };
}

/**
 * buildCompensatePayload — compensating PATCH body from the SNAPSHOT's prior
 * fields, never the staged input values (REV-1 #3: snapshotting staged values
 * would permanently overwrite severity/owner/AA with triage_state='untriaged').
 */
export function buildCompensatePayload(snapshot: TriageSnapshot): Record<string, unknown> {
  return snapshot.wasConfirm
    ? {
        triage_state: 'untriaged' as const,
        severity: snapshot.severity,
        owner_user_id: snapshot.ownerUserId,
        owner_team_id: snapshot.ownerTeamId,
        analytics_area_id: snapshot.analyticsAreaId,
      }
    : { postpone_review: false };
}

/**
 * buildTriageSnapshot — snapshot captured synchronously at mutate() time,
 * BEFORE the PATCH resolves. vocId/ifMatch come from the INPUT (ifMatch is the
 * click-time voc.updated_at); prior fields come from the pre-mutation voc row
 * (REV-1 #3). skip captures no prior field values — the compensate body for
 * skip is keyed off wasConfirm and carries no severity/owner fields.
 */
export function buildTriageSnapshot(input: TriageInput, prior: TriagePriorFields): TriageSnapshot {
  const isConfirm = input.kind === 'confirm' || input.kind === 'finding';
  return {
    vocId: input.vocId,
    ifMatch: input.ifMatch,
    severity: isConfirm ? prior.severity : null,
    ownerUserId: isConfirm ? prior.ownerUserId : null,
    ownerTeamId: isConfirm ? prior.ownerTeamId : null,
    analyticsAreaId: isConfirm ? prior.analyticsAreaId : null,
    wasConfirm: isConfirm,
  };
}
