// useComposerVisibility — derives composer tabs from actor identity and triage capability.
//
// C5.1 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.1
// Prototype ref: docs/design-prototype/screen-voc.jsx:404-413 (tab visibility gating)
//
// Visibility rules:
//   - Reply → only the VOC's Reporter (any role); the backend rejects every other actor
//   - Public → every role except User
//   - Internal → only with voc.triage
//   - Nothing visible → no composer
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
  const showPublic = role_level !== 'user';
  const showReply = actorId === voc.reporter_id;

  if (!showPublic && !showReply && !canTriage) return null;
  return { showPublic, showReply, showInternal: canTriage };
}
