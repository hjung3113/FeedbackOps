import type { ResponsibilityDefaultFailure } from '@fops/shared';
import { and, eq } from 'drizzle-orm';
import { actors, teams } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';

type Category = ResponsibilityDefaultFailure['category'];

/** Registry eligibility is a routing hint; destination commands recheck their own capability. */
export async function responsibilityTargetFailure(
  tx: Tx,
  checkService: CheckService,
  workspaceId: string,
  managedSystemId: string | undefined,
  kind: 'owner' | 'reviewer',
  actorId: string | null | undefined,
  teamId: string | null | undefined,
): Promise<Category | null> {
  if (actorId && teamId) return 'invalid_pair';
  if (!actorId && !teamId) return 'missing';
  if (teamId) {
    const [team] = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.workspaceId, workspaceId)))
      .limit(1);
    if (!team) return 'foreign_workspace';
    return team.archivedAt ? 'archived_team' : null;
  }
  const [candidate] = await tx
    .select()
    .from(actors)
    .where(and(eq(actors.id, actorId as string), eq(actors.workspaceId, workspaceId)))
    .limit(1);
  if (!candidate) return 'foreign_workspace';
  if (
    candidate.actorType !== 'internal_member' ||
    !['admin', 'developer'].includes(candidate.roleLevel)
  )
    return 'ineligible_actor';
  const actor = {
    actor_id: candidate.id,
    workspace_id: workspaceId,
    role_level: candidate.roleLevel,
  };
  const scope = {
    workspace_id: workspaceId,
    ...(managedSystemId ? { managed_system_id: managedSystemId } : {}),
  };
  const finding = await checkService.checkCapability(actor, 'finding.manage', scope, { tx });
  if (applyAdminModuleBypass(actor.role_level, 'finding.manage', finding).allow) return null;
  if (kind === 'owner') {
    const triage = await checkService.checkCapability(actor, 'voc.triage', scope, { tx });
    if (triage.allow) return null;
  }
  return 'ineligible_actor';
}

export async function validateResponsibilityDefault(
  tx: Tx,
  checkService: CheckService,
  workspaceId: string,
  managedSystemId: string | undefined,
  kind: 'owner' | 'reviewer',
  actorId: string | null | undefined,
  teamId: string | null | undefined,
): Promise<void> {
  const category = await responsibilityTargetFailure(
    tx,
    checkService,
    workspaceId,
    managedSystemId,
    kind,
    actorId,
    teamId,
  );
  if (!category || category === 'missing') return;
  const actorKey = `default_${kind}_actor_id`;
  const teamKey = `default_${kind}_team_id`;
  throw new HttpError(
    'validation.failed',
    category === 'invalid_pair'
      ? `${actorKey} and ${teamKey} are mutually exclusive`
      : 'invalid responsibility default',
    {
      fields:
        category === 'invalid_pair'
          ? [
              { path: [actorKey], code: 'mutually_exclusive' },
              { path: [teamKey], code: 'mutually_exclusive' },
            ]
          : [{ path: [teamId ? teamKey : actorKey], code: category }],
    },
  );
}
