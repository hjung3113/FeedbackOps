import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { loginAs } from '../../voc/__tests__/_seed-helpers.js';
import {
  grantCapability,
  insertActorRow,
  insertVocClusterMemberRow,
  insertVocClusterRow,
  insertVocRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('VOC cluster member visibility', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let msId: string;
  let clusterId: string;
  let ownerVocId: string;
  let hiddenVocId: string;
  let triageOwnedVocId: string;
  let nonMemberVocId: string;
  let developerCookie: string;
  let triageOnlyCookie: string;
  let adminId: string;
  let developerId: string;

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

    const developer = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `cluster-member-dev-${randomUUID()}`,
      roleLevel: 'developer',
    });
    developerId = developer.id;
    const triageOnly = await insertActorRow(ops, {
      workspaceId: WORKSPACE_ID,
      externalId: `cluster-member-triage-${randomUUID()}`,
      roleLevel: 'developer',
    });
    const ms = await ops.pool.query<{ id: string }>(
      'insert into core.managed_systems(workspace_id,slug,name) values($1,$2,$3) returning id',
      [WORKSPACE_ID, `cluster-member-${randomUUID()}`, 'Cluster member visibility'],
    );
    msId = ms.rows[0]?.id ?? '';
    for (const actorId of [developer.id, triageOnly.id]) {
      await grantCapability(ops, {
        workspaceId: WORKSPACE_ID,
        actorId,
        capability: 'finding.read',
        managedSystemId: msId,
        grantedByActorId: adminId,
      });
    }
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: developer.id,
      capability: 'finding.manage',
      managedSystemId: msId,
      grantedByActorId: adminId,
    });
    await grantCapability(ops, {
      workspaceId: WORKSPACE_ID,
      actorId: triageOnly.id,
      capability: 'voc.triage',
      managedSystemId: msId,
      grantedByActorId: adminId,
    });
    clusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        createdBy: adminId,
      })
    ).id;
    ownerVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        reporterId: developer.id,
        title: 'Reporter-owned member',
      })
    ).id;
    hiddenVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        reporterId: adminId,
        title: 'Hidden member',
      })
    ).id;
    triageOwnedVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        reporterId: triageOnly.id,
        title: 'Triage actor owned member',
      })
    ).id;
    nonMemberVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: msId,
        reporterId: adminId,
        title: 'Existing non-member',
      })
    ).id;
    await insertVocClusterMemberRow(ops, { clusterId, vocId: ownerVocId, addedBy: adminId });
    await insertVocClusterMemberRow(ops, { clusterId, vocId: hiddenVocId, addedBy: adminId });
    await insertVocClusterMemberRow(ops, {
      clusterId,
      vocId: triageOwnedVocId,
      addedBy: adminId,
    });
    developerCookie = await loginAs(
      app,
      (
        await ops.pool.query<{ external_id: string }>(
          'select external_id from core.actors where id=$1',
          [developer.id],
        )
      ).rows[0]?.external_id ?? '',
    );
    triageOnlyCookie = await loginAs(
      app,
      (
        await ops.pool.query<{ external_id: string }>(
          'select external_id from core.actors where id=$1',
          [triageOnly.id],
        )
      ).rows[0]?.external_id ?? '',
    );
  });

  afterAll(async () => {
    if (ops) {
      await ops.pool.query('delete from core.audit_log where subject_id=$1', [clusterId]);
      await ops.pool.query('delete from voc_cluster.voc_cluster_members where cluster_id=$1', [
        clusterId,
      ]);
      await ops.pool.query('delete from voc_cluster.voc_clusters where id=$1', [clusterId]);
      await ops.pool.query('delete from voc.vocs where id=any($1::uuid[])', [
        [ownerVocId, hiddenVocId, triageOwnedVocId, nonMemberVocId],
      ]);
      await ops.pool.query('delete from permission.permission_grants where managed_system_id=$1', [
        msId,
      ]);
      await ops.pool.query('delete from core.managed_systems where id=$1', [msId]);
      await ops.pool.query(
        'delete from core.sessions where actor_id in (select id from core.actors where workspace_id=$1 and external_id like $2)',
        [WORKSPACE_ID, 'cluster-member-%'],
      );
      await ops.pool.query(
        'delete from core.actors where workspace_id=$1 and external_id like $2',
        [WORKSPACE_ID, 'cluster-member-%'],
      );
    }
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  it('returns authorized members and omits unreadable members rather than masking them', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${clusterId}`,
      headers: headers(developerCookie),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      member_count: 1,
      members: [expect.objectContaining({ voc_id: ownerVocId, title: 'Reporter-owned member' })],
    });
    expect(detail.body).not.toContain(hiddenVocId);
    expect(detail.body).not.toContain(triageOwnedVocId);
  });

  it('lets a reporter see their own member row without voc.read scope', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${clusterId}`,
      headers: headers(developerCookie),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().members).toEqual([
      expect.objectContaining({ voc_id: ownerVocId, title: 'Reporter-owned member' }),
    ]);
  });

  it('reports the authorized member count instead of the total membership count', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${clusterId}`,
      headers: headers(developerCookie),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ member_count: 1 });
    expect(detail.json().members).toHaveLength(1);
  });

  it('does not let a triage-only effective scope reveal peer member rows', async () => {
    const triageOnly = await app.inject({
      method: 'GET',
      url: `/voc-clusters/${clusterId}`,
      headers: headers(triageOnlyCookie),
    });
    expect(triageOnly.statusCode).toBe(200);
    expect(triageOnly.json()).toMatchObject({
      member_count: 1,
      members: [expect.objectContaining({ voc_id: triageOwnedVocId })],
    });
    expect(triageOnly.body).not.toContain(ownerVocId);
    expect(triageOnly.body).not.toContain(hiddenVocId);
  });

  it('collapses unreadable, missing, and non-member DELETE probes to the same 404', async () => {
    const ids = [hiddenVocId, randomUUID(), nonMemberVocId];
    const responses = await Promise.all(
      ids.map((vocId) =>
        app.inject({
          method: 'DELETE',
          url: `/voc-clusters/${clusterId}/vocs/${vocId}`,
          headers: headers(developerCookie),
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual([404, 404, 404]);
    expect(responses.map((response) => response.json())).toEqual([
      responses[0]?.json(),
      responses[0]?.json(),
      responses[0]?.json(),
    ]);
  });

  it('removes an authorized member and records the audit row', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/voc-clusters/${clusterId}/vocs/${ownerVocId}`,
      headers: headers(developerCookie),
    });
    expect(response.statusCode).toBe(204);
    const audit = await ops.pool.query<{ actor_id: string }>(
      `select actor_id from core.audit_log where subject_id=$1 and event_type='voc_cluster_member_removed'`,
      [clusterId],
    );
    expect(audit.rows).toContainEqual({ actor_id: developerId });
  });
});
