// useVocTriageMutation.ts — react-query seam for the VOC triage PATCH.
//
// C3.2 of slice3 #21. The undo state machine is owned by useTriageCommand,
// which composes useUndoableMutation; this hook is only the react-query seam
// over patchVocTriage (lib/triage-transport.ts).
//
// PATCH /vocs/:id
//   confirm:  { severity, owner_user_id, owner_team_id, analytics_area_id, triage_state:'triaged' }
//   skip:     { postpone_review: true }
//   finding:  same body as confirm (triage is committed; navigation is Slice 5)
//
// Headers: Idempotency-Key (auto-minted by the API client), If-Match: voc.updated_at
// Compensating PATCH: same endpoint with prior values + triage_state:'untriaged' +
//   EXPLICIT fresh Idempotency-Key (D-3.5) — executeCompensatingPatch is
//   re-exported from lib/triage-transport.ts.
//
// Prototype ref: docs/design-prototype/screen-voc-create.jsx:612-642

import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import { patchVocTriage } from '../lib/triage-transport';
import type { TriageInput, TriageOutput } from '../lib/triage-types';

// Types moved verbatim to lib/triage-types.ts (issue #481); re-exported so
// existing import paths keep working.
export type {
  TriageConfirmInput,
  TriageSkipInput,
  TriageInput,
  TriageOutput,
  TriageSnapshot,
} from '../lib/triage-types';
export { executeCompensatingPatch } from '../lib/triage-transport';

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
    // No AbortSignal: the react-query mutation's request lifetime is unchanged
    // (issue #481 §2) — the signal seam belongs to useTriageCommand only.
    mutationFn: (input: TriageInput) => patchVocTriage(input),
  });
}
