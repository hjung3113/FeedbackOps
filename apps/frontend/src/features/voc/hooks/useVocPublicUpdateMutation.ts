// useVocPublicUpdateMutation — submit POST /vocs/:id/public-updates
//
// C5.2 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.2
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (footer submit)
//
// Two paths:
//   body-only:   next_reporter_facing_status === voc.reporter_facing_status → status unchanged
//   body+status: next_reporter_facing_status !== current                    → status changes
//
// Both go to the same endpoint. The field is always sent; backend ignores no-op transitions.
//
// Headers:
//   Idempotency-Key: auto-minted by apiClient
//   If-Match: voc.updated_at (optimistic concurrency)
//
// On 201: caller should invalidate ['voc', vocId] and clear draft.

import { apiClient } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import type { ReporterFacingStatusEnum, VocDetailEnvelope } from '@fops/shared';
import type { TipTapDoc } from '@fops/ui';
import { type UseMutationResult, useMutation } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublicUpdateBody {
  skip_public_update: false;
  body_rich_content: TipTapDoc;
  /** Always sent; backend tolerates no-op when equal to current status. */
  next_reporter_facing_status: ReporterFacingStatusEnum;
  /**
   * PLAN-22 C7b: uploaded attachment ids accepted by the canonical request schema.
   */
  attachment_ids?: string[];
}

export interface PublicUpdateVars {
  vocId: string;
  /** voc.updated_at for If-Match concurrency guard */
  ifMatch: string;
  body: PublicUpdateBody;
}

export interface PublicUpdateSuccess {
  public_update: {
    id: string;
    voc_id: string;
    body_rich_content: unknown | null;
    reporter_facing_status_before: ReporterFacingStatusEnum;
    reporter_facing_status_after: ReporterFacingStatusEnum;
    skip_public_update: boolean;
    skip_reason: string | null;
    created_at: string;
  };
  voc: VocDetailEnvelope;
}

export interface UseVocPublicUpdateMutationArgs {
  onSuccess?: (data: PublicUpdateSuccess, vars: PublicUpdateVars) => void;
  onError?: (err: ApiError, vars: PublicUpdateVars) => void;
}

export type VocPublicUpdateMutationResult = UseMutationResult<
  PublicUpdateSuccess,
  ApiError,
  PublicUpdateVars
>;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVocPublicUpdateMutation(
  args: UseVocPublicUpdateMutationArgs = {},
): VocPublicUpdateMutationResult {
  const { onSuccess, onError } = args;

  return useMutation<PublicUpdateSuccess, ApiError, PublicUpdateVars>({
    mutationFn: async ({ vocId, ifMatch, body }) => {
      const res = await apiClient<PublicUpdateSuccess>('POST', `/vocs/${vocId}/public-updates`, {
        body,
        ifMatch,
        // Idempotency-Key is auto-minted by apiClient for POST/PATCH/DELETE
      });
      return res.data;
    },
    ...(onSuccess ? { onSuccess } : {}),
    ...(onError ? { onError } : {}),
  });
}
