import type { DbHandle } from '../db/client.js';

/** Observe the actual transaction queue, without timing assumptions or raw answer reads. */
export async function waitForResponseEvidenceWaiters(
  operator: DbHandle,
  responseId: string,
  count: number,
  request: Promise<{ statusCode: number }>,
): Promise<void> {
  // Both queue barriers must fail before Vitest's 5s test timeout, so finally
  // can release the blocker and drain requests before fixture teardown starts.
  const deadline = Date.now() + 1500;
  const completed = request.then((response): never => {
    throw new Error(`Request completed with ${response.statusCode} before evidence lock barrier`);
  });
  while (Date.now() < deadline) {
    // pg supports a per-query timeout; its QueryConfig typings omit this option.
    const query = {
      // A recovery writer can queue behind the workspace lock held by the
      // response waiter. Multi-command barriers count that real blocking chain;
      // single-waiter assertions still pin the direct response queue.
      text: `WITH RECURSIVE evidence_waiters(pid) AS (
        SELECT pid FROM pg_locks
         WHERE locktype='advisory' AND NOT granted AND objsubid=1
           AND classid=((hashtextextended($1,0)>>32)&4294967295)::oid
           AND objid=(hashtextextended($1,0)&4294967295)::oid
        UNION
        SELECT w.pid FROM pg_locks w JOIN evidence_waiters r
          ON r.pid=ANY(pg_blocking_pids(w.pid)) WHERE NOT w.granted AND $2::int>1
      ) SELECT count(*)::text AS count FROM evidence_waiters`,
      values: [responseId, count],
      query_timeout: 500,
    };
    const result = await Promise.race([completed, operator.pool.query<{ count: string }>(query)]);
    if (Number(result.rows[0]?.count) === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${count} queued response evidence locks`);
}
