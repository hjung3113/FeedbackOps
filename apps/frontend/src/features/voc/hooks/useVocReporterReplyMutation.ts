// useVocReporterReplyMutation — submit POST /vocs/:id/reporter-replies
//
// C5.3 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.3
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (reply variant)
//
// Endpoint: POST /vocs/:id/reporter-replies
// Body: { body_rich_content, attachments: [] }
//
// Headers:
//   Idempotency-Key: auto-minted by apiClient (POST/PATCH/DELETE)
//   If-Match: voc.updated_at (optimistic concurrency)
//
// On 200: caller should invalidate ['voc', vocId] and clear draft.
// Toast copy: 리포터에게 답장이 전송되었습니다.

import { apiClient } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/types';
import type { TipTapDoc } from '@fops/ui';
import { type UseMutationResult, useMutation } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReporterReplyBody {
  body_rich_content: TipTapDoc;
  /** Always empty until attachment-deferral lifts in #22. */
  attachments: unknown[];
}

export interface ReporterReplyVars {
  vocId: string;
  /** voc.updated_at for If-Match concurrency guard */
  ifMatch: string;
  body: ReporterReplyBody;
}

export interface ReporterReplySuccess {
  id: string;
  updated_at: string;
}

export interface UseVocReporterReplyMutationArgs {
  onSuccess?: (data: ReporterReplySuccess, vars: ReporterReplyVars) => void;
  onError?: (err: ApiError, vars: ReporterReplyVars) => void;
}

export type VocReporterReplyMutationResult = UseMutationResult<
  ReporterReplySuccess,
  ApiError,
  ReporterReplyVars
>;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVocReporterReplyMutation(
  args: UseVocReporterReplyMutationArgs = {},
): VocReporterReplyMutationResult {
  const { onSuccess, onError } = args;

  return useMutation<ReporterReplySuccess, ApiError, ReporterReplyVars>({
    mutationFn: async ({ vocId, ifMatch, body }) => {
      const res = await apiClient<ReporterReplySuccess>(
        'POST',
        `/vocs/${vocId}/reporter-replies`,
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
