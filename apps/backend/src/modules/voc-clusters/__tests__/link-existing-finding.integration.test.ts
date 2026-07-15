import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { loginAs } from '../../voc/__tests__/_seed-helpers.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { grantCapability, insertActorRow, insertVocClusterRow } from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('VOC cluster link existing Finding (#127)', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let adminId: string;
  let authorizedActorId: string;
  let clusterMsId: string;
  let targetMsId: string;
  let clusterId: string;
  let targetFindingId: string;
  let targetDisplayId: string;
  let deniedFindingId: string;
  let authorizedCookie: string;
  let blindCookie: string;
  let noManageCookie: string;
  let unscopedCookie: string;

  const headers = (cookie: string) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'workspace-id': WORKSPACE_ID,
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    const admin = await ops.pool.query<{ id: string }>(
      `select id from core.actors where workspace_id=$1 and external_id='mock-admin-1'`,
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('admin seed missing');
    const [clusterMs, targetMs] = await Promise.all([
      ops.pool.query<{ id: string }>(
        'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
        [WORKSPACE_ID, `link-cluster-${randomUUID()}`, 'Link cluster MS'],
      ),
      ops.pool.query<{ id: string }>(
        'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
        [WORKSPACE_ID, `link-target-${randomUUID()}`, 'Link target MS'],
      ),
    ]);
    clusterMsId = clusterMs.rows[0]?.id ?? '';
    targetMsId = targetMs.rows[0]?.id ?? '';
    if (!clusterMsId || !targetMsId) throw new Error('managed system seed failed');
    clusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: clusterMsId,
        createdBy: adminId,
      })
    ).id;
    const finding = await insertFindingRow(ops, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: targetMsId,
      sourceId: clusterId,
      createdBy: adminId,
      status: 'active',
    });
    targetFindingId = finding.id;
    targetDisplayId = finding.display_id;
    deniedFindingId = (
      await insertFindingRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: targetMsId,
        sourceId: clusterId,
        createdBy: adminId,
        status: 'active',
      })
    ).id;
    const authorized = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `link-authorized-${randomUUID()}`,
      roleLevel: 'developer',
    });
    authorizedActorId = authorized.id;
    const blind = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `link-blind-${randomUUID()}`,
      roleLevel: 'developer',
    });
    const noManage = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `link-no-manage-${randomUUID()}`,
      roleLevel: 'developer',
    });
    const unscoped = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `link-unscoped-${randomUUID()}`,
      roleLevel: 'developer',
    });
    for (const actorId of [authorized.id, noManage.id]) {
      for (const managedSystemId of [clusterMsId, targetMsId]) {
        await grantCapability(ops, {
          workspaceId: WORKSPACE_ID,
          actorId,
          capability: 'finding.read',
          managedSystemId,
          grantedByActorId: adminId,
        });
      }
    }
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: blind.id,
      capability: 'finding.read',
      managedSystemId: clusterMsId,
      grantedByActorId: adminId,
    });
    for (const managedSystemId of [clusterMsId, targetMsId]) {
      await grantCapability(ops, {
        workspaceId: WORKSPACE_ID,
        actorId: authorized.id,
        capability: 'finding.manage',
        managedSystemId,
        grantedByActorId: adminId,
      });
    }
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: noManage.id,
      capability: 'finding.manage',
      managedSystemId: clusterMsId,
      grantedByActorId: adminId,
    });
    // loginAs requires the exact external id; retrieve it rather than deriving fixture identifiers.
    const actorCookies = await Promise.all(
      [authorized.id, blind.id, noManage.id, unscoped.id].map(async (id) => {
        const row = await ops.pool.query<{ external_id: string }>('select external_id from core.actors where id=$1', [id]);
        return loginAs(app, row.rows[0]?.external_id ?? '');
      }),
    );
    const [authorizedSession, blindSession, noManageSession, unscopedSession] = actorCookies;
    if (!authorizedSession || !blindSession || !noManageSession || !unscopedSession) {
      throw new Error('actor login seed failed');
    }
    authorizedCookie = authorizedSession;
    blindCookie = blindSession;
    noManageCookie = noManageSession;
    unscopedCookie = unscopedSession;
  });

  afterAll(async () => {
    if (ops) {
      await ops.pool.query(
        `delete from core.audit_log
         where workspace_id=$1
           and (subject_id=any($2::uuid[]) or detail->>'voc_cluster_id'=$3 or detail->'source'->>'id'=$3)`,
        [WORKSPACE_ID, [clusterId, targetFindingId, deniedFindingId], clusterId],
      );
      await ops.pool.query(
        'delete from core.entity_links where workspace_id=$1 and (source_id=$2 or target_id=any($3::uuid[]))',
        [WORKSPACE_ID, clusterId, [targetFindingId, deniedFindingId]],
      );
      await ops.pool.query('delete from finding.findings where id=any($1::uuid[])', [[targetFindingId, deniedFindingId]]);
      await ops.pool.query('delete from voc_cluster.voc_clusters where id=$1', [clusterId]);
      await ops.pool.query('delete from permission.permission_grants where managed_system_id=any($1::uuid[])', [[clusterMsId, targetMsId]]);
      await ops.pool.query('delete from core.managed_systems where id=any($1::uuid[])', [[clusterMsId, targetMsId]]);
      await ops.pool.query(`delete from core.sessions where actor_id in (select id from core.actors where workspace_id=$1 and external_id like 'link-%')`, [WORKSPACE_ID]);
      await ops.pool.query(`delete from core.actors where workspace_id=$1 and external_id like 'link-%'`, [WORKSPACE_ID]);
    }
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  const link = (cookie: string, options: { clusterId?: string; findingId?: string } = {}) => app.inject({
    method: 'POST', url: `/voc-clusters/${options.clusterId ?? clusterId}/link-finding`,
    headers: { ...headers(cookie), 'idempotency-key': randomUUID() },
    body: { finding_id: options.findingId ?? targetFindingId },
  });

  it('links as evidence, audits it, and hides the cross-MS target from a cluster reader without target scope', async () => {
    const linked = await link(authorizedCookie);
    expect(linked.statusCode).toBe(201);
    expect(linked.json()).toEqual({ id: targetFindingId, display_id: targetDisplayId, status: 'active' });
    const relation = await ops.pool.query<{ relation_type: string }>(
      'select relation_type from core.entity_links where source_id=$1 and target_id=$2 and status=$3',
      [clusterId, targetFindingId, 'active'],
    );
    expect(relation.rows).toEqual([{ relation_type: 'evidence_of' }]);
    const audit = await ops.pool.query<{ event_type: string; actor_id: string }>(
      'select event_type, actor_id from core.audit_log where subject_id=$1 and event_type=$2',
      [targetFindingId, 'finding_linked_to_voc_cluster'],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.actor_id).toBe(authorizedActorId);
    const visible = await app.inject({ method: 'GET', url: `/voc-clusters/${clusterId}`, headers: headers(authorizedCookie) });
    expect(visible.json().linked_findings).toEqual([{ id: targetFindingId, display_id: targetDisplayId, status: 'active' }]);
    const hidden = await app.inject({ method: 'GET', url: `/voc-clusters/${clusterId}`, headers: headers(blindCookie) });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().linked_findings).toEqual([]);
    const list = await app.inject({ method: 'GET', url: `/voc-clusters?managed_system_id=${clusterMsId}`, headers: headers(blindCookie) });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain(targetFindingId);
  });

  it('returns one byte-equivalent 404 envelope for missing or unreadable cluster and target', async () => {
    const responses = await Promise.all([
      link(authorizedCookie, { clusterId: randomUUID() }),
      link(unscopedCookie),
      link(authorizedCookie, { findingId: randomUUID() }),
      link(blindCookie),
    ]);
    for (const response of responses) expect(response.statusCode).toBe(404);
    expect(new Set(responses.map((response) => response.body))).toEqual(
      new Set(['{"code":"not_found.record","message":"record not found"}']),
    );
  });

  it('denies a readable target without manage scope and writes neither link nor audit row', async () => {
    const before = await ops.pool.query<{ links: string; audits: string }>(
      `select
        (select count(*)::text from core.entity_links where source_id=$1 and target_id=$2) as links,
        (select count(*)::text from core.audit_log where subject_id=$2 and event_type='finding_linked_to_voc_cluster') as audits`,
      [clusterId, deniedFindingId],
    );
    const denied = await link(noManageCookie, { findingId: deniedFindingId });
    expect(denied.statusCode).toBe(403);
    expect(denied.json<{ code: string }>().code).toBe('permission.scope_required');
    const blindDenied = await link(blindCookie, { findingId: deniedFindingId });
    expect(blindDenied.statusCode).toBe(404);
    const after = await ops.pool.query<{ links: string; audits: string }>(
      `select
        (select count(*)::text from core.entity_links where source_id=$1 and target_id=$2) as links,
        (select count(*)::text from core.audit_log where subject_id=$2 and event_type='finding_linked_to_voc_cluster') as audits`,
      [clusterId, deniedFindingId],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('returns the existing link on a duplicate without creating a second audit row', async () => {
    const duplicate = await link(authorizedCookie);
    expect(duplicate.statusCode).toBe(200);
    const audit = await ops.pool.query('select id from core.audit_log where subject_id=$1 and event_type=$2', [targetFindingId, 'finding_linked_to_voc_cluster']);
    expect(audit.rows).toHaveLength(1);
  });
});
