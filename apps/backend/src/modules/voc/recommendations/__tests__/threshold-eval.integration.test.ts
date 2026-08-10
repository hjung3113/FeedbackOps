// #168 step 5 — the evaluation fixture driven through the REAL read model
// (ADR-0034 D5), against Postgres and pgvector.
//
// The pure harness in `../eval/__tests__/` proves the arithmetic. It cannot
// prove the thing most likely to actually be wrong: `<=>` returns cosine
// DISTANCE while the threshold is expressed as SIMILARITY, so
// `selectVocRecommendations` converts with `1 - (a <=> b)` and then compares
// `score >= threshold`. Invert either the conversion or the comparison and
// every pure test still passes while the product recommends the least similar
// VOCs. This file is where that is caught, by seeding the same fixture corpus
// as real VOCs with real pgvector rows and asserting both the membership and
// the numeric score.
//
// Authorization is deliberately NOT re-tested here — one admin actor sees
// everything, so nothing filters and the threshold is the only variable.
// ADR-0034 D4 scoping is covered by `recommendations.integration.test.ts`.
//
// The suite runs at its own `embedding_version` for the reason step 4's suite
// does: `<=>` rejects operands of differing dimensionality and the shared dev
// database already holds vectors of other widths at other versions.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { createAuditService } from '../../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../../../permissions/check-service.js';
import { createVocClustersService } from '../../../voc-clusters/service.js';
import { VOC_RECOMMENDATION_SIMILARITY_THRESHOLD } from '../constants.js';
import { THRESHOLD_EVAL_FIXTURE, assertFixtureWellFormed } from '../eval/fixture.js';
import { cosineSimilarity, evaluateFixture } from '../eval/harness.js';
import {
  type VocRecommendationsActor,
  type VocRecommendationsService,
  createVocRecommendationsService,
} from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-voc-eval';
/** Private to this suite; see the header note on vector dimensionality. */
const ACTIVE_VERSION = 168_050;

const fixture = THRESHOLD_EVAL_FIXTURE;
const CUT = VOC_RECOMMENDATION_SIMILARITY_THRESHOLD;
/** float4 storage in pgvector; the harness computes in float64. */
const PGVECTOR_TOLERANCE = 1e-6;

/** The item keys that appear as a `source` in at least one labelled pair. */
const SOURCE_KEYS = [...new Set(fixture.pairs.map((pair) => pair.source))];

