import { type VocDetailEnvelope, vocDetailEnvelopeSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildEntityLinkProviders } from '../../../entity-link-providers.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { randomUUID, uid } from '../../../test-support/ids.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertTaskRequestRow, insertTaskRow } from '../../../test-support/task-fixtures.js';
import {
  cleanupVocClusterFixtures,
  insertVocClusterMemberRow,
  insertVocClusterRow,
} from '../../../test-support/voc-cluster-fixtures.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createEntityLink, createEntityLinksService } from '../../entity-links/index.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createVocReadService } from '../read-service.js';

const workspaceId = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL_MIGRATE && workspaceId,
);

describe.skipIf(!runIntegration)('VOC detail follow-up provenance (#1225)', () => {
  let db: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let cookie: string;
  let reporterCookie: string;
  let readOnlyCookie: string;
  const actorIds: string[] = [];
  const grantIds: string[] = [];
  let actorId: string;
  let reporterId: string;
  let msId: string;
  const vocIds: string[] = [];
  const clusterIds: string[] = [];
  const findingIds: string[] = [];
  const taskIds: string[] = [];
  const requestIds: string[] = [];

  beforeAll(async () => {
    db = createDb(process.env.DATABASE_URL ?? '');
    migrate = createDb(process.env.DATABASE_URL_MIGRATE ?? '');
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    cookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');
    const actors = await db.pool.query<{ id: string; external_id: string }>(
      'select id, external_id from core.actors where workspace_id=$1 and external_id=any($2::text[])',
      [workspaceId, ['mock-admin-1', 'mock-user-1']],
    );
    actorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    reporterId = actors.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    msId = await insertMsDirectly(db, workspaceId, uid('detail-follow-up'), 'Follow-up MS');
    const developer = await insertDevActor(db, workspaceId, uid('follow-up-reader'));
    actorIds.push(developer.id);
    grantIds.push(await grantCapability(db, workspaceId, developer.id, 'voc.read', msId, actorId));
    readOnlyCookie = await loginAs(app, developer.externalId);
  });

  beforeEach(async () => {
    await db.pool.query('delete from core.rate_limits');
  });

  afterAll(async () => {
    await app?.close();
    if (migrate) {
      await migrate.pool.query(
        'delete from permission.permission_denies where actor_id=any($1::uuid[])',
        [actorIds],
      );
      await migrate.pool.query(
        'delete from core.entity_links where source_id=any($1::uuid[]) or target_id=any($1::uuid[])',
        [[...vocIds, ...requestIds, ...taskIds]],
      );
      await migrate.pool.query('delete from task.tasks where id=any($1::uuid[])', [taskIds]);
      await migrate.pool.query('delete from task_request.task_requests where id=any($1::uuid[])', [
        requestIds,
      ]);
      await cleanupVocClusterFixtures(migrate, {
        workspaceId,
        actorIds,
        permissionGrantIds: grantIds,
        managedSystemIds: [msId],
        clusterIds,
        findingIds,
        vocIds,
      });
    }
    await db?.close();
    await migrate?.close();
  });

  it.each(['cluster', 'direct', 'none'] as const)(
    'agrees with the no-link queue for %s follow-up',
    async (origin) => {
      const voc = await insertVocDirectly(db, workspaceId, msId, reporterId, `Follow-up ${origin}`);
      vocIds.push(voc.id);
      let findingId: string | null = null;
      let clusterId: string | null = null;
      if (origin !== 'none') {
        if (origin === 'cluster') {
          const cluster = await insertVocClusterRow(db, {
            workspaceId,
            primaryManagedSystemId: msId,
            createdBy: actorId,
          });
          clusterIds.push(cluster.id);
          clusterId = cluster.id;
          await insertVocClusterMemberRow(db, { clusterId, vocId: voc.id, addedBy: actorId });
        }
        const finding = await insertFindingRow(db, {
          workspaceId,
          primaryManagedSystemId: msId,
          sourceType: origin === 'cluster' ? 'voc_cluster' : 'voc',
          sourceId: clusterId ?? voc.id,
          createdBy: actorId,
        });
        findingIds.push(finding.id);
        findingId = finding.id;
        await db.db.transaction((tx) =>
          createEntityLink(tx, {
            workspaceId,
            sourceType: origin === 'cluster' ? 'voc_cluster' : 'voc',
            sourceId: clusterId ?? voc.id,
            targetType: 'finding',
            targetId: finding.id,
            relationType: 'evidence_of',
            managedSystemId: msId,
            createdBy: actorId,
            visibility: 'internal_only',
          }),
        );
      }
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
      const detail = await app.inject({ method: 'GET', url: `/vocs/${voc.id}`, headers });
      expect(detail.statusCode).toBe(200);
      const body = vocDetailEnvelopeSchema.parse(detail.json());
      if (findingId) {
        expect(body.linked_execution.findingRef).toEqual({ type: 'finding', id: findingId });
        expect(body.linked_execution.trails?.[0]).toMatchObject({
          origin,
          links: [expect.objectContaining({ target_id: findingId, visibility_state: 'allowed' })],
        });
        if (clusterId) {
          expect(body.linked_execution.trails?.[0]?.cluster).toMatchObject({
            type: 'voc_cluster',
            id: clusterId,
          });
          expect(body.links).toEqual([]);
        }
      } else {
        expect(body.linked_execution).toEqual({ findingRef: null, taskRef: null });
      }
      const queue = await app.inject({
        method: 'GET',
        url: `/vocs?view=inbox&tab=no-link&managed_system_id=${msId}`,
        headers,
      });
      expect(queue.statusCode).toBe(200);
      expect(queue.json<{ items: { id: string }[] }>().items.some((row) => row.id === voc.id)).toBe(
        origin === 'none',
      );
      const hidden = await app.inject({
        method: 'GET',
        url: `/vocs/${voc.id}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${reporterCookie}` },
      });
      expect(hidden.statusCode).toBe(200);
      expect(hidden.json<VocDetailEnvelope>().linked_execution).toEqual({
        findingRef: null,
        taskRef: null,
      });
      const scoped = await app.inject({
        method: 'GET',
        url: `/vocs/${voc.id}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${readOnlyCookie}` },
      });
      expect(scoped.statusCode).toBe(200);
      expect(scoped.json<VocDetailEnvelope>().linked_execution).toEqual({
        findingRef: null,
        taskRef: null,
      });
    },
  );
  it.each(['bare membership', 'hidden execution'] as const)(
    'does not disclose a Cluster to a granted User with %s',
    async (shape) => {
      const externalId = uid('follow-up-granted-user');
      const user = await insertActorRow(db, { workspaceId, externalId, roleLevel: 'user' });
      actorIds.push(user.id);
      grantIds.push(await grantCapability(db, workspaceId, user.id, 'finding.read', msId, actorId));
      const userCookie = await loginAs(app, externalId);
      const voc = await insertVocDirectly(db, workspaceId, msId, user.id, 'User-owned VOC');
      vocIds.push(voc.id);
      const title = uid('Private Cluster');
      const summary = uid('Private Cluster summary');
      const cluster = await insertVocClusterRow(db, {
        workspaceId,
        primaryManagedSystemId: msId,
        createdBy: actorId,
        title,
        summary,
      });
      clusterIds.push(cluster.id);
      await insertVocClusterMemberRow(db, {
        clusterId: cluster.id,
        vocId: voc.id,
        addedBy: actorId,
      });
      if (shape === 'hidden execution') {
        const finding = await insertFindingRow(db, {
          workspaceId,
          primaryManagedSystemId: msId,
          sourceType: 'voc_cluster',
          sourceId: cluster.id,
          createdBy: actorId,
        });
        findingIds.push(finding.id);
        await db.db.transaction((tx) =>
          createEntityLink(tx, {
            workspaceId,
            sourceType: 'voc_cluster',
            sourceId: cluster.id,
            targetType: 'finding',
            targetId: finding.id,
            relationType: 'evidence_of',
            managedSystemId: msId,
            createdBy: actorId,
            visibility: 'internal_only',
          }),
        );
      }
      const headers = { cookie: `${SESSION_COOKIE_NAME}=${userCookie}` };
      const clusterResponse = await app.inject({
        method: 'GET',
        url: `/voc-clusters/${cluster.id}`,
        headers,
      });
      expect(clusterResponse.statusCode).toBe(404);
      const response = await app.inject({ method: 'GET', url: `/vocs/${voc.id}`, headers });
      expect(response.statusCode).toBe(200);
      const body = vocDetailEnvelopeSchema.parse(response.json());
      expect(body.linked_execution).toEqual({ findingRef: null, taskRef: null });
      expect(body.links).toEqual([]);
      for (const secret of [cluster.id, cluster.display_id, title, summary]) {
        expect(response.body).not.toContain(secret);
      }
    },
  );

  it('retains multiple Clusters and every Finding/Request/Task branch without convenience columns', async () => {
    const voc = await insertVocDirectly(db, workspaceId, msId, reporterId, 'Branched follow-up');
    vocIds.push(voc.id);
    const expectedTargets: string[] = [];
    for (const kind of ['finding', 'task_request'] as const) {
      const cluster = await insertVocClusterRow(db, {
        workspaceId,
        primaryManagedSystemId: msId,
        createdBy: actorId,
      });
      clusterIds.push(cluster.id);
      await insertVocClusterMemberRow(db, {
        clusterId: cluster.id,
        vocId: voc.id,
        addedBy: actorId,
      });
      const finding =
        kind === 'finding'
          ? await insertFindingRow(db, {
              workspaceId,
              primaryManagedSystemId: msId,
              sourceType: 'voc_cluster',
              sourceId: cluster.id,
              createdBy: actorId,
            })
          : null;
      if (finding) findingIds.push(finding.id);
      const request = await insertTaskRequestRow(db, {
        workspaceId,
        primaryManagedSystemId: msId,
        sourceType: finding ? 'finding' : 'voc_cluster',
        sourceId: finding?.id ?? cluster.id,
        requesterActorId: actorId,
      });
      requestIds.push(request.id);
      expectedTargets.push(request.id);
      await db.db.transaction(async (tx) => {
        await createEntityLink(tx, {
          workspaceId,
          sourceType: 'voc_cluster',
          sourceId: cluster.id,
          targetType: kind,
          targetId: finding?.id ?? request.id,
          relationType: finding ? 'evidence_of' : 'requested_task',
          managedSystemId: msId,
          createdBy: actorId,
          visibility: 'internal_only',
        });
        if (finding) {
          expectedTargets.push(finding.id);
          await createEntityLink(tx, {
            workspaceId,
            sourceType: 'finding',
            sourceId: finding.id,
            targetType: 'task_request',
            targetId: request.id,
            relationType: 'requested_task',
            managedSystemId: msId,
            createdBy: actorId,
            visibility: 'internal_only',
          });
        }
        // The Cluster Request deliberately has no downstream Task: it already is follow-up.
        if (!finding) return;
        for (const sourceType of ['finding', 'task_request'] as const) {
          const task = await insertTaskRow(db, {
            workspaceId,
            primaryManagedSystemId: msId,
            createdBy: actorId,
          });
          taskIds.push(task.id);
          expectedTargets.push(task.id);
          await createEntityLink(tx, {
            workspaceId,
            sourceType,
            sourceId: sourceType === 'finding' ? finding.id : request.id,
            targetType: 'task',
            targetId: task.id,
            relationType: sourceType === 'finding' ? 'requested_task' : 'converted_to',
            managedSystemId: msId,
            createdBy: actorId,
            visibility: 'internal_only',
          });
        }
      });
    }
    const response = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(response.statusCode).toBe(200);
    const detail = vocDetailEnvelopeSchema.parse(response.json());
    expect(detail.links).toEqual([]);
    const taskQueue = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&tab=no-task&managed_system_id=${msId}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(taskQueue.statusCode).toBe(200);
    expect(
      taskQueue.json<{ items: { id: string }[] }>().items.some((row) => row.id === voc.id),
    ).toBe(true);
    expect(detail.linked_execution.trails).toHaveLength(2);
    const links = detail.linked_execution.trails?.flatMap((trail) => trail.links) ?? [];
    expect(
      links.flatMap((link) => (link.visibility_state === 'allowed' ? [link.target_id] : [])).sort(),
    ).toEqual(expectedTargets.sort());
    const generic = await app.inject({
      method: 'GET',
      url: `/entity-links?source_type=voc_cluster&source_id=${clusterIds.at(-2)}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(generic.statusCode).toBe(200);
    expect(generic.json<{ items: unknown[] }>().items).toEqual([]);
  });

  it('shows bare membership without classifying it as execution', async () => {
    const voc = await insertVocDirectly(db, workspaceId, msId, reporterId, 'Membership only');
    vocIds.push(voc.id);
    const cluster = await insertVocClusterRow(db, {
      workspaceId,
      primaryManagedSystemId: msId,
      createdBy: actorId,
    });
    clusterIds.push(cluster.id);
    await insertVocClusterMemberRow(db, { clusterId: cluster.id, vocId: voc.id, addedBy: actorId });
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}` };
    const detail = await app.inject({ method: 'GET', url: `/vocs/${voc.id}`, headers });
    expect(detail.statusCode).toBe(200);
    expect(vocDetailEnvelopeSchema.parse(detail.json()).linked_execution).toMatchObject({
      findingRef: null,
      taskRef: null,
      trails: [{ origin: 'cluster', cluster: { id: cluster.id }, links: [] }],
    });
    const queue = await app.inject({
      method: 'GET',
      url: `/vocs?view=inbox&tab=no-link&managed_system_id=${msId}`,
      headers,
    });
    expect(queue.json<{ items: { id: string }[] }>().items.some((row) => row.id === voc.id)).toBe(
      true,
    );
  });

  it('post-write FULL projection observes a link inserted in the supplied transaction', async () => {
    const voc = await insertVocDirectly(db, workspaceId, msId, reporterId, 'Transaction follow-up');
    vocIds.push(voc.id);
    const finding = await insertFindingRow(db, {
      workspaceId,
      primaryManagedSystemId: msId,
      sourceId: voc.id,
      createdBy: actorId,
    });
    findingIds.push(finding.id);
    const checkService = createCheckService({ db: db.db });
    const entityLinksService = createEntityLinksService({
      db: db.db,
      checkService,
      auditService: createAuditService(),
      providers: buildEntityLinkProviders(),
    });
    const reader = createVocReadService({ db: db.db, checkService, entityLinksService });
    await db.db.transaction(async (tx) => {
      await createEntityLink(tx, {
        workspaceId,
        sourceType: 'voc',
        sourceId: voc.id,
        targetType: 'finding',
        targetId: finding.id,
        relationType: 'created_finding',
        managedSystemId: msId,
        createdBy: actorId,
        visibility: 'internal_only',
      });
      const envelope = await reader.composeDetailEnvelope({
        tx,
        actor: { actor_id: actorId, workspace_id: workspaceId, role_level: 'admin' },
        vocId: voc.id,
      });
      expect('linked_execution' in envelope && envelope.linked_execution.findingRef).toEqual({
        type: 'finding',
        id: finding.id,
      });
      expect('links' in envelope && envelope.links).toEqual([
        expect.objectContaining({ target_id: finding.id }),
      ]);
    });
    const result = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json<VocDetailEnvelope>().linked_execution.findingRef).toEqual({
      type: 'finding',
      id: finding.id,
    });
  });
  it('preserves explicit Admin voc.read denial and post-write SUMMARY projection', async () => {
    const externalId = uid('follow-up-denied-admin');
    const admin = await insertActorRow(db, { workspaceId, externalId, roleLevel: 'admin' });
    actorIds.push(admin.id);
    await denyCapability(db, workspaceId, admin.id, 'voc.read', msId, actorId);
    const deniedCookie = await loginAs(app, externalId);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${deniedCookie}` };
    const vocId = vocIds[0];
    const result = await app.inject({ method: 'GET', url: `/vocs/${vocId}`, headers });
    expect(result.statusCode).toBe(200);
    expect(result.json()).not.toHaveProperty('linked_execution');
    expect(result.json()).not.toHaveProperty('title');
    const write = await app.inject({
      method: 'POST',
      url: `/vocs/${vocId}/public-updates`,
      headers: { ...headers, 'idempotency-key': randomUUID() },
      payload: {
        skip_public_update: false,
        next_reporter_facing_status: 'received',
        body_rich_content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '진행 상황' }] }],
        },
      },
    });
    expect(write.statusCode).toBe(201);
    expect(write.json().voc).not.toHaveProperty('linked_execution');
    expect(write.json().voc).not.toHaveProperty('title');
  });
});
