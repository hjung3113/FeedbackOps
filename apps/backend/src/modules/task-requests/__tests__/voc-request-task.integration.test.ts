// VOC / VOC Cluster -> Task Request creation (#136).
//
// Gate: DATABASE_URL + DATABASE_URL_MIGRATE + WORKSPACE_ID. The conductor runs
// this outside the sandbox after applying migration 0026.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly, insertTeamDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  expireCapabilityGrant,
  grantCapability,
  revokeCapabilityGrant,
} from '../../../test-support/permissions-fixtures.js';
import { insertVocClusterRow } from '../../../test-support/voc-cluster-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG_PREFIX = 'it-voc-request-task';

type SourceKind = 'voc' | 'voc_cluster' | 'finding';

describe.skipIf(!runIntegration)('voc request-task source creation (#136)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let adminCookie: string;
  let userCookie: string;
  let adminActorId: string;
  let userActorId: string;
  const teamIds: string[] = [];
  const foreignWorkspaceIds: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    adminCookie = await loginAs(app, 'mock-admin-1');
    userCookie = await loginAs(app, 'mock-user-1');

    const actors = await dbHandle.pool.query<{ id: string; external_id: string }>(
      `select id, external_id
         from core.actors
        where workspace_id = $1
          and external_id in ('mock-admin-1', 'mock-user-1')`,
      [WORKSPACE_ID],
    );
    adminActorId = actors.rows.find((row) => row.external_id === 'mock-admin-1')?.id ?? '';
    userActorId = actors.rows.find((row) => row.external_id === 'mock-user-1')?.id ?? '';
    if (!adminActorId || !userActorId) throw new Error('seed actors not found');
  });

  beforeEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  async function cleanupFixtures(): Promise<void> {
    if (!migrateHandle) return;
    await migrateHandle.pool.query(
      `delete from core.audit_log
        where workspace_id = $1
          and event_type in (
            'task_request_created_from_voc',
            'task_request_created_from_voc_cluster',
            'entity_link.created'
          )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and relation_type = 'requested_task'
          and source_type in ('voc', 'voc_cluster')`,
      [WORKSPACE_ID],
    );
    // Responsibility cases also create other link kinds on the fixture systems.
    await migrateHandle.pool.query(
      `delete from core.entity_links
        where workspace_id = $1
          and managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from task_request.task_requests
        where workspace_id = $1
          and primary_managed_system_id in (
            select id from core.managed_systems where workspace_id = $1 and slug like $2
          )`,
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      `delete from permission.permission_grants
        where workspace_id = $1
          and actor_id in (
            select id from core.actors
             where workspace_id = $1
               and (external_id like 'mock-dev-read-%' or external_id = 'mock-user-1')
          )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.idempotency_keys
        where actor_id in (
          select id from core.actors
           where workspace_id = $1
             and (
               external_id in ('mock-admin-1', 'mock-user-1')
               or external_id like 'mock-dev-read-%'
             )
        )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from core.rate_limits
        where key like $1 || ':%'
           or key like '127.0.0.%'`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query(
      `delete from voc_cluster.voc_cluster_members
        where cluster_id in (
          select id from voc_cluster.voc_clusters where workspace_id = $1
        )`,
      [WORKSPACE_ID],
    );
    await migrateHandle.pool.query('delete from voc_cluster.voc_clusters where workspace_id = $1', [
      WORKSPACE_ID,
    ]);
    await migrateHandle.pool.query(
      'delete from finding.findings where workspace_id = $1 and primary_managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await migrateHandle.pool.query(
      'delete from core.responsibility_default_failures where workspace_id = $1 and managed_system_id in (select id from core.managed_systems where workspace_id = $1 and slug like $2)',
      [WORKSPACE_ID, `${SLUG_PREFIX}%`],
    );
    await cleanupReadTestTables(dbHandle, WORKSPACE_ID, SLUG_PREFIX);
    await migrateHandle.pool.query('delete from core.teams where id = any($1::uuid[])', [teamIds]);
    teamIds.length = 0;
    await migrateHandle.pool.query('delete from core.workspaces where id = any($1::uuid[])', [
      foreignWorkspaceIds,
    ]);
    foreignWorkspaceIds.length = 0;
  }

  async function seedVocSource(): Promise<{ id: string; msId: string }> {
    const msId = await insertMsDirectly(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX), 'VOC Request MS');
    const voc = await insertVocDirectly(
      dbHandle,
      WORKSPACE_ID,
      msId,
      userActorId,
      'VOC source for task request',
    );
    return { id: voc.id, msId };
  }

  async function seedClusterSource(): Promise<{ id: string; msId: string }> {
    const msId = await insertMsDirectly(
      dbHandle,
      WORKSPACE_ID,
      uid(SLUG_PREFIX),
      'Cluster Request MS',
    );
    const cluster = await insertVocClusterRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      title: 'Cluster source for task request',
      summary: 'Repeated timeout complaints',
      status: 'confirmed',
      primaryManagedSystemId: msId,
      createdBy: adminActorId,
    });
    return { id: cluster.id, msId };
  }

  async function seedFindingSource() {
    const voc = await seedVocSource();
    const finding = await insertFindingRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: voc.msId,
      sourceId: voc.id,
      createdBy: adminActorId,
    });
    return { id: finding.id, msId: voc.msId };
  }

  function requestTask(
    cookie: string,
    source: SourceKind,
    sourceId: string,
    idempotencyKey = randomUUID(),
    responsibility: Record<string, string | null> = {},
  ) {
    const path =
      source === 'voc'
        ? `/vocs/${sourceId}/request-task`
        : source === 'finding'
          ? `/findings/${sourceId}/request-task`
          : `/voc-clusters/${sourceId}/request-task`;
    return app.inject({
      method: 'POST',
      url: path,
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      payload: {
        ...responsibility,
        evidence_summary: `${source} evidence summary`,
        requested_outcome: `${source} requested outcome`,
      },
    });
  }

  function listTaskRequests(cookie: string) {
    return app.inject({
      method: 'GET',
      url: '/task-requests?status=pending_review',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
  }

  async function assertCreatedRequest(input: {
    source: SourceKind;
    sourceId: string;
    taskRequestId: string;
    msId: string;
  }): Promise<void> {
    const sourceColumn = input.source === 'voc' ? 'source_voc_id' : 'source_voc_cluster_id';
    const auditType =
      input.source === 'voc'
        ? 'task_request_created_from_voc'
        : 'task_request_created_from_voc_cluster';

    const rows = await dbHandle.pool.query<{
      source_type: string;
      source_id: string;
      status: string;
      primary_managed_system_id: string;
    }>(
      `select source_type, source_id, status, primary_managed_system_id
         from task_request.task_requests
        where id = $1 and workspace_id = $2`,
      [input.taskRequestId, WORKSPACE_ID],
    );
    expect(rows.rows[0]).toMatchObject({
      source_type: input.source,
      source_id: input.sourceId,
      status: 'pending_review',
      primary_managed_system_id: input.msId,
    });

    const link = await migrateHandle.pool.query<{ id: string }>(
      `select id
         from core.entity_links
        where workspace_id = $1
          and source_type = $2
          and source_id = $3
          and target_type = 'task_request'
          and target_id = $4
          and relation_type = 'requested_task'
          and status = 'active'`,
      [WORKSPACE_ID, input.source, input.sourceId, input.taskRequestId],
    );
    expect(link.rowCount).toBe(1);

    const audit = await migrateHandle.pool.query<{ detail: Record<string, unknown> }>(
      `select detail
         from core.audit_log
        where workspace_id = $1
          and event_type = $2
          and subject_id = $3`,
      [WORKSPACE_ID, auditType, input.taskRequestId],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.detail).toMatchObject({
      task_request_id: input.taskRequestId,
      [sourceColumn]: input.sourceId,
      primary_managed_system_id: input.msId,
      source_type: input.source,
    });
  }

  it.each(['owner', 'team', 'aa', 'queue', 'revoked', 'expired', 'denied', 'system'] as const)(
    'resolves reviewer through %s with discoverable skipped rules and no replay diagnostic duplication',
    async (mode) => {
      const seeded = await seedVocSource();
      const teamId = await insertTeamDirectly(migrateHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
      teamIds.push(teamId);
      if (['owner', 'team'].includes(mode)) {
        await migrateHandle.pool.query(
          `update core.managed_systems set default_owner_actor_id = $1::uuid,
          default_owner_team_id = $2::uuid where id = $3::uuid`,
          [mode === 'owner' ? adminActorId : null, mode === 'team' ? teamId : null, seeded.msId],
        );
      }
      if (mode === 'aa') {
        const area = await migrateHandle.pool.query<{ id: string }>(
          `insert into core.analytics_areas
          (workspace_id, managed_system_id, slug, name, owner_team_id) values ($1, $2, $3, $3, $4) returning id`,
          [WORKSPACE_ID, seeded.msId, uid(SLUG_PREFIX), teamId],
        );
        await migrateHandle.pool.query('update voc.vocs set analytics_area_id = $1 where id = $2', [
          area.rows[0]?.id,
          seeded.id,
        ]);
      }
      if (mode === 'system') {
        const sys = await dbHandle.pool.query<{ id: string }>(
          `select id from core.actors
            where external_id = 'system' and workspace_id = $1`,
          [WORKSPACE_ID],
        );
        const systemActorId = sys.rows[0]?.id;
        if (!systemActorId) throw new Error('seed system actor not found');
        await migrateHandle.pool.query(
          'update core.managed_systems set default_reviewer_actor_id = $1 where id = $2',
          [systemActorId, seeded.msId],
        );
      }
      if (['revoked', 'expired', 'denied'].includes(mode)) {
        const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
        const grant = await grantCapability(
          dbHandle,
          WORKSPACE_ID,
          dev.id,
          'finding.manage',
          seeded.msId,
          adminActorId,
        );
        if (mode === 'revoked') await revokeCapabilityGrant(dbHandle, grant, adminActorId);
        if (mode === 'expired') await expireCapabilityGrant(dbHandle, grant);
        if (mode === 'denied')
          await denyCapability(
            dbHandle,
            WORKSPACE_ID,
            dev.id,
            'finding.manage',
            seeded.msId,
            adminActorId,
          );
        await migrateHandle.pool.query(
          'update core.managed_systems set default_reviewer_actor_id = $1 where id = $2',
          [dev.id, seeded.msId],
        );
      }
      const key = randomUUID();
      const first = await requestTask(adminCookie, 'voc', seeded.id, key);
      expect(first.statusCode).toBe(201);
      const resolved = ['owner', 'team', 'aa'].includes(mode);
      expect(first.json()).toMatchObject({
        status: 'pending_review',
        reviewer_actor_id: null,
        assigned_reviewer_actor_id: mode === 'owner' ? adminActorId : null,
        assigned_reviewer_team_id: ['team', 'aa'].includes(mode) ? teamId : null,
        default_resolved: resolved,
        source_rule:
          mode === 'aa'
            ? 'analytics_area_owner'
            : resolved
              ? 'managed_system_owner'
              : 'workspace_fallback_queue',
      });
      const replay = await requestTask(adminCookie, 'voc', seeded.id, key);
      expect(replay.json()).toEqual(first.json());
      const diagnostics = await migrateHandle.pool.query<{ rule: string; category: string }>(
        'select rule, category from core.responsibility_default_failures where managed_system_id = $1 order by rule',
        [seeded.msId],
      );
      expect(diagnostics.rows).toHaveLength(resolved ? (mode === 'aa' ? 2 : 1) : 3);
      expect(new Set(diagnostics.rows.map((row) => row.rule)).size).toBe(diagnostics.rows.length);
      if (['revoked', 'expired', 'denied', 'system'].includes(mode))
        expect(diagnostics.rows).toContainEqual({
          rule: 'managed_system_reviewer',
          category: 'ineligible_actor',
        });
    },
  );

  it('assignment preserves the open authorized queue and grants no self-approval', async () => {
    const seeded = await seedClusterSource();
    const dev = await insertDevActor(dbHandle, WORKSPACE_ID, uid(SLUG_PREFIX));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      dev.id,
      'finding.manage',
      seeded.msId,
      adminActorId,
    );
    await migrateHandle.pool.query(
      'update core.managed_systems set default_reviewer_actor_id = $1 where id = $2',
      [dev.id, seeded.msId],
    );
    const cookie = await loginAs(app, dev.externalId);
    const created = await requestTask(cookie, 'voc_cluster', seeded.id);
    expect(created.statusCode).toBe(201);
    const decide = (cookie: string) =>
      app.inject({
        method: 'POST',
        url: `/task-requests/${created.json().id}/approve`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'idempotency-key': randomUUID() },
        payload: { reason: 'Real review' },
      });
    expect((await decide(cookie)).statusCode).toBe(403);
    const actual = await decide(adminCookie);
    expect(actual.statusCode).toBe(200);
    expect(actual.json()).toMatchObject({
      assigned_reviewer_actor_id: dev.id,
      reviewer_actor_id: adminActorId,
      status: 'approved',
    });
  });

  it.each([
    ['finding', seedFindingSource],
    ['voc', seedVocSource],
    ['voc_cluster', seedClusterSource],
  ] as const)(
    'routes %s to a real assigned reviewer distinct from the decision Actor, once on replay',
    async (source, seed) => {
      const seeded = await seed();
      await migrateHandle.pool.query(
        'update core.managed_systems set default_reviewer_actor_id = $1 where id = $2',
        [adminActorId, seeded.msId],
      );
      const key = randomUUID();
      const first = await requestTask(adminCookie, source, seeded.id, key);
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({
        status: 'pending_review',
        reviewer_actor_id: null,
        assigned_reviewer_actor_id: adminActorId,
        assigned_reviewer_team_id: null,
        default_resolved: true,
        source_rule: 'managed_system_reviewer',
        managed_system_id: seeded.msId,
      });
      const second = await requestTask(adminCookie, source, seeded.id, key);
      expect(second.json()).toEqual(first.json());
      const audit = await migrateHandle.pool.query(
        'select detail from core.audit_log where subject_id = $1 and event_type = $2',
        [first.json().id, `task_request_created_from_${source}`],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]?.detail).toMatchObject({
        assigned_reviewer_actor_id: adminActorId,
        default_resolved: true,
        source_rule: 'managed_system_reviewer',
      });
      const failures = await migrateHandle.pool.query(
        'select 1 from core.responsibility_default_failures where managed_system_id = $1',
        [seeded.msId],
      );
      expect(failures.rows).toHaveLength(0);
    },
  );

  it.each(['explicit-team', 'archived-team', 'foreign-team', 'xor', 'unknown-team'] as const)(
    'validates %s request responsibility without rejected side effects',
    async (mode) => {
      const seeded = await seedVocSource();
      let teamWorkspaceId = WORKSPACE_ID;
      if (mode === 'foreign-team') {
        const workspace = await migrateHandle.pool.query<{ id: string }>(
          'insert into core.workspaces (name) values ($1) returning id',
          [uid(SLUG_PREFIX)],
        );
        const id = workspace.rows[0]?.id;
        if (!id) throw new Error('foreign team workspace seed failed');
        foreignWorkspaceIds.push(id);
        teamWorkspaceId = id;
      }
      const teamId =
        mode === 'unknown-team'
          ? randomUUID()
          : await insertTeamDirectly(migrateHandle, teamWorkspaceId, uid(SLUG_PREFIX));
      if (mode !== 'unknown-team') teamIds.push(teamId);
      if (mode === 'archived-team')
        await migrateHandle.pool.query('update core.teams set archived_at = now() where id = $1', [
          teamId,
        ]);
      const response = await requestTask(adminCookie, 'voc', seeded.id, randomUUID(), {
        assigned_reviewer_actor_id: mode === 'xor' ? adminActorId : null,
        assigned_reviewer_team_id: teamId,
      });
      expect(response.statusCode).toBe(mode === 'explicit-team' ? 201 : 422);
      if (mode === 'explicit-team')
        expect(response.json()).toMatchObject({
          assigned_reviewer_actor_id: null,
          assigned_reviewer_team_id: teamId,
          reviewer_actor_id: null,
          source_rule: 'explicit',
          default_resolved: false,
        });
      else {
        expect(response.json().code).toBe('validation.failed');
        const rows = await migrateHandle.pool.query(
          'select 1 from task_request.task_requests where primary_managed_system_id = $1',
          [seeded.msId],
        );
        expect(rows.rows).toHaveLength(0);
        const audits = await migrateHandle.pool.query(
          "select 1 from core.audit_log where event_type = 'task_request_created_from_voc' and detail->>'source_voc_id' = $1::text",
          [seeded.id],
        );
        expect(audits.rows).toHaveLength(0);
        const links = await migrateHandle.pool.query(
          "select 1 from core.entity_links where source_id = $1 and target_type = 'task_request'",
          [seeded.id],
        );
        expect(links.rows).toHaveLength(0);
      }
      const diagnostics = await migrateHandle.pool.query(
        'select 1 from core.responsibility_default_failures where managed_system_id = $1',
        [seeded.msId],
      );
      expect(diagnostics.rows).toHaveLength(0);
    },
  );

  it('explicit null opts out and a User reviewer rejects without request, link, audit or diagnostic writes', async () => {
    const seeded = await seedVocSource();
    await migrateHandle.pool.query(
      'update core.managed_systems set default_reviewer_actor_id = $1 where id = $2',
      [adminActorId, seeded.msId],
    );
    const optedOut = await requestTask(adminCookie, 'voc', seeded.id, randomUUID(), {
      assigned_reviewer_actor_id: null,
      assigned_reviewer_team_id: null,
    });
    expect(optedOut.statusCode).toBe(201);
    expect(optedOut.json()).toMatchObject({
      assigned_reviewer_actor_id: null,
      assigned_reviewer_team_id: null,
      reviewer_actor_id: null,
      default_resolved: false,
      source_rule: 'explicit_null',
    });
    const rejected = await requestTask(adminCookie, 'voc', seeded.id, randomUUID(), {
      assigned_reviewer_actor_id: userActorId,
    });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json().code).toBe('validation.failed');
    const rows = await migrateHandle.pool.query(
      'select 1 from task_request.task_requests where primary_managed_system_id = $1',
      [seeded.msId],
    );
    expect(rows.rows).toHaveLength(1);
    const diagnostics = await migrateHandle.pool.query(
      'select 1 from core.responsibility_default_failures where managed_system_id = $1',
      [seeded.msId],
    );
    expect(diagnostics.rows).toHaveLength(0);
  });

  it('rejects an explicit system Actor as assigned reviewer despite its admin Role Level', async () => {
    const seeded = await seedVocSource();
    const sys = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors
        where external_id = 'system' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const systemActorId = sys.rows[0]?.id;
    if (!systemActorId) throw new Error('seed system actor not found');

    const rejected = await requestTask(adminCookie, 'voc', seeded.id, randomUUID(), {
      assigned_reviewer_actor_id: systemActorId,
    });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json()).toMatchObject({
      code: 'validation.failed',
      detail: { fields: [{ path: ['assigned_reviewer_actor_id'], code: 'ineligible_actor' }] },
    });
    const rows = await migrateHandle.pool.query(
      'select 1 from task_request.task_requests where primary_managed_system_id = $1',
      [seeded.msId],
    );
    expect(rows.rows).toHaveLength(0);
    const audits = await migrateHandle.pool.query(
      "select 1 from core.audit_log where event_type = 'task_request_created_from_voc' and detail->>'source_voc_id' = $1::text",
      [seeded.id],
    );
    expect(audits.rows).toHaveLength(0);
    const diagnostics = await migrateHandle.pool.query(
      'select 1 from core.responsibility_default_failures where managed_system_id = $1',
      [seeded.msId],
    );
    expect(diagnostics.rows).toHaveLength(0);
  });

  it.each([['voc', seedVocSource] as const, ['voc_cluster', seedClusterSource] as const])(
    'POST /%s request-task creates a pending_review request, source link, audit, and queue item',
    async (source, seed) => {
      const seeded = await seed();

      const res = await requestTask(adminCookie, source, seeded.id);
      expect(res.statusCode).toBe(201);
      const body = res.json<{
        id: string;
        source_type: SourceKind;
        source: { type: SourceKind; id: string; relation_type: string; link_id: string };
      }>();
      expect(body).toMatchObject({
        source_type: source,
        source_id: seeded.id,
        primary_managed_system_id: seeded.msId,
        status: 'pending_review',
        source: {
          type: source,
          id: seeded.id,
          relation_type: 'requested_task',
        },
      });

      await assertCreatedRequest({
        source,
        sourceId: seeded.id,
        taskRequestId: body.id,
        msId: seeded.msId,
      });

      const queue = await listTaskRequests(adminCookie);
      expect(queue.statusCode).toBe(200);
      const queueItem = queue
        .json<{ items: Array<{ id: string; source?: { type: SourceKind } }> }>()
        .items.find((item) => item.id === body.id);
      expect(queueItem).toMatchObject({
        id: body.id,
        source: { type: source },
      });
    },
  );

  it('POST /vocs/:id/request-task is idempotent and requires VOC triage authority', async () => {
    const seeded = await seedVocSource();
    const key = randomUUID();

    const first = await requestTask(adminCookie, 'voc', seeded.id, key);
    const second = await requestTask(adminCookie, 'voc', seeded.id, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from task_request.task_requests
        where workspace_id = $1
          and source_type = 'voc'
          and source_id = $2`,
      [WORKSPACE_ID, seeded.id],
    );
    expect(count.rows[0]?.n).toBe(1);

    const denied = await requestTask(userCookie, 'voc', seeded.id);
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('POST /voc-clusters/:id/request-task is idempotent and requires cluster authority', async () => {
    const seeded = await seedClusterSource();
    const key = randomUUID();

    const first = await requestTask(adminCookie, 'voc_cluster', seeded.id, key);
    const second = await requestTask(adminCookie, 'voc_cluster', seeded.id, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const count = await dbHandle.pool.query<{ n: number }>(
      `select count(*)::int as n
         from task_request.task_requests
        where workspace_id = $1
          and source_type = 'voc_cluster'
          and source_id = $2`,
      [WORKSPACE_ID, seeded.id],
    );
    expect(count.rows[0]?.n).toBe(1);

    const { id: devId, externalId } = await insertDevActor(dbHandle, WORKSPACE_ID, uid('cluster'));
    await grantCapability(
      dbHandle,
      WORKSPACE_ID,
      devId,
      'finding.manage',
      seeded.msId,
      adminActorId,
    );
    const devCookie = await loginAs(app, externalId);
    const allowed = await requestTask(devCookie, 'voc_cluster', seeded.id);
    expect(allowed.statusCode).toBe(201);

    const denied = await requestTask(userCookie, 'voc_cluster', seeded.id);
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.denied');
  });

  it('unknown VOC and unknown VOC Cluster return not_found', async () => {
    const unknownVoc = await requestTask(adminCookie, 'voc', randomUUID());
    expect(unknownVoc.statusCode).toBe(404);
    expect(unknownVoc.json<{ code: string }>().code).toBe('not_found.record');

    const unknownCluster = await requestTask(adminCookie, 'voc_cluster', randomUUID());
    expect(unknownCluster.statusCode).toBe(404);
    expect(unknownCluster.json<{ code: string }>().code).toBe('not_found.record');
  });
});
