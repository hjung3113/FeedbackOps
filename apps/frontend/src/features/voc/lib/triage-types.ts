// triage-types.ts — triage input/output/snapshot types (issue #481).
// Moved verbatim from hooks/useVocTriageMutation.ts, which re-exports them so
// existing import paths keep working.

export interface TriageConfirmInput {
  kind: 'confirm' | 'finding';
  vocId: string;
  ifMatch: string;
  severity: string | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  analyticsAreaId: string | null;
}

export interface TriageSkipInput {
  kind: 'skip';
  vocId: string;
  ifMatch: string;
}

export type TriageInput = TriageConfirmInput | TriageSkipInput;

export interface TriageOutput {
  id: string;
  triage_state: string;
  updated_at: string;
}

// Snapshot type for the undo compensate path — captures the prior field values
// so the compensating PATCH can restore the VOC to its original state.
export interface TriageSnapshot {
  vocId: string;
  ifMatch: string;
  // Prior values for compensate payload
  severity: string | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  analyticsAreaId: string | null;
  // Whether this was a confirm/finding (only those need compensation by prior-values)
  wasConfirm: boolean;
}
