// The ADR-0031 visibility rule, pinned once (#168).
//
// The rule — "a VOC is visible when its Managed System is in the actor's
// voc.read scope OR the actor reported it" — used to exist in three
// hand-maintained copies: `similarPeerVisibilityPredicate` in repo-read.ts
// (private, alias `p.` hardcoded), `candidateVisibilityPredicate` in
// recommendations/scope.ts (a copy parameterized by alias), and `isVocVisible`
// (a TypeScript twin for already-loaded rows). Nothing asserted they agreed.
// There is now one implementation, `similarVocVisibilityPredicate`, and this
// file is what keeps it honest:
//
//   1. a verdict matrix over scope shapes, run against the real database
//      rather than by comparing generated SQL text — comparing SQL strings
//      proves nothing about what Postgres does with them; and
//   2. an agreement test that puts the two production read models that
//      consume the rule — the ADR-0031 similar-peer projections and the
//      ADR-0034 recommendation read model — on ONE fixture and asserts they
//      admit the same VOCs for the same actor.
//
// (2) is the assertion that makes the unification real. If someone
// reintroduces a second body for one surface, the two read models diverge for
// at least one row in the matrix and this test fails.

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { selectVocRecommendations } from '../recommendations/repo.js';
import {
  type Scope,
  selectSimilarVocCount,
  selectSimilarVocItems,
  similarVocVisibilityPredicate,
} from '../repo-read.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-voc-vis';
const EXTERNAL_ID_PREFIX = 'it-voc-vis';
/** Private to this suite: `<=>` rejects mixed dimensionality on a shared DB. */
const ACTIVE_VERSION = 168_006;
const IDENTICAL_VECTOR = [1, 0, 0];

