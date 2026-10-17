// triage-types.ts — triage input/output/snapshot types (issue #481).

import type { VocListItem, VocSummaryEnvelope } from '@fops/shared';

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

export interface TriageFullOutput {
  id: string;
  triage_state: string;
  updated_at: string;
}

// #1187: a writer who lost voc.read mid-flow gets the read-matrix summary, which
// carries no triage_state or updated_at.
export type TriageOutput = TriageFullOutput | VocSummaryEnvelope;

export function isTriageFullOutput(output: TriageOutput): output is TriageFullOutput {
  return 'updated_at' in output && typeof output.updated_at === 'string';
}

// Snapshot type for the undo compensate path — captures the prior field values
// so the compensating PATCH can restore the VOC to its original state.
interface TriageSnapshotFields {
  vocId: string;
  ifMatch: string;
  // Prior values for compensate payload
  severity: string | null;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  analyticsAreaId: string | null;
}

export type TriageSnapshot = TriageSnapshotFields &
  (
    | {
        wasConfirm: true;
        triageState: VocListItem['triage_state'];
        reviewPostponedAt: string | null;
      }
    | { wasConfirm: false }
  );
