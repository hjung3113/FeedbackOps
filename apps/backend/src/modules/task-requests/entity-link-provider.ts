import type { EntityLinkTargetSummary } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { EntityLinkProvider } from '../entity-links/provider-types.js';
import { checkFindingManage, checkFindingRead } from '../findings/authorization.js';
import { type TaskRequestRow, findTaskRequestById } from './repo.js';

function taskRequestToInternalSummary(row: TaskRequestRow): EntityLinkTargetSummary {
  return {
    type: 'task_request',
    id: row.id,
    display_id: row.display_id,
    source_type: row.source_type,
    source_id: row.source_id,
    evidence_summary: row.evidence_summary,
    requested_outcome: row.requested_outcome,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    requester_actor_id: row.requester_actor_id,
  };
}

async function resolveTaskRequest(db: Db, workspaceId: string, id: string) {
  const request = await findTaskRequestById(db, { workspaceId, taskRequestId: id });
  if (!request) return null;
  return {
    workspace_id: request.workspace_id,
    managed_system_id: request.primary_managed_system_id,
    reporter_id: null,
  };
}

export const taskRequestEntityLinkProvider: EntityLinkProvider = {
  entityType: 'task_request',
  assertExists: resolveTaskRequest,
  getPermissionSubject: resolveTaskRequest,
  canRead: async (deps, actor, subject) => {
    const decision = await checkFindingRead(deps.checkService, actor, subject.managed_system_id, {
      requireElevatedRole: false,
    });
    return decision.allow;
  },
  canCreateTarget: async (deps, actor, subject) => {
    const decision = await checkFindingManage(deps.checkService, actor, subject.managed_system_id, {
      requireElevatedRole: false,
    });
    return decision.allow;
  },
  getReporterSummary: async () => ({ available: false }),
  getInternalSummary: async (db, workspaceId, id) => {
    const request = await findTaskRequestById(db, { workspaceId, taskRequestId: id });
    return request ? taskRequestToInternalSummary(request) : null;
  },
  listExpectedLinks: async () => [],
};
