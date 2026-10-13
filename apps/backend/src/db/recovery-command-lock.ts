import { sql } from 'drizzle-orm';
import type { Tx } from './tx.js';

/** First lock of recovery writers; transaction-scoped and never acquired by readers. */
export async function lockRecoveryCommand(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`recovery-command:${workspaceId}`}::text,0))`,
  );
}
