import { type SQL, sql } from 'drizzle-orm';
import { entityLinksApp } from '../../db/schema/core.js';
import { vocClusterMembers } from '../../db/schema/voc-cluster.js';

/** Canonical #513 presence roots; deliberately independent of status/read authority. */
export function vocFollowUpRootsSql(workspaceId: string, vocId: SQL | string): SQL {
  return sql`SELECT el.* FROM ${entityLinksApp} el
    WHERE el.workspace_id = ${workspaceId} AND el.status = 'active'
      AND (
        (el.source_type = 'voc' AND el.source_id = ${vocId}
          AND el.target_type IN ('finding', 'task', 'task_request'))
        OR (el.source_type = 'voc_cluster' AND el.target_type IN ('finding', 'task_request')
          AND EXISTS (SELECT 1 FROM ${vocClusterMembers} vcm
            WHERE vcm.voc_id = ${vocId} AND vcm.cluster_id = el.source_id))
      )`;
}
