import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../../db/tx.js';

/** Caller owns request authorization; Core exposes only the allowed question metadata. */
export async function latestPermissionRequestQuestion(
  tx: Tx,
  workspaceId: string,
  requestId: string,
): Promise<{ note: string; created_at: string } | null> {
  const result = await tx.execute<{ note: string; created_at: Date }>(sql`
    SELECT * FROM core.latest_permission_request_question(${workspaceId}::uuid, ${requestId}::uuid)
  `);
  const row = result.rows[0];
  if (!row) return null;
  const note = z.string().min(1).parse(row.note);
  return { note, created_at: new Date(row.created_at).toISOString() };
}
