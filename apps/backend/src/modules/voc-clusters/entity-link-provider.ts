import type { EntityLinkTargetSummary } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { EntityLinkProvider } from '../entity-links/provider-types.js';
import { checkFindingManage, checkFindingRead } from '../findings/authorization.js';
import { type VocClusterRow, findVocClusterById } from './repo.js';

function clusterToInternalSummary(row: VocClusterRow): EntityLinkTargetSummary {
  return {
    type: 'voc_cluster',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
  };
}

async function resolveVocCluster(db: Db, workspaceId: string, id: string) {
  const cluster = await findVocClusterById(db, { workspaceId, clusterId: id });
  if (!cluster) return null;
  return {
    workspace_id: cluster.workspace_id,
    managed_system_id: cluster.primary_managed_system_id,
    reporter_id: null,
  };
}

export const vocClusterEntityLinkProvider: EntityLinkProvider = {
  entityType: 'voc_cluster',
  assertExists: resolveVocCluster,
  getPermissionSubject: resolveVocCluster,
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
    const cluster = await findVocClusterById(db, { workspaceId, clusterId: id });
    return cluster ? clusterToInternalSummary(cluster) : null;
  },
  listExpectedLinks: async () => [],
};
