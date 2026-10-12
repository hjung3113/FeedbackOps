import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auditLog } from '../../../db/schema/core.js';
import type { Tx } from '../../../db/tx.js';

/** Caller owns request authorization; Core exposes only the allowed question metadata. */
export async function latestPermissionRequestQuestion(
  tx: Tx,
  workspaceId: string,
  requestId: string,
): Promise<{ note: string; created_at: string } | null> {
  const rows = await tx
    .select({ detail: auditLog.detail, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.workspaceId, workspaceId),
        eq(auditLog.subjectType, 'permission_request'),
        eq(auditLog.subjectId, requestId),
        eq(auditLog.eventType, 'permission_needs_more_info'),
      ),
    )
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const detail = z.object({ note: z.string().min(1) }).parse(row.detail);
  return { note: detail.note, created_at: row.createdAt.toISOString() };
}
