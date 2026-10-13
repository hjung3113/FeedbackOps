import type { EntityLinkEntityType, EntityLinkRelationType } from '@fops/shared';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import {
  type EntityLinkRow,
  type ReleasedTaskVocLink,
  detachEntityLink as detachEntityLinkRepo,
  insertActiveEntityLink,
  selectActiveEntityLink as selectActiveEntityLinkRepo,
  selectActiveLinksForEndpoint as selectActiveLinksForEndpointRepo,
  selectActiveLinksForEndpoints as selectActiveLinksForEndpointsRepo,
  selectEligibleVocLinksForReleasedTask as selectEligibleVocLinksForReleasedTaskRepo,
} from './repo.js';

/**
 * Application seam for cross-module Entity Link commands (#391). Entity Links
 * owns `core.entity_links`; other modules call these functions instead of
 * importing ./repo.js directly. Signatures mirror the repo functions so call
 * sites change only their import.
 */

export type { EntityLinkRow, LinkEndpointRow, ReleasedTaskVocLink } from './repo.js';

export async function createEntityLink(
  tx: Tx,
  input: {
    workspaceId: string;
    sourceType: EntityLinkEntityType;
    sourceId: string;
    targetType: EntityLinkEntityType;
    targetId: string;
    relationType: EntityLinkRelationType;
    managedSystemId: string;
    createdBy: string;
    visibility: 'internal_only' | 'summary_visible';
    internalWritePath?: 'task_request_conversion';
  },
): Promise<{ row: EntityLinkRow; inserted: boolean }> {
  return insertActiveEntityLink(tx, input);
}

export async function findActiveEntityLink(
  db: Db | Tx,
  input: {
    workspaceId: string;
    sourceType: EntityLinkEntityType;
    sourceId: string;
    targetType: EntityLinkEntityType;
    targetId: string;
    relationType: EntityLinkRelationType;
  },
): Promise<EntityLinkRow | null> {
  return selectActiveEntityLinkRepo(db, input);
}

export async function selectActiveLinksForEndpoint(
  db: Db | Tx,
  input: {
    workspaceId: string;
    endpointType: EntityLinkEntityType;
    endpointId: string;
    side?: 'source' | 'target';
  },
): Promise<EntityLinkRow[]> {
  return selectActiveLinksForEndpointRepo(db, input);
}

export async function selectActiveLinksForEndpoints(
  db: Db | Tx,
  input: {
    workspaceId: string;
    endpointType: EntityLinkEntityType;
    endpointIds: string[];
    side: 'target';
  },
): Promise<EntityLinkRow[]> {
  return selectActiveLinksForEndpointsRepo(db, input);
}

export async function selectEligibleVocLinksForReleasedTask(
  db: Db | Tx,
  input: { workspaceId: string; taskId: string },
): Promise<ReleasedTaskVocLink[]> {
  return selectEligibleVocLinksForReleasedTaskRepo(db, input);
}

export async function detachEntityLink(
  tx: Tx,
  input: {
    workspaceId: string;
    linkId: string;
    actorId: string;
    reason: string;
  },
): Promise<EntityLinkRow | null> {
  return detachEntityLinkRepo(tx, input);
}

/** Survey caller has authorized the source and target; never return opaque endpoints. */
export async function createSurveyFindingLink(
  tx: Tx,
  input: {
    workspaceId: string;
    responseId: string;
    findingId: string;
    relationType: 'generated_finding' | 'evidence_of';
    managedSystemId: string;
    createdBy: string;
  },
): Promise<{ id: string; inserted: boolean }> {
  const result = await tx.execute<{ id: string; inserted: boolean }>(sql`
    SELECT * FROM core.create_survey_finding_link(
      ${input.workspaceId}::uuid, ${input.responseId}::uuid, ${input.findingId}::uuid,
      ${input.relationType}::text, ${input.managedSystemId}::uuid, ${input.createdBy}::uuid)
  `);
  const row = result.rows[0];
  if (!row) throw new Error('Survey link command did not return a local ID');
  return row;
}

/** Transactional dependency fanout for recovery truth, never a disclosure reader. */
export async function readRecoveryDependencies(
  tx: Tx,
  workspaceId: string,
  subjects: Array<{ type: string; id: string }>,
): Promise<
  Array<{ type: 'voc' | 'finding' | 'task' | 'permission_request' | 'survey'; id: string }>
> {
  if (subjects.length === 0) return [];
  const seeds = sql.join(
    subjects.map((s) => sql`(${s.type}::text,${s.id}::uuid,0)`),
    sql`, `,
  );
  const rows = await tx.execute<{ type: 'voc' | 'finding' | 'task'; id: string }>(sql`
    WITH RECURSIVE affected(type,id,depth) AS (
      VALUES ${seeds}
      UNION
      SELECT CASE WHEN link.source_type=a.type AND link.source_id=a.id THEN link.target_type ELSE link.source_type END,
        CASE WHEN link.source_type=a.type AND link.source_id=a.id THEN link.target_id ELSE link.source_id END,a.depth+1
      FROM affected a JOIN core.entity_links_app link ON link.workspace_id=${workspaceId}::uuid
        AND link.status='active' AND link.relation_type IN ('evidence_of','created_finding','requested_task','converted_to')
        AND ((link.source_type=a.type AND link.source_id=a.id) OR (link.target_type=a.type AND link.target_id=a.id))
      WHERE a.depth < 3
    ) SELECT DISTINCT type,id FROM affected WHERE type IN ('voc','finding','task') ORDER BY type,id`);
  return rows.rows;
}
