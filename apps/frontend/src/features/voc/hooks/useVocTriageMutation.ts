// useVocTriageMutation.ts — VOC-specific triage mutation hook.
//
// C3.2 of slice3 #21.
// Composes useUndoableMutation<TriageInput, TriageOutput> into the VOC triage
// confirm/skip/finding flows.
//
// PATCH /vocs/:id
//   confirm:  { severity, owner_user_id, owner_team_id, analytics_area_id, triage_state:'triaged' }
//   skip:     { postpone_review: true }
//   finding:  same body as confirm (triage is committed; navigation is Slice 5)
//
// Headers: Idempotency-Key (auto-minted by apiClient), If-Match: voc.updated_at
// Compensating PATCH: same endpoint with prior values + triage_state:'untriaged' +
//   EXPLICIT fresh Idempotency-Key (D-3.5).
//
// Prototype ref: docs/design-prototype/screen-voc-create.jsx:612-642

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// ── types ──────────────────────────────────────────────────────────────────

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

// ── helpers ────────────────────────────────────────────────────────────────

function buildPayload(input: TriageInput): Record<string, unknown> {
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

// ── hook ───────────────────────────────────────────────────────────────────

/**
 * useVocTriageMutation — tanstack/react-query mutation for PATCH /vocs/:id.
 *
 * Exposes the raw mutation object. The caller (TriageActions / VocTriageScreen)
 * is responsible for:
 *   - Calling mutate(input)
 *   - Calling compensate(snapshot) for the undo settled path (with fresh key)
 *   - Handling error codes for the queue side-effects
 */
export function useVocTriageMutation(): UseMutationResult<TriageOutput, Error, TriageInput> {
  return useMutation<TriageOutput, Error, TriageInput>({
    mutationFn: async (input: TriageInput) => {
      const res = await apiClient<TriageOutput>('PATCH', `/vocs/${input.vocId}`, {
        body: buildPayload(input),
        ifMatch: input.ifMatch,
        // Idempotency-Key auto-minted by apiClient for PATCH (D-3.5)
      });
      return res.data;
    },
  });
}

// ── compensating PATCH helper ──────────────────────────────────────────────

/**
 * executeCompensatingPatch — fires the compensating PATCH for the undo-settled path.
 * Must be called with the snapshot captured at mutate() time.
 *
 * D-3.5: the compensating PATCH MUST use an explicit fresh Idempotency-Key — do NOT
 * rely on the auto-mint (which would reuse the auto-generated key from the same
 * process if called too quickly). Pass an explicit fresh UUID.
 */
export async function executeCompensatingPatch(snapshot: TriageSnapshot): Promise<TriageOutput> {
  const payload: Record<string, unknown> = snapshot.wasConfirm
    ? {
        triage_state: 'untriaged' as const,
        severity: snapshot.severity,
        owner_user_id: snapshot.ownerUserId,
        owner_team_id: snapshot.ownerTeamId,
        analytics_area_id: snapshot.analyticsAreaId,
      }
    : { postpone_review: false };

  const freshKey = mintFreshKey();
  const res = await apiClient<TriageOutput>('PATCH', `/vocs/${snapshot.vocId}`, {
    body: payload,
    ifMatch: snapshot.ifMatch,
    idempotencyKey: freshKey,
  });
  return res.data;
}

function mintFreshKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
