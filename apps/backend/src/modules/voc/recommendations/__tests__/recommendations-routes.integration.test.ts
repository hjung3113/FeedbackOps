// HTTP seam for the ADR-0034 recommendation resource.  The service suite
// owns ranking arithmetic; this suite deliberately boots the real server and
// observes the wire contract, auth middleware, audit rows, and writes.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { vocRecommendationsResponseSchema } from '@fops/shared';

import { loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../../middleware/require-session.js';
import { buildServer } from '../../../../server.js';
import { loginAs } from '../../__tests__/_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = 'it-voc-reco-routes';
const VERSION = 1;

type InjectedResponse = { statusCode: number; json: () => Record<string, unknown> };

/**
 * ADR-0034 D4: unreadable and nonexistent must be byte-identical on the wire.
 *
 * `toEqual` compares the whole envelope rather than a subset, and the explicit
 * `not_found.record` assertion is what stops the comparison from being vacuous
 * — two empty or two identically-wrong bodies would otherwise satisfy it.
 */
function expectIndistinguishableNotFound(
  hidden: InjectedResponse,
  missing: InjectedResponse,
): void {
  expect(hidden.statusCode).toBe(404);
  expect(missing.statusCode).toBe(404);
  expect(hidden.json()).toEqual(missing.json());
  expect(hidden.json().code).toBe('not_found.record');
}

describe.skipIf(!runIntegration)('VOC recommendation HTTP routes (#168)', () => {
  let appDb: DbHandle;
  let ops: DbHandle;
  let app: FastifyInstance;
  let adminId: string;
  let managedSystemId: string;
  let sourceId: string;
  let candidateId: string;

  const headers = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.EMBEDDING_PROVIDER = 'fake';
    appDb = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    const row = await ops.pool.query<{ id: string }>(
      "select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = row.rows[0]?.id ?? '';
    if (!adminId) throw new Error('seed admin actor missing');
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  beforeEach(async () => {
    await cleanup();
    await appDb.pool.query('delete from core.rate_limits');
    const system = await appDb.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, 'Recommendation route fixture') returning id`,
      [WORKSPACE_ID, `${PREFIX}-${randomUUID().slice(0, 8)}`],
    );
    managedSystemId = system.rows[0]?.id ?? '';
    sourceId = await insertVoc('Source');
    candidateId = await insertVoc('Candidate');
    await insertEmbedding(sourceId);
    await insertEmbedding(candidateId);
  });

  async function insertVoc(title: string, reporterId?: string): Promise<string> {
    const row = await appDb.pool.query<{ id: string }>(
      `insert into voc.vocs (workspace_id, primary_managed_system_id, reporter_id, display_id,
        title, description_rich_content, source_context, reporter_facing_status, triage_state)
       values ($1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
        '{"type":"doc","content":[]}'::jsonb, 'direct_use', 'received', 'untriaged') returning id`,
      [WORKSPACE_ID, managedSystemId, reporterId ?? adminId, title],
    );
    return row.rows[0]?.id ?? '';
  }

  async function insertActor(externalId: string): Promise<string> {
    const row = await ops.pool.query<{ id: string }>(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, 'developer', 'internal_member') returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@local`],
    );
    return row.rows[0]?.id ?? '';
  }

  async function grantRead(actorId: string, systemId: string): Promise<void> {
    await ops.pool.query(
      `insert into permission.permission_grants
       (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, 'voc.read', $3, $4)`,
      [WORKSPACE_ID, actorId, systemId, adminId],
    );
  }

  async function insertEmbedding(vocId: string): Promise<void> {
    await appDb.pool.query(
      `insert into voc.voc_embeddings
       (voc_id, workspace_id, embedding_version, provider, model, dimensions, embedding, source_hash)
       values ($1, $2, $3, 'test', 'route-test', 3, '[1,0,0]'::vector, $4)`,
      [vocId, WORKSPACE_ID, VERSION, `route-${vocId}`],
    );
  }

  async function cleanup(): Promise<void> {
    if (!ops) return;
    const fixtureVocs = (idExpr: string) =>
      `select ${idExpr} from voc.vocs where workspace_id = $1 and primary_managed_system_id in
      (select id from core.managed_systems where workspace_id = $1 and slug like $2)`;
    const vocs = fixtureVocs('id');
    // `detail->>'source_voc_id'` is text and `voc.vocs.id` is uuid, so the
    // fixture ids have to be cast before the IN comparison — otherwise Postgres
    // raises `operator does not exist: text = uuid`, and cleanup runs in both
    // beforeEach and afterAll, so that takes every test in the file down.
    await ops.pool.query(
      `delete from core.audit_log where workspace_id = $1 and detail->>'source_voc_id' in (${fixtureVocs('id::text')})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await ops.pool.query(`delete from voc.voc_recommendation_decisions where source_voc_id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc_cluster.voc_cluster_members where voc_id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc.voc_embeddings where voc_id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc.vocs where id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    // Everything with a foreign key onto `core.managed_systems` has to go
    // first, or Postgres raises `permission_grants_managed_system_id_..._fk`
    // and — because cleanup runs in both beforeEach and afterAll — takes every
    // test in the file down. Of the twelve referencing tables this fixture
    // writes three: permission_grants, voc.vocs, voc_cluster.voc_clusters.
    // The grant delete is scoped by the Managed System as well as by the
    // actor, so a grant made by a non-fixture actor cannot pin the system.
    await ops.pool.query(
      `delete from permission.permission_grants
       where workspace_id = $1
         and (actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)
              or managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2))`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await ops.pool.query(`delete from core.managed_systems where workspace_id = $1 and slug like $2`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from core.sessions where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from core.actors where workspace_id = $1 and external_id like $2`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query('delete from core.rate_limits');
  }

  it('GET returns the service result that parses against the shared discriminated DTO', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const response = await app.inject({ method: 'GET', url: `/vocs/${sourceId}/recommendations`, headers: headers(cookie) });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-cache');
    const body = vocRecommendationsResponseSchema.parse(response.json());
    expect(body.available).toBe(true);
    expect(body.items.map((item) => item.voc_id)).toContain(candidateId);
  });

  it('dismisses with 204 and writes one complete dismissal audit row', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const response = await app.inject({ method: 'POST', url: `/vocs/${sourceId}/recommendations/${candidateId}/dismiss`, headers: headers(cookie) });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    const audit = await ops.pool.query<{ event_type: string; subject_type: string; subject_id: string; detail: Record<string, unknown> }>(
      `select event_type, subject_type, subject_id, detail from core.audit_log where workspace_id = $1 and event_type = 'voc_recommendation_dismissed'`, [WORKSPACE_ID],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ event_type: 'voc_recommendation_dismissed', subject_type: 'voc', subject_id: sourceId });
    expect(audit.rows[0]?.detail).toMatchObject({ source_voc_id: sourceId, candidate_voc_id: candidateId, embedding_version: VERSION, scope_key: `ms:${managedSystemId}` });
  });

  it('confirms with the cluster result and one confirmation audit row', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const response = await app.inject({ method: 'POST', url: `/vocs/${sourceId}/recommendations/${candidateId}/confirm`, headers: headers(cookie) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ cluster_created: true });
    const audit = await ops.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log where workspace_id = $1 and event_type = 'voc_recommendation_confirmed'`, [WORKSPACE_ID],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.detail).toMatchObject({ source_voc_id: sourceId, candidate_voc_id: candidateId, embedding_version: VERSION, primary_managed_system_id: managedSystemId });
  });

  it('rejects malformed identifiers before the service and missing sessions in middleware', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const malformed = await app.inject({ method: 'GET', url: '/vocs/not-a-uuid/recommendations', headers: headers(cookie) });
    expect(malformed.statusCode).toBe(422);
    expect(malformed.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['id'], code: 'invalid' }] } });
    // The candidate segment has its own guard on the POST routes; a valid :id
    // with a malformed :candidate_id must be rejected on the candidate path,
    // not blamed on `id` and not passed through to the service.
    const malformedCandidate = await app.inject({
      method: 'POST',
      url: `/vocs/${sourceId}/recommendations/not-a-uuid/dismiss`,
      headers: headers(cookie),
    });
    expect(malformedCandidate.statusCode).toBe(422);
    const candidateFields = malformedCandidate.json().detail.fields as Array<{
      path: string[];
      code: string;
    }>;
    expect(malformedCandidate.json().code).toBe('validation.failed');
    expect(candidateFields[0]).toEqual({ path: ['candidate_id'], code: 'invalid' });
    const unauthenticated = await app.inject({ method: 'GET', url: `/vocs/${sourceId}/recommendations` });
    expect(unauthenticated.statusCode).toBe(401);
  });

  it('gives an actor without source or candidate read access the same not_found shape as a nonexistent UUID', async () => {
    const externalId = `${PREFIX}-unreadable-${randomUUID().slice(0, 8)}`;
    const actorId = await insertActor(externalId);
    const cookie = await loginAs(app, externalId);
    const nonexistent = '00000000-0000-4000-8000-000000000000';
    const sourceHidden = await app.inject({ method: 'GET', url: `/vocs/${sourceId}/recommendations`, headers: headers(cookie) });
    const sourceMissing = await app.inject({ method: 'GET', url: `/vocs/${nonexistent}/recommendations`, headers: headers(cookie) });
    expectIndistinguishableNotFound(sourceHidden, sourceMissing);

    await grantRead(actorId, managedSystemId);
    const otherSystem = await appDb.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, 'Hidden candidate') returning id`,
      [WORKSPACE_ID, `${PREFIX}-${randomUUID().slice(0, 8)}`],
    );
    const hiddenCandidate = await appDb.pool.query<{ id: string }>(
      `insert into voc.vocs (workspace_id, primary_managed_system_id, reporter_id, display_id, title, description_rich_content, source_context, reporter_facing_status, triage_state)
       values ($1, $2, $3, voc.next_voc_display_id($1::uuid), 'Hidden candidate', '{"type":"doc","content":[]}'::jsonb, 'direct_use', 'received', 'untriaged') returning id`,
      [WORKSPACE_ID, otherSystem.rows[0]?.id, adminId],
    );
    const hiddenCandidateId = hiddenCandidate.rows[0]?.id;
    // ADR-0034 D4 covers all three routes, so the confirm route is checked on
    // the same fixture rather than assumed to inherit dismiss's behaviour.
    for (const action of ['dismiss', 'confirm'] as const) {
      const candidateHidden = await app.inject({ method: 'POST', url: `/vocs/${sourceId}/recommendations/${hiddenCandidateId}/${action}`, headers: headers(cookie) });
      const candidateMissing = await app.inject({ method: 'POST', url: `/vocs/${sourceId}/recommendations/${nonexistent}/${action}`, headers: headers(cookie) });
      expectIndistinguishableNotFound(candidateHidden, candidateMissing);
    }
  });

  it('rejects a cross-managed-system confirmation without a cluster or decision row', async () => {
    const otherSystem = await appDb.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name) values ($1, $2, 'Cross-system') returning id`,
      [WORKSPACE_ID, `${PREFIX}-${randomUUID().slice(0, 8)}`],
    );
    const row = await appDb.pool.query<{ id: string }>(
      `insert into voc.vocs (workspace_id, primary_managed_system_id, reporter_id, display_id, title, description_rich_content, source_context, reporter_facing_status, triage_state)
       values ($1, $2, $3, voc.next_voc_display_id($1::uuid), 'Cross candidate', '{"type":"doc","content":[]}'::jsonb, 'direct_use', 'received', 'untriaged') returning id`,
      [WORKSPACE_ID, otherSystem.rows[0]?.id, adminId],
    );
    const cookie = await loginAs(app, 'mock-admin-1');
    const response = await app.inject({ method: 'POST', url: `/vocs/${sourceId}/recommendations/${row.rows[0]?.id}/confirm`, headers: headers(cookie) });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['candidate_voc_id'], code: 'out_of_scope' }] } });
    const decisions = await ops.pool.query(`select 1 from voc.voc_recommendation_decisions where source_voc_id = $1`, [sourceId]);
    expect(decisions.rows).toHaveLength(0);
    // The rejection happens before the cluster service is reached, so neither
    // Managed System may end up with a cluster row: a decision-only assertion
    // would still pass if confirmation created the cluster and then failed.
    const clusters = await ops.pool.query(
      `select 1 from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id = any($2::uuid[])`,
      [WORKSPACE_ID, [managedSystemId, otherSystem.rows[0]?.id]],
    );
    expect(clusters.rows).toHaveLength(0);
  });

  it('lets an actor with no voc.read grant reach recommendations for a VOC they reported', async () => {
    // ADR-0031's rule is a disjunction: scope OR reporter. The other tests
    // cover an actor with scope and an actor with neither; this is the arm
    // where the actor holds no grant on the Managed System at all.
    const externalId = `${PREFIX}-reporter-${randomUUID().slice(0, 8)}`;
    const reporterId = await insertActor(externalId);
    const reportedId = await insertVoc('Reported by the unscoped actor', reporterId);
    await insertEmbedding(reportedId);
    const cookie = await loginAs(app, externalId);

    const grants = await ops.pool.query(
      `select 1 from permission.permission_grants where actor_id = $1 and capability = 'voc.read'`,
      [reporterId],
    );
    expect(grants.rows).toHaveLength(0);

    const own = await app.inject({ method: 'GET', url: `/vocs/${reportedId}/recommendations`, headers: headers(cookie) });
    expect(own.statusCode).toBe(200);
    expect(vocRecommendationsResponseSchema.parse(own.json()).available).toBe(true);

    // Control: the same actor still cannot reach a VOC of the same Managed
    // System that someone else reported, so the 200 above is the reporter arm
    // and not a missing check.
    const notTheirs = await app.inject({ method: 'GET', url: `/vocs/${sourceId}/recommendations`, headers: headers(cookie) });
    expect(notTheirs.statusCode).toBe(404);
  });

  it('boots an explicitly disabled provider and reports provider_disabled', async () => {
    const disabled = await buildServer({ config: { ...loadConfig(), EMBEDDING_PROVIDER: 'disabled' }, dbHandle: appDb });
    await disabled.ready();
    const cookie = await loginAs(disabled, 'mock-admin-1');
    const response = await disabled.inject({ method: 'GET', url: `/vocs/${sourceId}/recommendations`, headers: headers(cookie) });
    expect(response.statusCode).toBe(200);
    expect(vocRecommendationsResponseSchema.parse(response.json())).toMatchObject({ available: false, reason: 'provider_disabled', items: [], total: 0 });
    await disabled.close();
  });
});
