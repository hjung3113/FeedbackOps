// useComposerVisibility — derives composer tabs from actor identity and triage capability.
//
// C5.1 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:404-413 (tab visibility gating)
//
// Visibility rules:
//   - Reporter on own VOC → reply; internal only with voc.triage
//   - Admin or Developer → public and reply; Internal only with voc.triage
//   - Reporter on someone else's VOC → Internal only with triage; otherwise no composer
//
// The outer panel guards full-envelope access. Internal remains gated separately by
// the backend triage capability supplied by the detail controller.

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
  canTriage: boolean,
): ComposerVisibility | null {
  if (!me) return null;

  const { role_level, id: actorId } = me.actor;
  const isReporter = role_level === 'user';
  const isOwnVoc = actorId === voc.reporter_id;

  // Reporter on their own VOC → reply tab, plus Internal when triage is approved.
  if (isReporter && isOwnVoc) {
    return { showPublic: false, showReply: true, showInternal: canTriage };
  }

  // A User with triage may add Internal, but cannot use Public/Reply on someone else's VOC.
  if (isReporter && !isOwnVoc) {
    return canTriage ? { showPublic: false, showReply: false, showInternal: true } : null;
  }

  // Public and reply stay role-based; Internal follows the backend capability.
  return { showPublic: true, showReply: true, showInternal: canTriage };
}
