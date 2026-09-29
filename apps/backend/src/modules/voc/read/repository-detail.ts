// VOC single-row, pinned-row, and permission-decision seed queries.
import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { vocPermissionDecisionsSeedFixture, vocs } from '../../../db/schema/voc.js';
import { sqlUuidArray } from '../../../db/sql-arrays.js';
import type { Tx } from '../../../db/tx.js';
import type { Scope } from '../authorization.js';
import { mapVocRow, type VocReadRow } from './repository-shared.js';

// ── selectVocByIdForRead ─────────────────────────────────────────────────────

export async function selectVocByIdForRead(
  db: Db | Tx,
  workspaceId: string,
  vocId: string,
): Promise<VocReadRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, display_id, title, workspace_id, primary_managed_system_id,
      analytics_area_id, reporter_id, owner_user_id, owner_team_id,
      severity, reporter_facing_status, triage_state,
      triage_state_review_postponed_at, source_context,
      description_rich_content,
      created_at, updated_at
    FROM ${vocs}
    WHERE id = ${vocId}
      AND workspace_id = ${workspaceId}
      AND archived_at IS NULL
  `);
  const row = result.rows[0];
  if (!row) return null;
  return mapVocRow(row);
}

// ── selectPinnedVocListRow ───────────────────────────────────────────────────

/**
 * Fetch ONE VOC in the list-row projection, bypassing the view/tab predicate
 * but NOT the scope predicate.
 *
 * WHY: the triage console's queue predicate pins `triage_state IN
 * ('untriaged','needs_more_information')` (see buildVocListPredicate), so a VOC
 * that has already been triaged can never appear in it — including the one the
 * VOC detail panel's "트리아지에서 변경" deep link points at (#383). This helper
 * is the ONLY path that re-triage deep links use to put that row back in the
 * queue.
 *
 * The scope contract is unchanged: workspace + `scopeFilter` are applied here
 * exactly as buildVocListPredicate applies them, and archived rows stay out.
 * A row outside the caller's scope returns null so the caller can drop it
 * silently — never 403/404, which would turn this into an existence probe.
 */
export async function selectPinnedVocListRow(
  db: Db | Tx,
  args: { workspaceId: string; scopeFilter: Scope; vocId: string },
): Promise<VocReadRow | null> {
  const { workspaceId, scopeFilter, vocId } = args;
  if (scopeFilter.kind === 'scoped' && scopeFilter.managedSystemIds.length === 0) return null;

  const wheres: ReturnType<typeof sql>[] = [
    sql`id = ${vocId}`,
    sql`workspace_id = ${workspaceId}`,
    sql`archived_at IS NULL`,
  ];
  if (scopeFilter.kind === 'scoped') {
    wheres.push(
      sql`primary_managed_system_id = ANY(${sqlUuidArray(scopeFilter.managedSystemIds)})`,
    );
  }

  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, display_id, title, workspace_id, primary_managed_system_id,
      analytics_area_id, reporter_id, owner_user_id, owner_team_id,
      severity, reporter_facing_status, triage_state,
      triage_state_review_postponed_at, source_context,
      NULL::jsonb as description_rich_content,
      created_at, updated_at
    FROM ${vocs}
    WHERE ${sql.join(wheres, sql` AND `)}
  `);
  const row = result.rows[0];
  if (!row) return null;
  return mapVocRow(row);
}
// ── selectPermissionDecisionsSeed ─────────────────────────────────────────────

export async function selectPermissionDecisionsSeed(
  db: Db | Tx,
  workspaceId: string,
  vocId: string,
): Promise<unknown | null> {
  // WHY (M2): JOIN to voc.vocs enforces workspace_id + archived_at as
  // defense-in-depth even though the service validated the VOC first.
  const result = await (db as Db).execute<{ envelope: unknown }>(sql`
    SELECT f.envelope
    FROM ${vocPermissionDecisionsSeedFixture} f
    JOIN ${vocs} v ON v.id = f.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
    WHERE f.voc_id = ${vocId}
  `);
  return result.rows[0]?.envelope ?? null;
}
