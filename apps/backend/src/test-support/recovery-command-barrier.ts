import type { DbHandle } from '../db/client.js';

/** Inspect advisory waiters through pg_locks; migrate cannot inspect app activity. */
export async function waitForRecoveryCommandWaiters(
  operator: DbHandle,
  workspaceId: string,
  count: number,
  request: Promise<{ statusCode: number }>,
): Promise<void> {
  const deadline = Date.now() + 1500;
  const completed = request.then((response): never => {
    throw new Error(`Request completed with ${response.statusCode} before recovery barrier`);
  });
  while (Date.now() < deadline) {
    const query = {
      text: `SELECT count(*)::text AS count FROM pg_locks
        WHERE locktype='advisory' AND NOT granted AND objsubid=1
          AND classid=((hashtextextended('recovery-command:' || $1,0)>>32)&4294967295)::oid
          AND objid=(hashtextextended('recovery-command:' || $1,0)&4294967295)::oid`,
      values: [workspaceId],
      query_timeout: 500,
    };
    const result = await Promise.race([completed, operator.pool.query<{ count: string }>(query)]);
    if (Number(result.rows[0]?.count) === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${count} queued workspace recovery commands`);
}
