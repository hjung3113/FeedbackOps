import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { loginAs } from '../../voc/__tests__/_seed-helpers.js';
import { insertActorRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const SLUG_PREFIX = 'it-cluster-fields';

describe.skipIf(!runIntegration)('VOC cluster workspace fields', () => {
  let appDb: DbHandle;
  let migrateDb: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let adminId: string;
  let ownerId: string;
  let managedSystemId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');

    const admin = await appDb.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id = $1 and external_id = 'mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('seed admin actor not found');

    ownerId = (
      await insertActorRow(migrateDb, {
        workspaceId: WORKSPACE_ID,
        externalId: `${SLUG_PREFIX}-owner-${randomUUID()}`,
        roleLevel: 'developer',
      })
    ).id;
    const ms = await migrateDb.pool.query<{ id: string }>(
      `insert into core.managed_systems (workspace_id, slug, name)
       values ($1, $2, $3) returning id`,
      [WORKSPACE_ID, `${SLUG_PREFIX}-${randomUUID()}`, 'Cluster fields MS'],
    );
    managedSystemId = ms.rows[0]?.id ?? '';
    if (!managedSystemId) throw new Error('seed managed system failed');
  });

  beforeEach(async () => {
    await cleanupClusters();
  });

  afterAll(async () => {
    await cleanupClusters();
    if (migrateDb) {
      await migrateDb.pool.query('delete from core.managed_systems where id = $1', [
        managedSystemId,
      ]);
      await migrateDb.pool.query('delete from core.actors where id = $1', [ownerId]);
    }
    await app?.close();
    await appDb?.close();
    await migrateDb?.close();
  });

  async function cleanupClusters(): Promise<void> {
    if (!migrateDb) return;
    await migrateDb.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and subject_id in (
            select id from voc_cluster.voc_clusters
             where primary_managed_system_id = $2
          )`,
      [WORKSPACE_ID, managedSystemId],
    );
    await migrateDb.pool.query(
      'delete from voc_cluster.voc_clusters where primary_managed_system_id = $1',
      [managedSystemId],
    );
    await migrateDb.pool.query(
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
  }

  function headers(): Record<string, string> {
    return {
      cookie: `${SESSION_COOKIE_NAME}=${adminCookie}`,
      'content-type': 'application/json',
    };
  }

  function createCluster(title: string, extra: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/voc-clusters',
      headers: headers(),
      payload: {
        title,
        primary_managed_system_id: managedSystemId,
        ...extra,
      },
    });
  }

  function updateCluster(clusterId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'PATCH',
      url: `/voc-clusters/${clusterId}`,
      headers: headers(),
      payload,
    });
  }

  it('returns workspace fields through create, list, detail, and update envelopes', async () => {
    const created = await createCluster('All workspace fields', {
      summary: 'Summary',
      severity: 'critical',
      confidence: 'high',
      rationale: 'Repeated impact across accounts',
      owner_user_id: ownerId,
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json<{ id: string }>();
    expect(createdBody).toMatchObject({
      severity: 'critical',
      confidence: 'high',
      rationale: 'Repeated impact across accounts',
      owner_user_id: ownerId,
      confirmed_by: null,
      confirmed_at: null,
    });

    const list = await app.inject({
      method: 'GET',
      url: `/voc-clusters?managed_system_id=${managedSystemId}`,
      headers: headers(),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json<{ items: unknown[] }>().items).toEqual([
      expect.objectContaining({
        id: createdBody.id,
        severity: 'critical',
        confidence: 'high',
        rationale: 'Repeated impact across accounts',
        owner_user_id: ownerId,
        confirmed_by: null,
        confirmed_at: null,
      }),
    ]);

    const detail = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${createdBody.id}`,
      headers: headers(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: createdBody.id,
      severity: 'critical',
      confidence: 'high',
      rationale: 'Repeated impact across accounts',
      owner_user_id: ownerId,
      confirmed_by: null,
      confirmed_at: null,
    });

    const updated = await updateCluster(createdBody.id, {
      severity: 'high',
      confidence: 'medium',
      rationale: 'Corroborated by three VOCs',
      owner_user_id: null,
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      severity: 'high',
      confidence: 'medium',
      rationale: 'Corroborated by three VOCs',
      owner_user_id: null,
    });

    const audit = await migrateDb.pool.query<{ detail: Record<string, unknown> }>(
      `select detail from core.audit_log
       where subject_id = $1 and event_type = 'voc_cluster_updated'`,
      [createdBody.id],
    );
    expect(audit.rows[0]?.detail).toMatchObject({
      changes: {
        severity: { from: 'critical', to: 'high' },
        confidence: { from: 'high', to: 'medium' },
        rationale: { from: 'Repeated impact across accounts', to: 'Corroborated by three VOCs' },
        owner_user_id: { from: ownerId, to: null },
      },
    });
  });

  it('emits nullable fields instead of fabricated defaults', async () => {
    const created = await createCluster('No workspace fields');
    expect(created.statusCode).toBe(201);
    const body = created.json<{ id: string }>();
    const nullShape = {
      severity: null,
      confidence: null,
      rationale: null,
      owner_user_id: null,
      confirmed_by: null,
      confirmed_at: null,
    };
    expect(body).toMatchObject(nullShape);

    const detail = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${body.id}`,
      headers: headers(),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject(nullShape);
  });

  it.each([
    ['severity', 'urgent'],
    ['confidence', 'certain'],
  ])('rejects invalid %s through route validation', async (field, value) => {
    const response = await createCluster(`Invalid ${field}`, { [field]: value });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('rejects a nonexistent owner_user_id through the create route', async () => {
    const response = await createCluster('Bad owner', { owner_user_id: randomUUID() });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it.each(['confirmed_by', 'confirmed_at'])('rejects client writes to %s', async (field) => {
    const created = await createCluster(`Reject ${field}`);
    expect(created.statusCode).toBe(201);
    const value = field === 'confirmed_by' ? ownerId : new Date().toISOString();
    const response = await updateCluster(created.json<{ id: string }>().id, { [field]: value });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ code: string }>().code).toBe('validation.failed');
  });

  it('records immutable confirmation provenance through the update route', async () => {
    const created = await createCluster('Confirm cluster');
    expect(created.statusCode).toBe(201);
    const clusterId = created.json<{ id: string }>().id;

    const first = await updateCluster(clusterId, { status: 'confirmed' });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json<{ confirmed_by: string; confirmed_at: string }>();
    expect(firstBody.confirmed_by).toBe(adminId);
    expect(firstBody.confirmed_at).toEqual(expect.any(String));

    const second = await updateCluster(clusterId, { status: 'confirmed' });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      confirmed_by: adminId,
      confirmed_at: firstBody.confirmed_at,
    });
  });

  it.each([
    ['severity', 'urgent', 'voc_clusters_severity_check'],
    ['confidence', 'certain', 'voc_clusters_confidence_check'],
  ] as const)('enforces the %s database CHECK', async (field, value, constraint) => {
    await expect(
      migrateDb.pool.query(
        `insert into voc_cluster.voc_clusters
          (workspace_id, display_id, title, primary_managed_system_id, created_by, ${field})
         values ($1, $2, $3, $4, $5, $6)`,
        [WORKSPACE_ID, `CL-${randomUUID()}`, 'Invalid enum DB', managedSystemId, adminId, value],
      ),
    ).rejects.toMatchObject({ constraint });
  });
});
