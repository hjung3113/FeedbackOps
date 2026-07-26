// #168 step 4 — recommendation read model, dismissal state and confirmation
// path (ADR-0034 D3/D4/D5/D6) against the real database.
//
// Vectors are hand-built unit vectors, never the step-2 fake provider. The
// fake derives its output from a hash of the text, so two "similar" VOCs get
// unrelated vectors: it is correct for exercising ingestion and useless for
// asserting anything about meaning. Cosine similarity here is arithmetic we
// control:
//
//   source [1, 0, 0]
//   [1.0, 0, 0]     → 1.00   (identical direction)
//   [0.8, 0.6, 0]   → 0.80   (above the 0.75 cut)
//   [0.6, 0.8, 0]   → 0.60   (below the cut)
//
// The suite runs at its own `embedding_version`, not 1. `<=>` rejects operands
// of differing dimensionality, and the shared dev database already holds
// 8-dimension vectors written by the step-3 suites at version 1. A private
// version is what keeps this suite's 3-dimension corpus isolated on a database
// it does not own.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../../db/client.js';
import { HttpError } from '../../../../lib/errors.js';
import { createAuditService } from '../../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../../core/idempotency/idempotency-service.js';
import { createCheckService } from '../../../permissions/check-service.js';
import { createVocClustersService } from '../../../voc-clusters/service.js';
import { VOC_RECOMMENDATION_SIMILARITY_THRESHOLD } from '../constants.js';
import {
  type VocRecommendationsActor,
  type VocRecommendationsService,
  createVocRecommendationsService,
} from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-voc-reco';
const EXTERNAL_ID_PREFIX = 'it-voc-reco';
/** Private to this suite; see the header note on vector dimensionality. */
const ACTIVE_VERSION = 168_004;
const NEXT_VERSION = 168_005;

const SOURCE_VECTOR = [1, 0, 0];
const IDENTICAL_VECTOR = [1, 0, 0];
const ABOVE_CUT_VECTOR = [0.8, 0.6, 0];
const BELOW_CUT_VECTOR = [0.6, 0.8, 0];

