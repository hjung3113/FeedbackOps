// useVocEditDescriptionMutation.ts
// PATCH /vocs/:id/description — Reporter pre-triage edit flow.
//
// Headers: Idempotency-Key (auto-minted by apiClient) + If-Match (voc.updated_at).
// Error matrix:
//   409 conflict.triage_already_committed → modal closes + toast
//   409 conflict.stale_write              → modal stays open, caller refreshes baseline
//   422 validation.failed                 → per-field detail → form.setError
//   422 rich_content.*                    → editor border red signal
//   409 conflict.parent_archived          → close modal + toast
//   409 conflict.record_archived          → close modal + toast
//
// C6.1 of slice3 #21. No UI — pure hook layer.

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api';
import type { EditDescriptionRequest } from '@fops/shared';

// ── Mutation variables ─────────────────────────────────────────────────────

export interface EditDescriptionVars {
  /** VOC uuid */
  vocId: string;
  /**
   * voc.updated_at value at the time the modal opened; used as the If-Match
   * header for optimistic concurrency (ADR-0019 §E). Caller refreshes this on
   * conflict.stale_write by re-reading `useVocDetail` and re-opening the modal.
   */
  ifMatch: string;
  /**
   * Subset of fields being patched.  At least one of `title` /
   * `description_rich_content` must be present per `EditDescriptionRequest`.
   * `attachments` defaults to [] per C6.1 spec — upload deferred to #22.
   */
  body: EditDescriptionRequest;
}

// ── Success shape ──────────────────────────────────────────────────────────

/** Minimum fields the mutation caller needs after a successful PATCH. */
export interface EditDescriptionSuccess {
  id: string;
  title: string;
  updated_at: string;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export type UseVocEditDescriptionMutationResult = UseMutationResult<
  EditDescriptionSuccess,
  ApiError,
  EditDescriptionVars
>;

/**
 * Fires `PATCH /vocs/:id/description` with `Idempotency-Key` (auto-minted)
 * and `If-Match: voc.updated_at`.
 *
 * Error handling is left to the **caller** (C6.2 `EditDescriptionModal`) — this
 * hook exposes the raw `ApiError` through `mutation.error` so the modal can
 * branch on `err.code` without coupling the hook to UI concerns.
 */
export function useVocEditDescriptionMutation(): UseVocEditDescriptionMutationResult {
  return useMutation<EditDescriptionSuccess, ApiError, EditDescriptionVars>({
    mutationFn: async ({ vocId, ifMatch, body }) => {
      const res = await apiClient<EditDescriptionSuccess>(
        'PATCH',
        `/vocs/${vocId}/description`,
        {
          body,
          // Idempotency-Key is auto-minted by apiClient when absent (ADR-0015).
          ifMatch,
        },
      );
      return res.data;
    },
  });
}
