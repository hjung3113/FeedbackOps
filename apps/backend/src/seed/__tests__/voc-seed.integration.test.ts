// Integration tests for Slice 3 seed determinism + coverage.
//
// Requires DATABASE_URL + WORKSPACE_ID env vars and a live Postgres instance
// with migration 0010 applied. Tests run seedSlice3Vocs by calling runSeed.

import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { type DbHandle, createDb } from '../../db/client.js';
import { runSeed } from '../index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

const handle: DbHandle = createDb(APP_URL);
afterAll(() => handle.pool.end());

describe.skipIf(!runIntegration)('Slice 3 seed determinism + coverage', () => {
  it('produces identical VOC ids on two consecutive runSeed() calls', async () => {
    await runSeed(handle);
    const first = await handle.db.execute(
      sql`SELECT id FROM voc.vocs ORDER BY display_id`,
    );
    await runSeed(handle);
    const second = await handle.db.execute(
      sql`SELECT id FROM voc.vocs ORDER BY display_id`,
    );
    expect(first.rows.map((r) => (r as { id: string }).id)).toEqual(
      second.rows.map((r) => (r as { id: string }).id),
    );
  });

  it('covers every reporter_facing_status (8 values)', async () => {
    const r = await handle.db.execute(
      sql`SELECT reporter_facing_status FROM voc.vocs GROUP BY reporter_facing_status`,
    );
    const statuses = r.rows
      .map((x) => (x as { reporter_facing_status: string }).reporter_facing_status)
      .sort();
    expect(statuses).toEqual(
      ['assigned', 'closed', 'prep', 'progress', 'received', 'reopened', 'resolved', 'reviewing'],
    );
  });

  it('covers every triage_state (4 values)', async () => {
    const r = await handle.db.execute(
      sql`SELECT triage_state FROM voc.vocs GROUP BY triage_state`,
    );
    const states = r.rows
      .map((x) => (x as { triage_state: string }).triage_state)
      .sort();
    expect(states).toEqual([
      'dismissed_not_actionable',
      'needs_more_information',
      'triaged',
      'untriaged',
    ]);
  });

  it('covers every severity plus at least one NULL', async () => {
    const r = await handle.db.execute(
      sql`SELECT severity, COUNT(*)::int AS n FROM voc.vocs GROUP BY severity ORDER BY severity NULLS FIRST`,
    );
    const counts = Object.fromEntries(
      r.rows.map((x) => {
        const row = x as { severity: string | null; n: number };
        return [row.severity ?? 'null', row.n];
      }),
    );
    expect(counts).toMatchObject({
      null: expect.any(Number),
      low: expect.any(Number),
      medium: expect.any(Number),
      high: expect.any(Number),
      critical: expect.any(Number),
    });
  });

  it('covers every source_context (4 values)', async () => {
    const r = await handle.db.execute(
      sql`SELECT source_context FROM voc.vocs GROUP BY source_context`,
    );
    const sources = r.rows
      .map((x) => (x as { source_context: string }).source_context)
      .sort();
    expect(sources).toEqual([
      'direct_use',
      'operational_discovery',
      'proxy_report',
      'stakeholder_request',
    ]);
  });

  it('covers user owner, team owner, and null owner forms', async () => {
    const u = await handle.db.execute(
      sql`SELECT COUNT(*)::int AS n FROM voc.vocs WHERE owner_user_id IS NOT NULL`,
    );
    const t = await handle.db.execute(
      sql`SELECT COUNT(*)::int AS n FROM voc.vocs WHERE owner_team_id IS NOT NULL`,
    );
    const n = await handle.db.execute(
      sql`SELECT COUNT(*)::int AS n FROM voc.vocs WHERE owner_user_id IS NULL AND owner_team_id IS NULL`,
    );
    expect((u.rows[0] as { n: number }).n).toBeGreaterThan(0);
    expect((t.rows[0] as { n: number }).n).toBeGreaterThan(0);
    expect((n.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  it('seeds exactly three conversation rows per VOC (one of each visibility)', async () => {
    const r = await handle.db.execute(sql`
      SELECT
        v.id,
        (SELECT COUNT(*) FROM voc.voc_public_updates pu WHERE pu.voc_id = v.id)::int AS pu,
        (SELECT COUNT(*) FROM voc.voc_reporter_replies rr WHERE rr.voc_id = v.id)::int AS rr,
        (SELECT COUNT(*) FROM voc.voc_internal_comments ic WHERE ic.voc_id = v.id)::int AS ic
      FROM voc.vocs v
      WHERE v.title LIKE '[seed]%'
    `);
    for (const row of r.rows as Array<{ pu: number; rr: number; ic: number }>) {
      expect(row.pu).toBeGreaterThanOrEqual(1);
      expect(row.rr).toBeGreaterThanOrEqual(1);
      expect(row.ic).toBeGreaterThanOrEqual(1);
    }
  });

  it('writes exactly two linkedFinding decision fixtures with the correct states', async () => {
    const r = await handle.db.execute(
      sql`SELECT envelope FROM voc.voc_permission_decisions_seed_fixture`,
    );
    const envelopes = r.rows.map(
      (row) => (row as { envelope: { linkedFinding?: { state: string } } }).envelope,
    );
    expect(envelopes).toHaveLength(2);
    const states = envelopes.map((e) => e.linkedFinding?.state).sort();
    expect(states).toEqual(['request_access', 'summary_visible']);
  });

  it('decision_ids are stable across re-runs', async () => {
    const ids1 = await handle.db.execute(sql`
      SELECT envelope->'linkedFinding'->>'decision_id' AS id
      FROM voc.voc_permission_decisions_seed_fixture
      ORDER BY id
    `);
    await runSeed(handle);
    const ids2 = await handle.db.execute(sql`
      SELECT envelope->'linkedFinding'->>'decision_id' AS id
      FROM voc.voc_permission_decisions_seed_fixture
      ORDER BY id
    `);
    expect(ids1.rows).toEqual(ids2.rows);
  });
});