describe.skipIf(!runIntegration)('ADR-0031 VOC visibility predicate (#168)', () => {
  let appHandle: DbHandle;
  let ops: DbHandle;

  let adminId: string;
  /** Reports nothing; used for the pure-scope arms. */
  let plainActorId: string;
  /** Reports one VOC in each system; used for the reporter arm. */
  let reporterActorId: string;
  let msA: string;
  let msB: string;
  let msEmpty: string;

  let sourceVoc: string;
  let a1: string; // msA, reported by admin
  let a2: string; // msA, reported by reporterActor
  let b1: string; // msB, reported by admin
  let b2: string; // msB, reported by reporterActor

  beforeAll(async () => {
    appHandle = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    const actors = await appHandle.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminId = actors.rows[0]?.id ?? '';
    if (!adminId) throw new Error('seed admin actor not found');
  });

  afterAll(async () => {
    await cleanup();
    await appHandle?.close();
    await ops?.close();
  });

  beforeEach(async () => {
    await cleanup();
    msA = await insertMs('Visibility A');
    msB = await insertMs('Visibility B');
    msEmpty = await insertMs('Visibility empty');
    plainActorId = await insertActor('plain');
    reporterActorId = await insertActor('reporter');

    sourceVoc = await insertVoc(msA, adminId, 'Visibility source');
    a1 = await insertVoc(msA, adminId, 'A1 admin-reported');
    a2 = await insertVoc(msA, reporterActorId, 'A2 reporter-reported');
    b1 = await insertVoc(msB, adminId, 'B1 admin-reported');
    b2 = await insertVoc(msB, reporterActorId, 'B2 reporter-reported');
  });

  // ── fixture helpers ────────────────────────────────────────────────────────

  async function insertMs(name: string): Promise<string> {
    const res = await appHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id`,
      [WORKSPACE_ID, `${SLUG_PREFIX}-${randomUUID().slice(0, 8)}`, name],
    );
    return res.rows[0]?.id ?? '';
  }

  async function insertActor(suffix: string): Promise<string> {
    const unique = randomUUID().slice(0, 8);
    const res = await ops.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member')
       returning id`,
      [
        WORKSPACE_ID,
        `${EXTERNAL_ID_PREFIX}-${suffix}-${unique}`,
        `${EXTERNAL_ID_PREFIX}-${suffix}-${unique}@local`,
        `Visibility ${suffix}`,
      ],
    );
    return res.rows[0]?.id ?? '';
  }

  async function insertVoc(msId: string, reporterId: string, title: string): Promise<string> {
    const res = await appHandle.pool.query<{ id: string }>(
      `insert into voc.vocs
         (workspace_id, primary_managed_system_id, reporter_id, display_id, title,
          description_rich_content, source_context, reporter_facing_status, triage_state)
       values ($1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
          'direct_use', 'received', 'untriaged')
       returning id`,
      [WORKSPACE_ID, msId, reporterId, title],
    );
    return res.rows[0]?.id ?? '';
  }

  async function insertEmbedding(vocId: string): Promise<void> {
    await appHandle.pool.query(
      `insert into voc.voc_embeddings
         (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash)
       values ($1, $2, $3, 'test', 'hand-built', $4, $5::vector, $6)
       on conflict on constraint voc_embeddings_voc_version_pk do nothing`,
      [
        vocId,
        WORKSPACE_ID,
        ACTIVE_VERSION,
        IDENTICAL_VECTOR.length,
        JSON.stringify(IDENTICAL_VECTOR),
        `hash-${vocId}`,
      ],
    );
  }

  async function cleanup(): Promise<void> {
    if (!ops) return;
    const systems = `(select id from core.managed_systems where workspace_id = $1 and slug like $2)`;
    const fixtureVocs = `(select id from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${systems})`;
    const args = [WORKSPACE_ID, `${SLUG_PREFIX}%`];
    await ops.pool.query(
      `delete from voc.voc_recommendation_decisions where source_voc_id in ${fixtureVocs}`,
      args,
    );
    await ops.pool.query(`delete from voc.voc_embeddings where voc_id in ${fixtureVocs}`, args);
    await ops.pool.query(
      `delete from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${systems}`,
      args,
    );
    await ops.pool.query(
      `delete from permission.permission_grants where workspace_id = $1
         and actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`,
      [WORKSPACE_ID, `${EXTERNAL_ID_PREFIX}%`],
    );
    await ops.pool.query(
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      args,
    );
    await ops.pool.query(
      `delete from core.actors where workspace_id = $1 and external_id like $2`,
      [WORKSPACE_ID, `${EXTERNAL_ID_PREFIX}%`],
    );
  }

  /**
   * Runs the shared predicate against the real database over this fixture's
   * candidate VOCs. This is the SQL side of the matrix — the predicate is
   * executed by Postgres, not compared as text.
   */
  async function admittedByPredicate(readScope: Scope, actorId: string): Promise<string[]> {
    const visible = similarVocVisibilityPredicate(readScope, actorId, sql`v`);
    const result = await appHandle.db.execute<{ id: string }>(sql`
      SELECT v.id
        FROM voc.vocs v
       WHERE v.workspace_id = ${WORKSPACE_ID}
         AND v.id = ANY(ARRAY[${sql.join(
           [a1, a2, b1, b2].map((id) => sql`${id}::uuid`),
           sql`, `,
         )}]::uuid[])
         AND ${visible}
    `);
    return result.rows.map((row) => row.id).sort();
  }

  // ── (1) verdict matrix ─────────────────────────────────────────────────────

  it('admits exactly the VOCs in scope or reported by the actor, across every scope shape', async () => {
    const all = [a1, a2, b1, b2].sort();

    // kind: 'all' — an admin's workspace-wide scope admits everything.
    expect(await admittedByPredicate({ kind: 'all' }, plainActorId)).toEqual(all);

    // scoped, with a match: the whole Managed System, whoever reported it.
    expect(
      await admittedByPredicate({ kind: 'scoped', managedSystemIds: [msA] }, plainActorId),
    ).toEqual([a1, a2].sort());

    // scoped, without a match: a grant on a system holding none of these
    // candidates admits nothing, because this actor reported nothing either.
    expect(
      await admittedByPredicate({ kind: 'scoped', managedSystemIds: [msEmpty] }, plainActorId),
    ).toEqual([]);

    // reporter-owned without scope: the OR arm on its own.
    expect(
      await admittedByPredicate({ kind: 'scoped', managedSystemIds: [msEmpty] }, reporterActorId),
    ).toEqual([a2, b2].sort());

    // both reporter and scoped: the union, not one arm winning. a1 comes from
    // scope alone, b2 from ownership alone, a2 from both.
    expect(
      await admittedByPredicate({ kind: 'scoped', managedSystemIds: [msA] }, reporterActorId),
    ).toEqual([a1, a2, b2].sort());

    // empty managedSystemIds: no scope at all, and this actor reported nothing.
    expect(
      await admittedByPredicate({ kind: 'scoped', managedSystemIds: [] }, plainActorId),
    ).toEqual([]);
    // ...but the same empty scope still honours ownership.
    expect(
      await admittedByPredicate({ kind: 'scoped', managedSystemIds: [] }, reporterActorId),
    ).toEqual([a2, b2].sort());
  });

  // ── (2) the two read models agree on one fixture ───────────────────────────

  it('admits the same VOCs through the ADR-0031 peer projections and the ADR-0034 recommendation read model', async () => {
    // The ADR-0031 projections are same-Managed-System only, so the shared
    // fixture is msA. Both a1 and a2 sit alongside the source; the
    // recommendation model additionally needs vectors, so give every msA VOC
    // the same unit vector (cosine 1.0, comfortably above the pinned cut).
    for (const vocId of [sourceVoc, a1, a2]) await insertEmbedding(vocId);

    const cases: { name: string; scope: Scope; actorId: string }[] = [
      { name: "kind: 'all'", scope: { kind: 'all' }, actorId: plainActorId },
      {
        name: 'scoped with match',
        scope: { kind: 'scoped', managedSystemIds: [msA] },
        actorId: plainActorId,
      },
      {
        name: 'scoped without match',
        scope: { kind: 'scoped', managedSystemIds: [msEmpty] },
        actorId: plainActorId,
      },
      {
        name: 'reporter-owned without scope',
        scope: { kind: 'scoped', managedSystemIds: [msEmpty] },
        actorId: reporterActorId,
      },
      {
        name: 'reporter and scoped',
        scope: { kind: 'scoped', managedSystemIds: [msA] },
        actorId: reporterActorId,
      },
      {
        name: 'empty managedSystemIds',
        scope: { kind: 'scoped', managedSystemIds: [] },
        actorId: plainActorId,
      },
    ];

    // Expected per case, written out rather than derived, so the test states
    // the rule instead of restating whichever implementation it is checking.
    const expected: Record<string, string[]> = {
      "kind: 'all'": [a1, a2].sort(),
      'scoped with match': [a1, a2].sort(),
      'scoped without match': [],
      'reporter-owned without scope': [a2],
      'reporter and scoped': [a1, a2].sort(),
      'empty managedSystemIds': [],
    };

    for (const testCase of cases) {
      const peerItems = (
        await selectSimilarVocItems(appHandle.db, {
          workspaceId: WORKSPACE_ID,
          sourceVocId: sourceVoc,
          primaryManagedSystemId: msA,
          actorId: testCase.actorId,
          readScope: testCase.scope,
        })
      )
        .map((item) => item.id)
        .sort();

      const peerCount = await selectSimilarVocCount(appHandle.db, {
        workspaceId: WORKSPACE_ID,
        sourceVocId: sourceVoc,
        primaryManagedSystemId: msA,
        actorId: testCase.actorId,
        readScope: testCase.scope,
      });

      const recommended = (
        await selectVocRecommendations(appHandle.db, {
          workspaceId: WORKSPACE_ID,
          sourceVocId: sourceVoc,
          actorId: testCase.actorId,
          readScope: testCase.scope,
          embeddingVersion: ACTIVE_VERSION,
          threshold: 0.75,
          limit: 10,
        })
      ).items
        .map((item) => item.voc_id)
        .sort();

      const directlyAdmitted = (await admittedByPredicate(testCase.scope, testCase.actorId))
        .filter((id) => id === a1 || id === a2)
        .sort();

      expect(peerItems, `ADR-0031 items, ${testCase.name}`).toEqual(expected[testCase.name]);
      expect(peerCount, `ADR-0031 count, ${testCase.name}`).toBe(
        expected[testCase.name]?.length ?? 0,
      );
      expect(recommended, `ADR-0034 recommendations, ${testCase.name}`).toEqual(
        expected[testCase.name],
      );
      // Both surfaces against the predicate itself: one rule, three call sites,
      // one verdict.
      expect(directlyAdmitted, `shared predicate, ${testCase.name}`).toEqual(
        expected[testCase.name],
      );
    }
  });
});