describe.skipIf(!runIntegration)('voc recommendations (#168)', () => {
  let appHandle: DbHandle;
  let ops: DbHandle;
  let service: VocRecommendationsService;

  let adminId: string;
  let msA: string;
  let msB: string;
  /** Developer with voc.read on msA only, and no finding.manage anywhere. */
  let scopedDevId: string;
  /** Developer with voc.read + finding.manage on msA. */
  let managerDevId: string;
  let sourceVocId: string;

  const admin = (): VocRecommendationsActor => ({
    actor_id: adminId,
    workspace_id: WORKSPACE_ID,
    role_level: 'admin',
  });
  const scopedDev = (): VocRecommendationsActor => ({
    actor_id: scopedDevId,
    workspace_id: WORKSPACE_ID,
    role_level: 'developer',
  });
  const managerDev = (): VocRecommendationsActor => ({
    actor_id: managerDevId,
    workspace_id: WORKSPACE_ID,
    role_level: 'developer',
  });

  function buildService(overrides?: { embeddingVersion?: number; limit?: number }) {
    const auditService = createAuditService();
    const checkService = createCheckService({ db: appHandle.db });
    const idempotencyService = createIdempotencyService();
    return createVocRecommendationsService({
      db: appHandle.db,
      auditService,
      embeddingVersion: overrides?.embeddingVersion ?? ACTIVE_VERSION,
      embeddingEnabled: true,
      createClustersService: (db) =>
        createVocClustersService({ db, auditService, checkService, idempotencyService }),
      ...(overrides?.limit !== undefined ? { limit: overrides.limit } : {}),
    });
  }

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
    service = buildService();

    msA = await insertMs('Recommendation system A');
    msB = await insertMs('Recommendation system B');

    scopedDevId = await insertActor('scoped');
    managerDevId = await insertActor('manager');
    await grant(scopedDevId, 'voc.read', msA);
    await grant(managerDevId, 'voc.read', msA);
    await grant(managerDevId, 'finding.read', msA);
    await grant(managerDevId, 'finding.manage', msA);

    sourceVocId = await insertVoc(msA, adminId, 'Source VOC');
    await insertEmbedding(sourceVocId, SOURCE_VECTOR, ACTIVE_VERSION);
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
    const res = await ops.pool.query<{ id: string }>(
      `insert into core.actors
         (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member')
       returning id`,
      [
        WORKSPACE_ID,
        `${EXTERNAL_ID_PREFIX}-${suffix}-${randomUUID().slice(0, 8)}`,
        `${EXTERNAL_ID_PREFIX}-${suffix}-${randomUUID().slice(0, 8)}@local`,
        `Reco ${suffix}`,
      ],
    );
    return res.rows[0]?.id ?? '';
  }

  async function grant(actorId: string, capability: string, msId: string): Promise<void> {
    await ops.pool.query(
      `insert into permission.permission_grants
         (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, $3, $4, $5)`,
      [WORKSPACE_ID, actorId, capability, msId, adminId],
    );
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

  async function insertEmbedding(vocId: string, vector: number[], version: number): Promise<void> {
    await appHandle.pool.query(
      `insert into voc.voc_embeddings
         (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash)
       values ($1, $2, $3, 'test', 'hand-built', $4, $5::vector, $6)
       on conflict on constraint voc_embeddings_voc_version_pk do update
         set embedding = excluded.embedding`,
      [vocId, WORKSPACE_ID, version, vector.length, JSON.stringify(vector), `hash-${vocId}`],
    );
  }

  /** A candidate VOC with a vector at the active version. */
  async function seedCandidate(args: {
    msId: string;
    reporterId: string;
    title: string;
    vector: number[];
    versions?: number[];
  }): Promise<string> {
    const vocId = await insertVoc(args.msId, args.reporterId, args.title);
    for (const version of args.versions ?? [ACTIVE_VERSION]) {
      await insertEmbedding(vocId, args.vector, version);
    }
    return vocId;
  }

  async function clusterCountForFixtureSystems(): Promise<number> {
    const res = await appHandle.pool.query<{ cnt: string }>(
      `select count(*)::text as cnt from voc_cluster.voc_clusters
        where primary_managed_system_id = any($1::uuid[])`,
      [[msA, msB]],
    );
    return Number(res.rows[0]?.cnt ?? 0);
  }

  /** Children before parents; fops_app holds no DELETE on the decision table. */
  async function cleanup(): Promise<void> {
    if (!ops) return;
    const systems = `(select id from core.managed_systems where workspace_id = $1 and slug like $2)`;
    const fixtureVocs = `(select id from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${systems})`;
    const args = [WORKSPACE_ID, `${SLUG_PREFIX}%`];

    await ops.pool.query(
      `delete from core.audit_log where workspace_id = $1
         and (actor_id in (select id from core.actors where workspace_id = $1 and external_id like $3)
              or detail->>'source_voc_id' in (select id::text from voc.vocs where workspace_id = $1 and primary_managed_system_id in ${systems}))`,
      [...args, `${EXTERNAL_ID_PREFIX}%`],
    );
    await ops.pool.query(
      `delete from voc.voc_recommendation_decisions where source_voc_id in ${fixtureVocs}`,
      args,
    );
    await ops.pool.query(
      `delete from voc_cluster.voc_cluster_members where voc_id in ${fixtureVocs}`,
      args,
    );
    await ops.pool.query(
      `delete from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id in ${systems}`,
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

  function ids(result: { items: { voc_id: string }[] }): string[] {
    return result.items.map((item) => item.voc_id);
  }

  // ── (a) authorization ──────────────────────────────────────────────────────

  it('hides an out-of-scope candidate from both the items and the total', async () => {
    const inScope = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'In scope',
      vector: ABOVE_CUT_VECTOR,
    });
    const outOfScope = await seedCandidate({
      msId: msB,
      reporterId: adminId,
      title: 'Out of scope',
      vector: IDENTICAL_VECTOR,
    });

    // Same data set, two actors of differing scope. A broken filter shows up
    // as these two results being equal, not as an absent row.
    const asAdmin = await service.listRecommendations({
      actor: admin(),
      sourceVocId,
    });
    const asDev = await service.listRecommendations({
      actor: scopedDev(),
      sourceVocId,
    });

    expect(asAdmin.available).toBe(true);
    expect(ids(asAdmin).sort()).toEqual([inScope, outOfScope].sort());
    expect(asAdmin.total).toBe(2);

    expect(asDev.available).toBe(true);
    expect(ids(asDev)).toEqual([inScope]);
    // The count is the load-bearing assertion: a total of 2 here would leak
    // the existence of a VOC in a Managed System this actor cannot read.
    expect(asDev.total).toBe(1);
  });

  it('does not let an out-of-scope candidate consume a cap slot or the "N more" count', async () => {
    // The unauthorized candidate is the *highest* scoring one, so a filter
    // applied after LIMIT would spend the single slot on it and return an
    // empty list to the scoped actor.
    const inScope = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'In scope, lower score',
      vector: ABOVE_CUT_VECTOR,
    });
    await seedCandidate({
      msId: msB,
      reporterId: adminId,
      title: 'Out of scope, top score',
      vector: IDENTICAL_VECTOR,
    });

    const capped = buildService({ limit: 1 });
    const asAdmin = await capped.listRecommendations({ actor: admin(), sourceVocId });
    const asDev = await capped.listRecommendations({ actor: scopedDev(), sourceVocId });

    expect(asAdmin.items).toHaveLength(1);
    expect(asAdmin.total).toBe(2);
    expect(ids(asDev)).toEqual([inScope]);
    expect(asDev.total).toBe(1);
  });

  // ── (b) reporter-owned visibility ──────────────────────────────────────────

  it('shows a candidate the actor reported, even without scope on its system', async () => {
    const inScope = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'In scope',
      vector: ABOVE_CUT_VECTOR,
    });
    // msB is outside scopedDev's voc.read scope; they reported this one.
    const ownReport = await seedCandidate({
      msId: msB,
      reporterId: scopedDevId,
      title: 'Reported by the scoped dev',
      vector: IDENTICAL_VECTOR,
    });
    // Same system, someone else's report: stays hidden, so the test cannot
    // pass by the predicate collapsing to "everything in msB".
    const otherReport = await seedCandidate({
      msId: msB,
      reporterId: adminId,
      title: 'Reported by someone else',
      vector: IDENTICAL_VECTOR,
    });

    const asDev = await service.listRecommendations({ actor: scopedDev(), sourceVocId });

    expect(ids(asDev).sort()).toEqual([inScope, ownReport].sort());
    expect(asDev.total).toBe(2);
    expect(ids(asDev)).not.toContain(otherReport);
  });

  // ── (c) dismissal persists ─────────────────────────────────────────────────

  it('keeps a dismissed pair suppressed across recomputation', async () => {
    const dismissed = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Dismissed candidate',
      vector: IDENTICAL_VECTOR,
    });
    const kept = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Kept candidate',
      vector: ABOVE_CUT_VECTOR,
    });

    const before = await service.listRecommendations({ actor: admin(), sourceVocId });
    expect(ids(before).sort()).toEqual([dismissed, kept].sort());
    expect(before.total).toBe(2);

    await service.dismissRecommendation({
      actor: admin(),
      sourceVocId,
      candidateVocId: dismissed,
    });

    const after = await service.listRecommendations({ actor: admin(), sourceVocId });
    expect(ids(after)).toEqual([kept]);
    // The pair is gone from the count too, not merely from the page.
    expect(after.total).toBe(1);
  });

  it('records the dismissal under the scope key that produced the visibility', async () => {
    const candidate = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Dismissed candidate',
      vector: IDENTICAL_VECTOR,
    });
    await service.dismissRecommendation({
      actor: admin(),
      sourceVocId,
      candidateVocId: candidate,
    });

    const row = await appHandle.pool.query<{
      state: string;
      scope_key: string;
      embedding_version: number;
      cluster_id: string | null;
    }>(
      `select state, scope_key, embedding_version, cluster_id
         from voc.voc_recommendation_decisions
        where source_voc_id = $1 and candidate_voc_id = $2`,
      [sourceVocId, candidate],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]).toMatchObject({
      state: 'dismissed',
      scope_key: `ms:${msA}`,
      embedding_version: ACTIVE_VERSION,
      cluster_id: null,
    });

    const audit = await ops.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
        where workspace_id = $1 and event_type = 'voc_recommendation_dismissed'
          and detail->>'source_voc_id' = $2`,
      [WORKSPACE_ID, sourceVocId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      candidate_voc_id: candidate,
      embedding_version: ACTIVE_VERSION,
      scope_key: `ms:${msA}`,
    });
  });

  it('does not let a reporter-arm dismissal suppress the pair for a scoped actor', async () => {
    // scopedDev sees this candidate only because they reported it, so their
    // dismissal is keyed `actor:<id>` and must leave the admin's view alone.
    const candidate = await seedCandidate({
      msId: msB,
      reporterId: scopedDevId,
      title: 'Reported by the scoped dev',
      vector: IDENTICAL_VECTOR,
    });

    await service.dismissRecommendation({
      actor: scopedDev(),
      sourceVocId,
      candidateVocId: candidate,
    });

    const asDev = await service.listRecommendations({ actor: scopedDev(), sourceVocId });
    expect(ids(asDev)).not.toContain(candidate);

    const asAdmin = await service.listRecommendations({ actor: admin(), sourceVocId });
    expect(ids(asAdmin)).toContain(candidate);
    expect(asAdmin.total).toBe(1);
  });

  it('shares a scoped actor’s in-scope dismissal with everyone scoped to that system', async () => {
    // The one arm of `dismissalScopeKeySql` that no other test reaches: a
    // `kind: 'scoped'` actor dismissing a candidate *inside* their scope, which
    // takes the CASE/THEN branch rather than the admin short-circuit or the
    // reporter ELSE. It is also the most common production shape — an ordinary
    // triager with voc.read on the system — and if the SQL twin ever stops
    // agreeing with `dismissalScopeKey` here, the dismissal is written as
    // `ms:<msA>` and then never matched again: the pair returns on every
    // recomputation, and no application path can delete the row.
    const candidate = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Dismissed by a scoped actor',
      vector: IDENTICAL_VECTOR,
    });

    await service.dismissRecommendation({
      actor: scopedDev(),
      sourceVocId,
      candidateVocId: candidate,
    });

    const row = await appHandle.pool.query<{ scope_key: string }>(
      `select scope_key from voc.voc_recommendation_decisions
        where source_voc_id = $1 and candidate_voc_id = $2`,
      [sourceVocId, candidate],
    );
    expect(row.rows[0]?.scope_key).toBe(`ms:${msA}`);

    // Suppressed for the actor who dismissed it — proves the read query derives
    // the same key the write path stored.
    expect(
      ids(await service.listRecommendations({ actor: scopedDev(), sourceVocId })),
    ).not.toContain(candidate);
    // ...and for every other actor whose visibility comes from the same
    // Managed System: this arm is a shared triage judgement, not a personal one.
    expect(
      ids(await service.listRecommendations({ actor: managerDev(), sourceVocId })),
    ).not.toContain(candidate);
    const asAdmin = await service.listRecommendations({ actor: admin(), sourceVocId });
    expect(ids(asAdmin)).not.toContain(candidate);
    expect(asAdmin.total).toBe(0);
  });

  // ── (d) a new embedding version clears suppression ─────────────────────────

  it('resurfaces a dismissed pair after an embedding-version bump', async () => {
    const candidate = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Dismissed at the old version',
      vector: IDENTICAL_VECTOR,
      versions: [ACTIVE_VERSION, NEXT_VERSION],
    });
    await insertEmbedding(sourceVocId, SOURCE_VECTOR, NEXT_VERSION);

    await service.dismissRecommendation({
      actor: admin(),
      sourceVocId,
      candidateVocId: candidate,
    });
    expect(ids(await service.listRecommendations({ actor: admin(), sourceVocId }))).toEqual([]);

    const bumped = buildService({ embeddingVersion: NEXT_VERSION });
    const after = await bumped.listRecommendations({ actor: admin(), sourceVocId });
    expect(ids(after)).toEqual([candidate]);
    expect(after.total).toBe(1);
  });

  // ── (e) threshold ──────────────────────────────────────────────────────────

  it('admits a pair above the pinned cut and rejects one below it', async () => {
    const above = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Cosine 0.80',
      vector: ABOVE_CUT_VECTOR,
    });
    const below = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Cosine 0.60',
      vector: BELOW_CUT_VECTOR,
    });

    const result = await service.listRecommendations({ actor: admin(), sourceVocId });

    expect(ids(result)).toEqual([above]);
    expect(ids(result)).not.toContain(below);
    expect(result.total).toBe(1);
    // The scores bracket the pinned constant from both sides, so this assertion
    // fails if the cut moves in either direction.
    expect(result.items[0]?.score).toBeCloseTo(0.8, 5);
    expect(VOC_RECOMMENDATION_SIMILARITY_THRESHOLD).toBeGreaterThan(0.6);
    expect(VOC_RECOMMENDATION_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(0.8);
  });

  it('pins the shipped threshold and reports availability honestly', async () => {
    expect(VOC_RECOMMENDATION_SIMILARITY_THRESHOLD).toBe(0.75);

    const disabled = createVocRecommendationsService({
      db: appHandle.db,
      auditService: createAuditService(),
      embeddingVersion: ACTIVE_VERSION,
      embeddingEnabled: false,
      createClustersService: (db) =>
        createVocClustersService({
          db,
          auditService: createAuditService(),
          checkService: createCheckService({ db: appHandle.db }),
          idempotencyService: createIdempotencyService(),
        }),
    });
    const result = await disabled.listRecommendations({ actor: admin(), sourceVocId });
    expect(result).toMatchObject({ available: false, reason: 'provider_disabled', total: 0 });

    // A VOC with no vector at the active version is "not yet available", never
    // a silently empty list (ADR-0034 D2).
    const unembedded = await insertVoc(msA, adminId, 'Never embedded');
    const missing = await service.listRecommendations({
      actor: admin(),
      sourceVocId: unembedded,
    });
    expect(missing).toMatchObject({ available: false, reason: 'source_not_embedded' });
  });

  // ── (f) confirmation ───────────────────────────────────────────────────────

  it('creates exactly one cluster on confirmation and joins it on the next', async () => {
    const first = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'First confirmed',
      vector: IDENTICAL_VECTOR,
    });
    const second = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Second confirmed',
      vector: ABOVE_CUT_VECTOR,
    });

    const created = await service.confirmRecommendation({
      actor: admin(),
      sourceVocId,
      candidateVocId: first,
    });
    expect(created.body.cluster_created).toBe(true);
    expect(await clusterCountForFixtureSystems()).toBe(1);

    const joined = await service.confirmRecommendation({
      actor: admin(),
      sourceVocId,
      candidateVocId: second,
    });
    expect(joined.body.cluster_created).toBe(false);
    expect(joined.body.voc_cluster_id).toBe(created.body.voc_cluster_id);
    // Joining, not forking: a second confirmation must not open a rival cluster.
    expect(await clusterCountForFixtureSystems()).toBe(1);

    const members = await appHandle.pool.query<{ voc_id: string }>(
      `select voc_id from voc_cluster.voc_cluster_members where cluster_id = $1`,
      [created.body.voc_cluster_id],
    );
    expect(members.rows.map((row) => row.voc_id).sort()).toEqual(
      [sourceVocId, first, second].sort(),
    );

    const audit = await ops.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
        where workspace_id = $1 and event_type = 'voc_recommendation_confirmed'
          and detail->>'source_voc_id' = $2
        order by created_at`,
      [WORKSPACE_ID, sourceVocId],
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0]?.detail).toMatchObject({
      candidate_voc_id: first,
      voc_cluster_id: created.body.voc_cluster_id,
      cluster_created: true,
      embedding_version: ACTIVE_VERSION,
      primary_managed_system_id: msA,
    });
    expect(audit.rows[1]?.detail).toMatchObject({
      candidate_voc_id: second,
      cluster_created: false,
    });
  });

  it('removes a confirmed pair from later recommendations', async () => {
    const confirmed = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Confirmed candidate',
      vector: IDENTICAL_VECTOR,
    });
    const kept = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Still suggested',
      vector: ABOVE_CUT_VECTOR,
    });

    await service.confirmRecommendation({
      actor: admin(),
      sourceVocId,
      candidateVocId: confirmed,
    });

    const after = await service.listRecommendations({ actor: admin(), sourceVocId });
    expect(ids(after)).toEqual([kept]);
    expect(after.total).toBe(1);
  });

  it('refuses confirmation to an actor without finding.manage, and hides unreadable candidates', async () => {
    const readable = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Readable but unmanageable',
      vector: IDENTICAL_VECTOR,
    });
    const unreadable = await seedCandidate({
      msId: msB,
      reporterId: adminId,
      title: 'Not readable at all',
      vector: IDENTICAL_VECTOR,
    });

    // Can read the pair, cannot manage findings → permission.denied.
    await expect(
      service.confirmRecommendation({
        actor: scopedDev(),
        sourceVocId,
        candidateVocId: readable,
      }),
    ).rejects.toMatchObject({ code: 'permission.denied' });

    // Cannot read the candidate → not_found, never a permission error that
    // would confirm the id names a real VOC (ADR-0034 D4).
    await expect(
      service.confirmRecommendation({
        actor: scopedDev(),
        sourceVocId,
        candidateVocId: unreadable,
      }),
    ).rejects.toMatchObject({ code: 'not_found.record' });
    await expect(
      service.dismissRecommendation({
        actor: scopedDev(),
        sourceVocId,
        candidateVocId: unreadable,
      }),
    ).rejects.toBeInstanceOf(HttpError);

    // Neither refusal left anything behind.
    expect(await clusterCountForFixtureSystems()).toBe(0);
    const decisions = await appHandle.pool.query<{ cnt: string }>(
      `select count(*)::text as cnt from voc.voc_recommendation_decisions where source_voc_id = $1`,
      [sourceVocId],
    );
    expect(Number(decisions.rows[0]?.cnt)).toBe(0);
  });

  it('lets a scoped developer with finding.manage confirm', async () => {
    const candidate = await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Confirmed by a developer',
      vector: IDENTICAL_VECTOR,
    });

    const result = await service.confirmRecommendation({
      actor: managerDev(),
      sourceVocId,
      candidateVocId: candidate,
    });

    expect(result.body.cluster_created).toBe(true);
    expect(await clusterCountForFixtureSystems()).toBe(1);
  });

  it('refuses to confirm a pair that spans two Managed Systems', async () => {
    const crossSystem = await seedCandidate({
      msId: msB,
      reporterId: adminId,
      title: 'Different managed system',
      vector: IDENTICAL_VECTOR,
    });

    await expect(
      service.confirmRecommendation({
        actor: admin(),
        sourceVocId,
        candidateVocId: crossSystem,
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    expect(await clusterCountForFixtureSystems()).toBe(0);
  });

  // ── (g) no auto-clustering ─────────────────────────────────────────────────

  it('creates no cluster rows when recommendations are computed', async () => {
    await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Candidate one',
      vector: IDENTICAL_VECTOR,
    });
    await seedCandidate({
      msId: msA,
      reporterId: adminId,
      title: 'Candidate two',
      vector: ABOVE_CUT_VECTOR,
    });

    expect(await clusterCountForFixtureSystems()).toBe(0);
    const result = await service.listRecommendations({ actor: admin(), sourceVocId });
    expect(result.items).toHaveLength(2);

    // FR-VOC-004 criterion 2: reading recommendations is not clustering.
    expect(await clusterCountForFixtureSystems()).toBe(0);
    const memberCount = await appHandle.pool.query<{ cnt: string }>(
      `select count(*)::text as cnt from voc_cluster.voc_cluster_members
        where voc_id in (select id from voc.vocs where workspace_id = $1
                          and primary_managed_system_id = any($2::uuid[]))`,
      [WORKSPACE_ID, [msA, msB]],
    );
    expect(Number(memberCount.rows[0]?.cnt)).toBe(0);
  });
});
