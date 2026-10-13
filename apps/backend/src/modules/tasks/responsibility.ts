import type { ResponsibilityDefaultFailure } from '@fops/shared';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { lockAnalyticsArea } from '../analytics-areas/index.js';
import { lockWorkspaceActor } from '../auth/index.js';
import { readResponsibilityTeam } from '../core/read-projections.js';
import { checkFindingManage } from '../findings/authorization.js';
import { lockManagedSystem, recordResponsibilityDefaultFailure } from '../managed-systems/index.js';
import type { CheckService } from '../permissions/index.js';

type Category = ResponsibilityDefaultFailure['category'];
type Rule = ResponsibilityDefaultFailure['rule'];

/** Task owns both destinations, including current finding.manage eligibility. */
type Workflow = 'task_request' | 'task';
type Resolution<W extends Workflow> = {
  actorId: string | null;
  teamId: string | null;
  default_resolved: boolean;
  managed_system_id: string;
  source_rule:
    | 'explicit'
    | 'explicit_null'
    | 'managed_system_owner'
    | 'analytics_area_owner'
    | 'workspace_fallback_queue'
    | (W extends 'task_request' ? 'managed_system_reviewer' : never);
};
export async function resolveTaskResponsibility<W extends Workflow>(args: {
  tx: Tx;
  checkService: CheckService;
  workspaceId: string;
  managedSystemId: string;
  workflow: W;
  analyticsAreaId?: string | null;
  actorId?: string | null;
  teamId?: string | null;
}): Promise<Resolution<W>> {
  const { tx, workspaceId, managedSystemId } = args;
  const actorKey =
    args.workflow === 'task_request' ? 'assigned_reviewer_actor_id' : 'assignee_actor_id';
  const teamKey =
    args.workflow === 'task_request' ? 'assigned_reviewer_team_id' : 'assignee_team_id';
  async function failure(actorId: string | null, teamId: string | null): Promise<Category | null> {
    if (actorId && teamId) return 'invalid_pair';
    if (teamId) {
      const team = await readResponsibilityTeam(tx, workspaceId, teamId);
      return !team ? 'foreign_workspace' : team.archived_at ? 'archived_team' : null;
    }
    if (!actorId) return 'missing';
    const candidate = await lockWorkspaceActor(tx, { workspaceId, actorId });
    if (!candidate) return 'foreign_workspace';
    // An Actor is an authenticated internal person (CONTEXT.md); the seeded
    // `system` identity carries role_level=admin but cannot hold Task
    // responsibility, so reject it before the capability check that would
    // accept any Admin (mirrors Core's responsibility-target rule).
    if (candidate.actor_type !== 'internal_member') return 'ineligible_actor';
    const allowed = await checkFindingManage(
      args.checkService,
      {
        actor_id: candidate.id,
        workspace_id: workspaceId,
        role_level: candidate.role_level,
      },
      managedSystemId,
      { requireElevatedRole: true },
      { tx },
    );
    return allowed.allow ? null : 'ineligible_actor';
  }
  function result(
    actorId: string | null,
    teamId: string | null,
    source_rule: Rule | 'explicit' | 'explicit_null' | 'workspace_fallback_queue',
    default_resolved: boolean,
  ) {
    return {
      actorId,
      teamId,
      default_resolved,
      source_rule,
      managed_system_id: managedSystemId,
    } as Resolution<W>;
  }
  if (args.actorId !== undefined || args.teamId !== undefined) {
    const actorId = args.actorId ?? null;
    const teamId = args.teamId ?? null;
    const category = await failure(actorId, teamId);
    if (category && category !== 'missing')
      throw new HttpError('validation.failed', 'invalid responsibility', {
        fields:
          category === 'invalid_pair'
            ? [
                { path: [actorKey], code: 'mutually_exclusive' },
                { path: [teamKey], code: 'mutually_exclusive' },
              ]
            : [{ path: [teamId ? teamKey : actorKey], code: category }],
      });
    return result(actorId, teamId, actorId || teamId ? 'explicit' : 'explicit_null', false);
  }
  const system = await lockManagedSystem(tx, workspaceId, managedSystemId);
  if (!system) throw new HttpError('not_found.record', 'managed_system not found');
  const candidates: Array<{ rule: Rule; actorId: string | null; teamId: string | null }> = [];
  if (args.workflow === 'task_request')
    candidates.push({
      rule: 'managed_system_reviewer',
      actorId: system.default_reviewer_actor_id,
      teamId: system.default_reviewer_team_id,
    });
  candidates.push({
    rule: 'managed_system_owner',
    actorId: system.default_owner_actor_id,
    teamId: system.default_owner_team_id,
  });
  for (const candidate of candidates) {
    const category = await failure(candidate.actorId, candidate.teamId);
    if (!category) return result(candidate.actorId, candidate.teamId, candidate.rule, true);
    await recordResponsibilityDefaultFailure(tx, {
      workspace_id: workspaceId,
      managed_system_id: managedSystemId,
      workflow: args.workflow,
      responsibility: args.workflow === 'task_request' ? 'reviewer' : 'owner',
      rule: candidate.rule,
      category,
    });
  }
  const area = args.analyticsAreaId
    ? await lockAnalyticsArea(tx, workspaceId, args.analyticsAreaId)
    : null;
  const teamId =
    area?.managed_system_id === managedSystemId && area.archived_at === null
      ? area.owner_team_id
      : null;
  const category = await failure(null, teamId);
  if (!category) return result(null, teamId, 'analytics_area_owner', true);
  await recordResponsibilityDefaultFailure(tx, {
    workspace_id: workspaceId,
    managed_system_id: managedSystemId,
    workflow: args.workflow,
    responsibility: args.workflow === 'task_request' ? 'reviewer' : 'owner',
    rule: 'analytics_area_owner',
    category,
  });
  return result(null, null, 'workspace_fallback_queue', false);
}
