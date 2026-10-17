import { type SQL, sql } from 'drizzle-orm';
import { entityLinksApp } from '../../db/schema/core.js';
import { vocClusterMembers } from '../../db/schema/voc-cluster.js';

/** Canonical #513 presence roots; deliberately independent of status/read authority. */
export function vocFollowUpRootsSql(workspaceId: string, vocId: SQL | string): SQL {
  // Keep each branch correlated by VOC id; an OR across source types loses
  // that equijoin in list/count anti-existence plans.
  return sql`SELECT el.* FROM (
    SELECT el.* FROM ${entityLinksApp} el
    WHERE el.workspace_id = ${workspaceId} AND el.status = 'active'
      AND el.source_type = 'voc' AND el.source_id = ${vocId}
      AND el.target_type IN ('finding', 'task', 'task_request')
    UNION ALL
    SELECT el.* FROM ${vocClusterMembers} vcm
      JOIN ${entityLinksApp} el ON el.source_id = vcm.cluster_id
    WHERE vcm.voc_id = ${vocId}
      AND el.workspace_id = ${workspaceId} AND el.status = 'active'
      AND el.source_type = 'voc_cluster' AND el.target_type IN ('finding', 'task_request')
    ) el`;
}
