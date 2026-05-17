// Integration test for the Slice 1 seed.
//
// Requires Postgres up + Slice 1 migration applied. The previous seed run via
// `pnpm db:seed` already populated the baseline rows; this suite asserts that
// invoking runSeed() again inserts zero new rows.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runSeed } from '../../seed/index.js';
import { type DbHandle, createDb } from '../client.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('seed idempotency', () => {
  let handle: DbHandle;

  beforeAll(() => {
    handle = createDb(APP_URL);
  });
  afterAll(async () => {
    await handle?.close();
  });

  it('second runSeed() invocation inserts zero Slice 1/2 rows; Slice 3 always delete-and-recreates', async () => {
    // Pre-condition: the workspace + three baseline actors are present from
    // the `pnpm db:seed` run that happens before integration tests.
    const before = await handle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.actors where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(Number(before.rows[0]?.count)).toBeGreaterThanOrEqual(3);

    const result = await runSeed(handle);

    // Slice 1/2 baseline: zero new rows on re-run (truly idempotent).
    expect(result.workspaceInserted).toBe(false);
    expect(result.actorsInserted).toBe(0);
    expect(result.managedSystemsInserted).toBe(0);
    expect(result.analyticsAreasInserted).toBe(0);

    // Slice 3 uses delete-and-recreate idempotency: counts are always 12/36/2
    // because every run deletes seed rows then reinserts them. Determinism is
    // verified by stable UUIDs (see voc-seed.integration.test.ts), not by
    // zero-insertion counting.
    expect(result.vocsInserted).toBe(12);
    expect(result.conversationRowsInserted).toBe(36);
    expect(result.permissionFixturesInserted).toBe(2);

    const after = await handle.pool.query<{ count: string }>(
      'select count(*)::text as count from core.actors where workspace_id = $1',
      [WORKSPACE_ID],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('seeds Slice 2 managed_systems + analytics_areas per ADR-0017', async () => {
    const ms = await handle.pool.query<{ slug: string; name: string }>(
      `select slug, name from core.managed_systems
         where workspace_id = $1 and archived_at is null
         order by slug`,
      [WORKSPACE_ID],
    );
    expect(ms.rows).toEqual([
      { slug: 'power-bi', name: 'Power BI' },
      { slug: 'tableau', name: 'Tableau' },
    ]);

    const aa = await handle.pool.query<{ ms_slug: string; aa_slug: string }>(
      `select m.slug as ms_slug, a.slug as aa_slug
         from core.analytics_areas a
         join core.managed_systems m on m.id = a.managed_system_id
        where a.workspace_id = $1 and a.archived_at is null
        order by m.slug, a.slug`,
      [WORKSPACE_ID],
    );
    expect(aa.rows).toEqual([
      { ms_slug: 'power-bi', aa_slug: 'permission-management' },
      { ms_slug: 'power-bi', aa_slug: 'usage-analytics' },
      { ms_slug: 'tableau', aa_slug: 'dashboard-catalog' },
      { ms_slug: 'tableau', aa_slug: 'permission-management' },
      { ms_slug: 'tableau', aa_slug: 'usage-analytics' },
    ]);

    // ADR-0018 / grill Q9: default_owner_actor_id points at mock-admin-1 on
    // both MS seed rows; no team rows seeded.
    const { rows: ownerRows } = await handle.pool.query<{
      slug: string;
      external_id: string | null;
    }>(
      `select m.slug, a.external_id
         from core.managed_systems m
         left join core.actors a on a.id = m.default_owner_actor_id
        where m.workspace_id = $1 and m.archived_at is null
        order by m.slug`,
      [WORKSPACE_ID],
    );
    expect(ownerRows.every((r) => r.external_id === 'mock-admin-1')).toBe(true);

    // ADR-0018 placeholder — zero non-seed teams; Slice 3 seed inserts exactly
    // one '[seed] VOC owner team' for VOC fixture coverage.
    const { rows: teamRows } = await handle.pool.query<{ count: string }>(
      `select count(*)::text as count from core.teams
        where workspace_id = $1 and name not like '[seed]%'`,
      [WORKSPACE_ID],
    );
    expect(teamRows[0]?.count).toBe('0');
  });

  it('seeds the three CONTEXT.md baseline actors with locked role/type combo', async () => {
    const { rows } = await handle.pool.query<{
      external_id: string;
      role_level: string;
      actor_type: string;
      email: string;
    }>(
      `select external_id, role_level, actor_type, email
         from core.actors
        where workspace_id = $1
        order by external_id`,
      [WORKSPACE_ID],
    );

    const byId = Object.fromEntries(rows.map((r) => [r.external_id, r]));

    expect(byId['mock-admin-1']).toEqual({
      external_id: 'mock-admin-1',
      role_level: 'admin',
      actor_type: 'internal_member',
      email: 'admin@feedbackops.local',
    });
    expect(byId['mock-user-1']).toEqual({
      external_id: 'mock-user-1',
      role_level: 'user',
      actor_type: 'internal_member',
      email: 'user@feedbackops.local',
    });
    expect(byId.system).toEqual({
      external_id: 'system',
      role_level: 'admin',
      actor_type: 'system',
      email: 'system@feedbackops.local',
    });
  });
});
