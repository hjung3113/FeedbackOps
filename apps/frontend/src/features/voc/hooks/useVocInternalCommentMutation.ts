// useVocInternalCommentMutation — submit POST /vocs/:id/internal-comments
//
// C5.4 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.4
//
// Headers:
//   Idempotency-Key: auto-minted by apiClient
//   If-Match: voc.updated_at (optimistic concurrency)
//
// On 201: caller should invalidate ['voc', vocId], clear draft, toast.

import { apiClient } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import type { VocDetailEnvelope } from '@fops/shared';
import type { TipTapDoc } from '@fops/ui';
import { type UseMutationResult, useMutation } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InternalCommentBody {
  body_rich_content: TipTapDoc;
  /** Deduplicated list of mentioned actor IDs. Extracted by extractMentions(). */
  mentions: string[];
  /**
   * PLAN-22 C7a (D1): widened body field — FE list of uploaded attachment ids
   * from <ComposerAttachmentDropzone>. BE schema reconciled in C7b.
   */
  attachment_ids?: string[];
}

export interface InternalCommentVars {
  vocId: string;
  /** voc.updated_at for If-Match concurrency guard */
  ifMatch: string;
  body: InternalCommentBody;
}

export interface InternalCommentSuccess {
  internal_comment: {
    id: string;
    voc_id: string;
    actor_id: string;
    body_rich_content: unknown;
    created_at: string;
  };
  voc: VocDetailEnvelope;
}

export interface UseVocInternalCommentMutationArgs {
  onSuccess?: (data: InternalCommentSuccess, vars: InternalCommentVars) => void;
  onError?: (err: ApiError, vars: InternalCommentVars) => void;
}

export type VocInternalCommentMutationResult = UseMutationResult<
  InternalCommentSuccess,
  ApiError,
  InternalCommentVars
>;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVocInternalCommentMutation(
  args: UseVocInternalCommentMutationArgs = {},
): VocInternalCommentMutationResult {
  const { onSuccess, onError } = args;

  return useMutation<InternalCommentSuccess, ApiError, InternalCommentVars>({
    mutationFn: async ({ vocId, ifMatch, body }) => {
      const res = await apiClient<InternalCommentSuccess>(
        'POST',
        `/vocs/${vocId}/internal-comments`,
        {
          body,
          ifMatch,
          // Idempotency-Key is auto-minted by apiClient for POST/PATCH/DELETE
        },
      );
      return res.data;
    },
    ...(onSuccess ? { onSuccess } : {}),
    ...(onError ? { onError } : {}),
  });
}
