import type { EntityLinkVisibility, EntityLinkVisibilityState } from '@fops/shared';

export interface LinkVisibilityEvaluationInput {
  visibility: EntityLinkVisibility;
  actorContext: {
    actor_id: string;
    role_level: 'admin' | 'developer' | 'user';
  };
  sourceReadable: boolean;
  targetReadable: boolean;
  targetSummaryAvailable: boolean;
  sourceReporterId?: string | null;
  targetReporterId?: string | null;
}

export type LinkVisibilityDecision = EntityLinkVisibilityState;

export function evaluateLinkVisibility(
  input: LinkVisibilityEvaluationInput,
): LinkVisibilityDecision {
  if (!input.sourceReadable) return 'hidden';
  if (!input.targetReadable) {
    if (
      input.visibility === 'summary_visible' &&
      input.actorContext.role_level === 'user' &&
      input.targetSummaryAvailable
    ) {
      return 'summary_visible';
    }
    return 'hidden';
  }

  const { actorContext, visibility } = input;
  const isAdmin = actorContext.role_level === 'admin';
  const isDeveloper = actorContext.role_level === 'developer';

  if (isAdmin) return 'allowed';

  switch (visibility) {
    case 'internal_only':
      return isDeveloper ? 'allowed' : 'hidden';
    case 'summary_visible':
      if (isDeveloper) return 'allowed';
      return input.targetSummaryAvailable ? 'summary_visible' : 'hidden';
    case 'visible_to_reporter':
      if (isDeveloper) return 'allowed';
      return input.sourceReporterId === actorContext.actor_id &&
        input.targetReporterId === actorContext.actor_id
        ? 'allowed'
        : 'hidden';
    case 'admin_only':
      return isDeveloper ? 'denied' : 'hidden';
  }
}
