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
