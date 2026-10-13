import { sql } from 'drizzle-orm';
import type { Tx } from './tx.js';

/** First lock of recovery writers; transaction-scoped and never acquired by readers. */
export async function lockRecoveryCommand(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`recovery-command:${workspaceId}`}::text,0))`,
  );
}

/**
 * Nested recorder seams: the owning command must already hold the workspace lock (taken first, before any
 * row or idempotency lock). Tests fail fast on a late acquisition so a missed entry point cannot ship a lock
 * cycle; production still acquires it.
 */
export async function requireRecoveryCommandLock(tx: Tx, workspaceId: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    const held = await tx.execute<{ held: boolean }>(sql`
      WITH k AS (SELECT hashtextextended(${`recovery-command:${workspaceId}`}::text,0) AS key)
      SELECT EXISTS (SELECT 1 FROM pg_locks l, k WHERE l.locktype='advisory' AND l.granted
        AND l.pid=pg_backend_pid() AND l.objsubid=1
        AND l.classid=((k.key>>32)&4294967295)::oid AND l.objid=(k.key&4294967295)::oid) AS held`);
    if (!held.rows[0]?.held)
      throw new Error(
        'recovery writer reached the recorder without taking lockRecoveryCommand first',
      );
  }
  await lockRecoveryCommand(tx, workspaceId);
}
