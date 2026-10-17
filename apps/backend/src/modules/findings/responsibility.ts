import type { ResponsibilityDefaultFailure } from '@fops/shared';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { lockWorkspaceActor } from '../auth/index.js';
import { findResponsibilityTeam } from '../core/responsibility-read-projections.js';
import {
  type LockedManagedSystem,
  recordResponsibilityDefaultFailure,
} from '../managed-systems/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { checkFindingManage } from './authorization.js';

type Category = ResponsibilityDefaultFailure['category'];
type Input = {
  owner_actor_id?: string | null | undefined;
  owner_team_id?: string | null | undefined;
};

export async function validateOwner(
  tx: Tx,
  deps: { checkService: CheckService },
  workspaceId: string,
  ms: Pick<LockedManagedSystem, 'id'>,
  actorId: string | null,
  teamId: string | null,
): Promise<Category | null> {
  if (actorId && teamId) return 'invalid_pair';
  if (teamId) {
    const team = await findResponsibilityTeam(tx, workspaceId, teamId);
    return !team ? 'foreign_workspace' : team.archived_at ? 'archived_team' : null;
  }
  if (!actorId) return null;
  const candidate = await lockWorkspaceActor(tx, { workspaceId, actorId });
  if (!candidate) return 'foreign_workspace';
  if (candidate.actor_type !== 'internal_member') return 'ineligible_actor';
  const candidateActor = {
    actor_id: candidate.id,
    workspace_id: workspaceId,
    role_level: candidate.role_level,
  };
  return (
    await checkFindingManage(
      deps.checkService,
      candidateActor,
      ms.id,
      { requireElevatedRole: false },
      { tx },
    )
  ).allow
    ? null
    : 'ineligible_actor';
}

export async function resolveOwner(
  tx: Tx,
  deps: { checkService: CheckService },
  workspaceId: string,
  ms: LockedManagedSystem,
  areaTeamId: string | null,
  input: Input,
) {
  const explicit = input.owner_actor_id !== undefined || input.owner_team_id !== undefined;
  if (explicit) {
    const actorId = input.owner_actor_id ?? null;
    const teamId = input.owner_team_id ?? null;
    const failure = await validateOwner(tx, deps, workspaceId, ms, actorId, teamId);
    if (failure)
      throw new HttpError('validation.failed', 'invalid owner', {
        fields: [{ path: [teamId ? 'owner_team_id' : 'owner_actor_id'], code: failure }],
      });
    return {
      owner_actor_id: actorId,
      owner_team_id: teamId,
      default_resolved: false,
      source_rule: 'explicit' as const,
      managed_system_id: ms.id,
    };
  }
  const missingFailures: ResponsibilityDefaultFailure[] = [];
  for (const candidate of [
    {
      rule: 'managed_system_owner' as const,
      actorId: ms.default_owner_actor_id,
      teamId: ms.default_owner_team_id,
    },
    { rule: 'analytics_area_owner' as const, actorId: null, teamId: areaTeamId },
  ]) {
    const failure =
      !candidate.actorId && !candidate.teamId
        ? 'missing'
        : await validateOwner(tx, deps, workspaceId, ms, candidate.actorId, candidate.teamId);
    if (!failure)
      return {
        owner_actor_id: candidate.actorId,
        owner_team_id: candidate.teamId,
        default_resolved: true,
        source_rule: candidate.rule,
        managed_system_id: ms.id,
      };
    const diagnostic: ResponsibilityDefaultFailure = {
      workspace_id: workspaceId,
      managed_system_id: ms.id,
      workflow: 'finding',
      responsibility: 'owner',
      rule: candidate.rule,
      category: failure,
    };
    if (failure === 'missing') missingFailures.push(diagnostic);
    else await recordResponsibilityDefaultFailure(tx, diagnostic);
  }
  for (const diagnostic of missingFailures)
    await recordResponsibilityDefaultFailure(tx, diagnostic);
  return {
    owner_actor_id: null,
    owner_team_id: null,
    default_resolved: false,
    source_rule: 'workspace_fallback_queue' as const,
    managed_system_id: ms.id,
  };
}
