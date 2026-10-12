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
      text: `select count(*)::text as count from pg_locks
       where locktype='advisory' and not granted and objsubid=1
         and classid=((hashtextextended($1,0)>>32)&4294967295)::oid
         and objid=(hashtextextended($1,0)&4294967295)::oid`,
      values: [responseId],
      query_timeout: 500,
    };
    const result = await Promise.race([completed, operator.pool.query<{ count: string }>(query)]);
    if (Number(result.rows[0]?.count) === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Expected ${count} queued response evidence locks`);
}
