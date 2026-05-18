// apps/backend/src/modules/core/managed-systems/read-projections.ts
//
// Cross-module read projection for managed systems.
// Approved for import by other modules (e.g. voc/repo-read.ts) per AGENTS.md
// "Read models may compose approved projections" rule.
//
// WHY: voc/repo-read.ts needs the list of MS ids in a workspace to compute
// out_of_scope_summary. Reading core.managed_systems from inside the voc repo
// is an unapproved cross-module read (M7 cycle-1 review finding). This module
// is the approved boundary surface for that read.

import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { managedSystems } from '../../../db/schema/core.js';

/**
 * Returns all non-archived managed system ids for a workspace.
 * Used by voc/repo-read.ts to compute out_of_scope_summary diff.
 */
export async function allManagedSystemIds(
  db: Db | Tx,
  workspaceId: string,
): Promise<string[]> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(
      sql`${managedSystems.workspaceId} = ${workspaceId} AND ${managedSystems.archivedAt} IS NULL`,
    );
  return rows.map((r) => r.id);
}
