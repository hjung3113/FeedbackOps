import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertFindingRow } from '../../findings/__tests__/_seed-helpers.js';
import { loginAs } from '../../voc/__tests__/_seed-helpers.js';
import {
  cleanupVocClusterFixtures,
  grantCapability,
  insertActorRow,
  insertVocClusterRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('VOC cluster link existing Finding (#127)', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let adminId: string;
  let clusterMsId: string;
  let targetMsId: string;
  let clusterId: string;
  let targetFindingId: string;
  let targetDisplayId: string;
  let deniedFindingId: string;
  let sameMsFindingId: string;
  let authorizedCookie: string;
  let blindCookie: string;
  let noManageCookie: string;
  let unscopedCookie: string;
  const fixtureActorIds: string[] = [];
  const fixtureGrantIds: string[] = [];

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
    // Same-MS counterpart for create-path flows; cross-MS creation is
    // rejected (#388) so the cross-MS pair below is only linkable via seed.
    sameMsFindingId = (
      await insertFindingRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: clusterMsId,
        sourceId: clusterId,
        createdBy: adminId,
        status: 'active',
      })
    ).id;
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
    fixtureActorIds.push(authorized.id);
    const blind = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `link-blind-${randomUUID()}`,
      roleLevel: 'developer',
    });
    fixtureActorIds.push(blind.id);
    const noManage = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `link-no-manage-${randomUUID()}`,
      roleLevel: 'developer',
    });
    fixtureActorIds.push(noManage.id);
    const unscoped = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `link-unscoped-${randomUUID()}`,
      roleLevel: 'developer',
    });
    fixtureActorIds.push(unscoped.id);
    for (const actorId of [authorized.id, noManage.id]) {
      for (const managedSystemId of [clusterMsId, targetMsId]) {
        fixtureGrantIds.push(
          (
            await grantCapability(ops, {
              workspaceId: WORKSPACE_ID,
              actorId,
              capability: 'finding.read',
              managedSystemId,
              grantedByActorId: adminId,
            })
          ).id,
        );
      }
    }
    fixtureGrantIds.push(
      (
        await grantCapability(ops, {
          workspaceId: WORKSPACE_ID,
          actorId: blind.id,
          capability: 'finding.read',
          managedSystemId: clusterMsId,
          grantedByActorId: adminId,
        })
      ).id,
    );
    for (const managedSystemId of [clusterMsId, targetMsId]) {
      fixtureGrantIds.push(
        (
          await grantCapability(ops, {
            workspaceId: WORKSPACE_ID,
            actorId: authorized.id,
            capability: 'finding.manage',
            managedSystemId,
            grantedByActorId: adminId,
          })
        ).id,
      );
    }
    fixtureGrantIds.push(
      (
        await grantCapability(ops, {
          workspaceId: WORKSPACE_ID,
          actorId: noManage.id,
          capability: 'finding.manage',
          managedSystemId: clusterMsId,
          grantedByActorId: adminId,
        })
      ).id,
    );
    // loginAs requires the exact external id; retrieve it rather than deriving fixture identifiers.
    const actorCookies = await Promise.all(
      [authorized.id, blind.id, noManage.id, unscoped.id].map(async (id) => {
        const row = await ops.pool.query<{ external_id: string }>(
          'select external_id from core.actors where id=$1',
          [id],
        );
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
      await cleanupVocClusterFixtures(ops, {
        workspaceId: WORKSPACE_ID,
        actorIds: fixtureActorIds,
        managedSystemIds: [clusterMsId, targetMsId],
        clusterIds: [clusterId],
        findingIds: [targetFindingId, deniedFindingId, sameMsFindingId],
        permissionGrantIds: fixtureGrantIds,
      });
    }
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  const link = (cookie: string, options: { clusterId?: string; findingId?: string } = {}) =>
    app.inject({
      method: 'POST',
      url: `/voc-clusters/${options.clusterId ?? clusterId}/link-finding`,
      headers: { ...headers(cookie), 'idempotency-key': randomUUID() },
      body: { finding_id: options.findingId ?? targetFindingId },
    });

  it('seeds a cross-MS evidence link and hides the target from a cluster reader without target scope', async () => {
    // Cross-MS creation is rejected (#388); seed the row directly so the
    // hidden linked-finding projections below stay covered.
    await ops.pool.query(
      `insert into core.entity_links (
          workspace_id, source_type, source_id, target_type, target_id,
          relation_type, visibility, status, managed_system_id, created_by
        )
       values ($1, 'voc_cluster', $2, 'finding', $3, 'evidence_of',
               'internal_only', 'active', $4, $5)`,
      [WORKSPACE_ID, clusterId, targetFindingId, clusterMsId, adminId],
    );
    const relation = await ops.pool.query<{ relation_type: string }>(
      'select relation_type from core.entity_links where source_id=$1 and target_id=$2 and status=$3',
      [clusterId, targetFindingId, 'active'],
    );
    expect(relation.rows).toEqual([{ relation_type: 'evidence_of' }]);
    const visible = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${clusterId}`,
      headers: headers(authorizedCookie),
    });
    expect(visible.json().linked_findings).toEqual([
      { id: targetFindingId, display_id: targetDisplayId, status: 'active' },
    ]);
    const hidden = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${clusterId}`,
      headers: headers(blindCookie),
    });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json().linked_findings).toEqual([]);
    const list = await app.inject({
      method: 'GET',
      url: `/voc-clusters?managed_system_id=${clusterMsId}`,
      headers: headers(blindCookie),
    });
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
    const first = await link(authorizedCookie, { findingId: sameMsFindingId });
    expect(first.statusCode).toBe(201);
    const duplicate = await link(authorizedCookie, { findingId: sameMsFindingId });
    expect(duplicate.statusCode).toBe(200);
    const audit = await ops.pool.query(
      'select id from core.audit_log where subject_id=$1 and event_type=$2',
      [sameMsFindingId, 'finding_linked_to_voc_cluster'],
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('AC-388-4 link-finding rejects a cross-MS target without persisting a link or audit row (AC-388-3)', async () => {
    const rejected = await link(authorizedCookie);
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json<{ code: string }>().code).toBe('validation.failed');
    const persisted = await ops.pool.query<{ links: string; audits: string }>(
      `select
        (select count(*)::text from core.entity_links where source_id=$1 and target_id=$2) as links,
        (select count(*)::text from core.audit_log where subject_id=$2 and event_type='finding_linked_to_voc_cluster') as audits`,
      [clusterId, targetFindingId],
    );
    // The seeded cross-MS row from the first test still exists; the HTTP
    // create path must not have added or audited a second one.
    expect(persisted.rows[0]?.links).toBe('1');
    expect(persisted.rows[0]?.audits).toBe('0');
  });
});
