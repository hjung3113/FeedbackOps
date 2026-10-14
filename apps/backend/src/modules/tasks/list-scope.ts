import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { checkFindingManage, hasElevatedFindingRole } from '../findings/authorization.js';
import { type CheckService, memoizeCapabilityChecks } from '../permissions/check-service.js';
import type { Scope, ScopeActorContext } from '../permissions/scope-service.js';
import { listPrimaryManagedSystemIds } from './repo.js';

/** Same role and point decisions as the owning list, including archived systems. */
export async function actorTaskListScope(
  db: Db,
  checkService: CheckService,
  actor: ScopeActorContext,
  managedSystemId?: string,
  candidates?: string[],
): Promise<Scope> {
  if (!hasElevatedFindingRole(actor))
    throw new HttpError('permission.denied', 'finding.manage capability required');
  if (actor.role_level === 'admin') return { kind: 'all' };
  const check = memoizeCapabilityChecks(checkService);
  const systems =
    candidates ??
    (await listPrimaryManagedSystemIds(db, {
      workspaceId: actor.workspace_id,
      ...(managedSystemId === undefined ? {} : { managedSystemId }),
    }));
  const allowed: string[] = [];
  for (const id of systems)
    if ((await checkFindingManage(check, actor, id, { requireElevatedRole: true })).allow)
      allowed.push(id);
  return { kind: 'scoped', managedSystemIds: allowed };
}