describe.skipIf(!runIntegration)('voc recommendation threshold evaluation (#168)', () => {
  let appHandle: DbHandle;
  let ops: DbHandle;
  let service: VocRecommendationsService;

  let adminId: string;
  let msId: string;
  /** fixture item key → seeded VOC id. */
  let vocIdByKey: Map<string, string>;

  const admin = (): VocRecommendationsActor => ({
    actor_id: adminId,
    workspace_id: WORKSPACE_ID,
    role_level: 'admin',
  });

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
    assertFixtureWellFormed(fixture);
    service = buildService();

    msId = await insertMs();
    vocIdByKey = new Map();
    for (const item of fixture.items) {
      const vocId = await insertVoc(item.title);
      await insertEmbedding(vocId, item.vector);
      vocIdByKey.set(item.key, vocId);
    }
  });

  function buildService(overrides?: { threshold?: number }): VocRecommendationsService {
    const auditService = createAuditService();
    const checkService = createCheckService({ db: appHandle.db });
    const idempotencyService = createIdempotencyService();
    return createVocRecommendationsService({
      db: appHandle.db,
      auditService,
      embeddingVersion: ACTIVE_VERSION,
      embeddingEnabled: true,
      createClustersService: (db) =>
        createVocClustersService({ db, auditService, checkService, idempotencyService }),
      ...(overrides?.threshold !== undefined ? { threshold: overrides.threshold } : {}),
    });
  }

  // ── fixture helpers ────────────────────────────────────────────────────────

  async function insertMs(): Promise<string> {
    const res = await appHandle.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, $3) returning id`,
      [WORKSPACE_ID, `${SLUG_PREFIX}-${randomUUID().slice(0, 8)}`, 'Threshold eval system'],
    );
    return res.rows[0]?.id ?? '';
  }

  async function insertVoc(title: string): Promise<string> {
    const res = await appHandle.pool.query<{ id: string }>(
      `insert into voc.vocs
         (workspace_id, primary_managed_system_id, reporter_id, display_id, title,
          description_rich_content, source_context, reporter_facing_status, triage_state)
       values ($1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
          '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
          'direct_use', 'received', 'untriaged')
       returning id`,
      [WORKSPACE_ID, msId, adminId, title],
    );
    return res.rows[0]?.id ?? '';
  }

  async function insertEmbedding(vocId: string, vector: number[]): Promise<void> {
    await appHandle.pool.query(
      `insert into voc.voc_embeddings
         (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash)
       values ($1, $2, $3, 'test', 'eval-fixture', $4, $5::vector, $6)
       on conflict on constraint voc_embeddings_voc_version_pk do update
         set embedding = excluded.embedding`,
      [vocId, WORKSPACE_ID, ACTIVE_VERSION, vector.length, JSON.stringify(vector), `hash-${vocId}`],
    );
  }

  /** Children before parents; fops_app holds no DELETE on the decision table. */
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
      `delete from core.managed_systems where workspace_id = $1 and slug like $2`,
      args,
    );
  }

  function keyOf(vocId: string): string {
    for (const [key, id] of vocIdByKey) if (id === vocId) return key;
    throw new Error(`unseeded voc id in result: ${vocId}`);
  }

  /**
   * What the read model should return for a source, derived from the harness's
   * own cosine over the whole corpus — every other item, not only the labelled
   * pairs, since the query has no notion of a "labelled" pair.
   */
  function expectedAboveCut(sourceKey: string, cut = CUT): { key: string; similarity: number }[] {
    const sourceVector = fixture.items.find((item) => item.key === sourceKey)?.vector ?? [];
    return fixture.items
      .filter((item) => item.key !== sourceKey)
      .map((item) => ({ key: item.key, similarity: cosineSimilarity(sourceVector, item.vector) }))
      .filter((scored) => scored.similarity >= cut)
      .sort((left, right) => right.similarity - left.similarity);
  }

  async function listFor(
    sourceKey: string,
    svc: VocRecommendationsService = service,
  ): Promise<{ keys: string[]; scoreByKey: Map<string, number>; total: number }> {
    const result = await svc.listRecommendations({
      actor: admin(),
      sourceVocId: vocIdByKey.get(sourceKey) ?? '',
    });
    if (!result.available) throw new Error(`recommendations unavailable: ${result.reason}`);
    const keys = result.items.map((item) => keyOf(item.voc_id));
    return {
      keys,
      scoreByKey: new Map(result.items.map((item) => [keyOf(item.voc_id), item.score])),
      total: result.total,
    };
  }

  // ── (1) the fixture, end to end ────────────────────────────────────────────

  it('returns exactly the corpus above the cut, for every source in the fixture', async () => {
    for (const sourceKey of SOURCE_KEYS) {
      const expected = expectedAboveCut(sourceKey);
      const actual = await listFor(sourceKey);
      // Ordered: the query is `ORDER BY score DESC`, and the expectation is
      // sorted the same way, so this also pins the sort direction.
      expect(actual.keys, `source ${sourceKey}`).toEqual(expected.map((row) => row.key));
      expect(actual.total, `source ${sourceKey}`).toBe(expected.length);
    }
  });

  it('classifies every labelled pair the way the fixture says at the pinned cut', async () => {
    const report = evaluateFixture(fixture, CUT);
    const returned = new Map<string, Set<string>>();
    for (const sourceKey of SOURCE_KEYS) {
      returned.set(sourceKey, new Set((await listFor(sourceKey)).keys));
    }
    for (const outcome of report.pairs) {
      const appeared = returned.get(outcome.source)?.has(outcome.candidate) ?? false;
      // `predicted` is the harness's verdict; `appeared` is the database's.
      // They must agree pair by pair, including on the pairs where both are
      // wrong about the human label (the deliberate fp and fn).
      expect(appeared, `${outcome.source}→${outcome.candidate} (${outcome.cell})`).toBe(
        outcome.predicted === 'related',
      );
    }
    // Non-vacuity: the loop above must have seen both verdicts.
    expect(report.pairs.some((pair) => pair.predicted === 'related')).toBe(true);
    expect(report.pairs.some((pair) => pair.predicted === 'unrelated')).toBe(true);
  });

  // ── (2) threshold direction ────────────────────────────────────────────────

  it('admits the pair just above the cut and rejects the one just below', async () => {
    const { keys } = await listFor('src-login-loop');
    // 55/73 ≈ 0.75342, just above 0.75.
    expect(keys).toContain('cand-sso-loop');
    // 72/97 ≈ 0.74227, just below 0.75. If `score >= threshold` were flipped
    // to `<=`, these two assertions swap and both fail.
    expect(keys).not.toContain('cand-export-csv-slow');
    // 21/29 ≈ 0.72414, also just below — and labelled `related`, so its
    // absence is the false negative the fixture accepts on purpose.
    expect(keys).not.toContain('cand-password-reset-loop');
  });

  it('moves those two pairs when the cut moves past them', async () => {
    // Proves the pair placement, not just the current verdict: with the cut
    // lowered under 72/97 the previously rejected candidate must appear.
    const loose = buildService({ threshold: 0.73 });
    const keys = (await listFor('src-login-loop', loose)).keys;
    expect(keys).toContain('cand-export-csv-slow');
    expect(keys).toContain('cand-sso-loop');

    // And raised above 55/73 the previously admitted one must vanish.
    const strict = buildService({ threshold: 0.76 });
    const strictKeys = (await listFor('src-login-loop', strict)).keys;
    expect(strictKeys).not.toContain('cand-sso-loop');
    expect(strictKeys).toContain('cand-invoice-pdf-broken'); // 105/137 ≈ 0.76642
  });

  // ── (3) distance → similarity conversion ───────────────────────────────────

  it('reports cosine SIMILARITY, not the distance pgvector returns', async () => {
    const { scoreByKey } = await listFor('src-login-loop');

    // The load-bearing assertion. `<=>` gives distance d = 1 - similarity.
    // For cand-login-slow the true similarity is 4/5 = 0.8, so d = 0.2.
    // A `score` of 0.2 here means the conversion `1 - (a <=> b)` was dropped
    // or inverted; 0.8 means it is right.
    expect(scoreByKey.get('cand-login-slow')).toBeCloseTo(0.8, 6);
    expect(scoreByKey.get('cand-login-slow')).not.toBeCloseTo(0.2, 3);

    // Identical direction: similarity 1.0, distance 0.0. This pair alone
    // distinguishes the two most cleanly — an inverted conversion reports 0
    // for the most similar VOC in the corpus, and 0 is below the cut, so the
    // exact duplicate would also disappear from the list entirely.
    expect(scoreByKey.get('cand-login-loop-restated')).toBeCloseTo(1, 6);

    // Every score, against the fixture's hand-computed rationals.
    for (const { key, similarity } of expectedAboveCut('src-login-loop')) {
      expect(scoreByKey.get(key), key).toBeCloseTo(similarity, 6);
    }
  });

  it('agrees with the pure harness on every score it returns, within float4', async () => {
    for (const sourceKey of SOURCE_KEYS) {
      const { scoreByKey } = await listFor(sourceKey);
      const sourceVector = fixture.items.find((item) => item.key === sourceKey)?.vector ?? [];
      for (const [key, score] of scoreByKey) {
        const candidateVector = fixture.items.find((item) => item.key === key)?.vector ?? [];
        const harnessSimilarity = cosineSimilarity(sourceVector, candidateVector);
        expect(Math.abs(score - harnessSimilarity), `${sourceKey}→${key}`).toBeLessThan(
          PGVECTOR_TOLERANCE,
        );
      }
    }
  });

  // ── (4) the pinned expectation, measured through the database ──────────────

  it('reproduces the fixture’s confusion matrix from database results alone', async () => {
    // The same counts `../eval/__tests__/fixture-pins-threshold.test.ts`
    // asserts on the pure harness, recomputed here from what Postgres
    // actually returned. If the two ever disagree, the harness has stopped
    // describing the shipped query and the fixture is measuring a fiction.
    const returned = new Map<string, Set<string>>();
    for (const sourceKey of SOURCE_KEYS) {
      returned.set(sourceKey, new Set((await listFor(sourceKey)).keys));
    }
    const counts = { tp: 0, fp: 0, tn: 0, fn: 0 };
    for (const pair of fixture.pairs) {
      const appeared = returned.get(pair.source)?.has(pair.candidate) ?? false;
      if (pair.expected === 'related') counts[appeared ? 'tp' : 'fn'] += 1;
      else counts[appeared ? 'fp' : 'tn'] += 1;
    }
    expect(counts).toEqual({
      tp: fixture.expectedAtPin.truePositives,
      fp: fixture.expectedAtPin.falsePositives,
      tn: fixture.expectedAtPin.trueNegatives,
      fn: fixture.expectedAtPin.falseNegatives,
    });
  });
});
