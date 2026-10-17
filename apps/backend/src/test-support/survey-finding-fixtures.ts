import type pg from 'pg';
import type { DbHandle } from '../db/client.js';

/** Migrate-only fixture: public Survey parent and private binding commit together. */
export async function insertSurveyFindingFixture<T extends pg.QueryResultRow & { id: string }>(
  handle: DbHandle,
  responseId: string,
  statement: string,
  values: unknown[],
): Promise<pg.QueryResult<T>> {
  const client = await handle.pool.connect();
  try {
    await client.query('begin');
    const result = await client.query<T>(statement, values);
    const findingId = result.rows[0]?.id;
    if (!findingId) throw new Error('Survey Finding fixture returned no id');
    await client.query(
      `insert into survey.finding_response_bindings
        (workspace_id,finding_id,response_id,historical_generated_title,historical_generated_summary)
       select workspace_id,id,$2,title,summary from finding.findings where id=$1`,
      [findingId, responseId],
    );
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
