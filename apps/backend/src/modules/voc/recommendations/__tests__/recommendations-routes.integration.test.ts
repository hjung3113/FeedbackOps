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

  async function insertVoc(title: string): Promise<string> {
    const row = await appDb.pool.query<{ id: string }>(
      `insert into voc.vocs (workspace_id, primary_managed_system_id, reporter_id, display_id,
        title, description_rich_content, source_context, reporter_facing_status, triage_state)
       values ($1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
        '{"type":"doc","content":[]}'::jsonb, 'direct_use', 'received', 'untriaged') returning id`,
      [WORKSPACE_ID, managedSystemId, adminId, title],
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
    const vocs = `select id from voc.vocs where workspace_id = $1 and primary_managed_system_id in
      (select id from core.managed_systems where workspace_id = $1 and slug like $2)`;
    await ops.pool.query(
      `delete from core.audit_log where workspace_id = $1 and detail->>'source_voc_id' in (${vocs})`,
      [WORKSPACE_ID, `${PREFIX}%`],
    );
    await ops.pool.query(`delete from voc.voc_recommendation_decisions where source_voc_id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc_cluster.voc_cluster_members where voc_id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc_cluster.voc_clusters where workspace_id = $1 and primary_managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc.voc_embeddings where voc_id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from voc.vocs where id in (${vocs})`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from core.managed_systems where workspace_id = $1 and slug like $2`, [WORKSPACE_ID, `${PREFIX}%`]);
    await ops.pool.query(`delete from permission.permission_grants where actor_id in (select id from core.actors where workspace_id = $1 and external_id like $2)`, [WORKSPACE_ID, `${PREFIX}%`]);
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
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['id'], code: 'invalid' }] } });
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
    expect(sourceHidden.statusCode).toBe(404);
    expect(sourceHidden.json()).toMatchObject({
      code: sourceMissing.json().code,
      message: sourceMissing.json().message,
      detail: sourceMissing.json().detail,
    });

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
    const candidateHidden = await app.inject({ method: 'POST', url: `/vocs/${sourceId}/recommendations/${hiddenCandidate.rows[0]?.id}/dismiss`, headers: headers(cookie) });
    const candidateMissing = await app.inject({ method: 'POST', url: `/vocs/${sourceId}/recommendations/${nonexistent}/dismiss`, headers: headers(cookie) });
    expect(candidateHidden.statusCode).toBe(404);
    expect(candidateHidden.json()).toMatchObject({
      code: candidateMissing.json().code,
      message: candidateMissing.json().message,
      detail: candidateMissing.json().detail,
    });
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
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: ['candidate_voc_id'], code: 'out_of_scope' }] } });
    const decisions = await ops.pool.query(`select 1 from voc.voc_recommendation_decisions where source_voc_id = $1`, [sourceId]);
    expect(decisions.rows).toHaveLength(0);
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
