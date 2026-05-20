// useComposerVisibility — derives which composer tabs to show based on actor role + VOC context.
//
// C5.1 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:404-413 (tab visibility gating)
//
// Visibility rules:
//   - Reporter on own VOC → { showPublic: false, showReply: true, showInternal: false }
//   - Admin or Developer in scope → { showPublic: true, showReply: true, showInternal: true }
//   - Reporter on someone else's VOC → null (no composer section rendered)
//
// The "outside MS" case (developer not in read_scope for the VOC's MS) is handled
// upstream: VocDetailPanel only shows the full envelope to actors with read_scope,
// so the outer panel already guards access. A developer who receives the full envelope
// is considered in-scope.

import type { VocDetailEnvelope } from '@fops/shared';
import type { MeResponse } from '@/lib/auth/useMe';

export interface ComposerVisibility {
  showPublic: boolean;
  showReply: boolean;
  showInternal: boolean;
}

/**
 * Returns the set of composer tabs the current actor is allowed to see, or
 * `null` when no composer should be rendered at all.
 */
export function useComposerVisibility(
  voc: VocDetailEnvelope,
  me: MeResponse | null | undefined,
): ComposerVisibility | null {
  if (!me) return null;

  const { role_level, id: actorId } = me.actor;
  const isReporter = role_level === 'user';
  const isOwnVoc = actorId === voc.reporter_id;

  // Reporter on their own VOC → reply tab only.
  if (isReporter && isOwnVoc) {
    return { showPublic: false, showReply: true, showInternal: false };
  }

  // Reporter on someone else's VOC → no composer.
  if (isReporter && !isOwnVoc) {
    return null;
  }

  // Admin or Developer in scope → all three tabs.
  // (VocDetailPanel guards the full envelope so reaching here implies in-scope.)
  return { showPublic: true, showReply: true, showInternal: true };
}
