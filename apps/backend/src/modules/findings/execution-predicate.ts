import { type SQL, sql } from 'drizzle-orm';

/** Active canonical execution link for the Finding row aliased as f. */
export function findingExecutionPredicate(): SQL {
  return sql`EXISTS (
    SELECT 1 FROM core.entity_links_app el
    WHERE el.workspace_id = f.workspace_id
      AND el.status = 'active' AND el.source_type = 'finding' AND el.source_id = f.id
      AND el.target_type IN ('task_request', 'task') AND el.relation_type = 'requested_task'
  )`;
}
