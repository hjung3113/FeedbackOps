import { sql } from "drizzle-orm";

import type { Db } from "../../../db/client.js";
import type { Tx } from "../../../db/tx.js";

export interface PublicUpdateReviewCandidateInsert {
  workspace_id: string;
  voc_id: string;
  source_task_id: string;
  source_entity_link_id: string;
  release_event_id: string;
  correlation_id: string;
  triggered_by_actor_id: string;
}

export interface InsertedPublicUpdateReviewCandidate extends PublicUpdateReviewCandidateInsert {
  id: string;
}

/**
 * Insert one immutable release obligation. The event unique key makes a job
 * retry safe forever; the partial pending unique index rejects a new release
 * while an older review is still unresolved.
 */
export async function insertPublicUpdateReviewCandidate(
  tx: Tx,
  input: PublicUpdateReviewCandidateInsert,
): Promise<InsertedPublicUpdateReviewCandidate | null> {
  const result = await (tx as Db).execute<Record<string, unknown>>(sql`
    INSERT INTO voc.public_update_review_candidates (
      workspace_id, voc_id, source_task_id, source_entity_link_id,
      release_event_id, correlation_id, triggered_by_actor_id
    ) VALUES (
      ${input.workspace_id}, ${input.voc_id}, ${input.source_task_id}, ${input.source_entity_link_id},
      ${input.release_event_id}, ${input.correlation_id}, ${input.triggered_by_actor_id}
    )
    ON CONFLICT DO NOTHING
    RETURNING id, workspace_id, voc_id, source_task_id, source_entity_link_id,
      release_event_id, correlation_id, triggered_by_actor_id
  `);
  const row = result.rows[0];
  return row
    ? {
        id: row.id as string,
        workspace_id: row.workspace_id as string,
        voc_id: row.voc_id as string,
        source_task_id: row.source_task_id as string,
        source_entity_link_id: row.source_entity_link_id as string,
        release_event_id: row.release_event_id as string,
        correlation_id: row.correlation_id as string,
        triggered_by_actor_id: row.triggered_by_actor_id as string,
      }
    : null;
}
