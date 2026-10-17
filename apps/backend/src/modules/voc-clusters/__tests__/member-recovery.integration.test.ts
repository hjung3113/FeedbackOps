import { randomUUID } from 'node:crypto';
import { recoveryDetailSchema, recoveryListSchema } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { createAuditService } from '../../core/audit/audit-service.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import { recoveryIdentity } from '../../dashboard/identity.js';
import { createOwnerRecoveryRecorder } from '../../dashboard/truth.js';
import { createCheckService } from '../../permissions/check-service.js';
import { createVocClustersService } from '../service.js';
import {
  cleanupVocClusterFixtures,
  grantCapability,
  insertActorRow,
  insertVocClusterRow,
  insertVocRow,
} from './_seed-helpers.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

describe.skipIf(!runIntegration)('Cluster membership recovery (#1145)', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let ops: DbHandle;
  let adminId: string;
  let devId: string;
  let adminCookie: string;
  let devCookie: string;
  let systemId: string;
  let otherSystemId: string;
  let clusterId: string;
  let vocId: string;
  let foreignVocId: string;
  const actorIds: string[] = [];
  const systemIds: string[] = [];
  const clusterIds: string[] = [];
  const findingIds: string[] = [];
  const vocIds: string[] = [];
  const grantIds: string[] = [];
  const headers = (cookie: string) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'workspace-id': WORKSPACE_ID,
  });
  const add = (id = vocId, cookie = devCookie) =>
    app.inject({
      method: 'POST',
      url: `/voc-clusters/${clusterId}/vocs`,
      headers: headers(cookie),
      payload: { voc_id: id },
    });
  const remove = () =>
    app.inject({
      method: 'DELETE',
      url: `/voc-clusters/${clusterId}/vocs/${vocId}`,
      headers: headers(devCookie),
    });
  const token = () => recoveryIdentity('high-severity-unlinked', vocId);
  const detail = () =>
    app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items/${token()}`,
      headers: headers(devCookie),
    });
  async function mute(id = vocId, cookie = devCookie) {
    const res = await app.inject({
      method: 'PATCH',
      url: `/dashboard/recovery-items/${recoveryIdentity('high-severity-unlinked', id)}/presentation`,
      headers: headers(cookie),
      payload: { action: 'mute' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(recoveryDetailSchema.parse(res.json()).presentation.state).toBe('muted');
  }
  async function snapshot() {
    const tokens = [vocId, foreignVocId].map((id) =>
      recoveryIdentity('high-severity-unlinked', id),
    );
    const identities = await ops.pool.query(
      'SELECT * FROM dashboard.recovery_identities WHERE workspace_id=$1::uuid AND recovery_item_id=ANY($2::text[]) ORDER BY recovery_item_id',
      [WORKSPACE_ID, tokens],
    );
    const history = await ops.pool.query(
      'SELECT * FROM dashboard.recovery_history WHERE workspace_id=$1::uuid AND recovery_item_id=ANY($2::text[]) ORDER BY id',
      [WORKSPACE_ID, tokens],
    );
    const presentations = await ops.pool.query(
      'SELECT * FROM dashboard.recovery_presentations WHERE workspace_id=$1::uuid AND recovery_item_id=ANY($2::text[]) ORDER BY recovery_item_id,actor_id,occurrence',
      [WORKSPACE_ID, tokens],
    );
    const membership = await ops.pool.query(
      'SELECT * FROM voc_cluster.voc_cluster_members WHERE cluster_id=$1::uuid ORDER BY voc_id',
      [clusterId],
    );
    const audit = await ops.pool.query(
      'SELECT * FROM core.audit_log WHERE workspace_id=$1::uuid AND subject_id=$2::uuid ORDER BY id',
      [WORKSPACE_ID, clusterId],
    );
    return {
      identities: identities.rows,
      history: history.rows,
      presentations: presentations.rows,
      membership: membership.rows,
      audit: audit.rows,
    };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    ops = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    const admin = await ops.pool.query<{ id: string }>(
      "SELECT id FROM core.actors WHERE workspace_id=$1::uuid AND external_id='mock-admin-1'",
      [WORKSPACE_ID],
    );
    adminId = admin.rows[0]?.id ?? '';
    if (!adminId) throw new Error('seed Admin missing');
    systemId = await insertMsDirectly(
      ops,
      WORKSPACE_ID,
      `member-recovery-${randomUUID()}`,
      'Membership',
    );
    systemIds.push(systemId);
    otherSystemId = await insertMsDirectly(
      ops,
      WORKSPACE_ID,
      `member-recovery-${randomUUID()}`,
      'Other system',
    );
    systemIds.push(otherSystemId);
    const externalId = `member-recovery-dev-${randomUUID()}`;
    devId = (
      await insertActorRow(ops, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'developer' })
    ).id;
    actorIds.push(devId);
    for (const capability of ['voc.read', 'finding.read', 'finding.manage']) {
      grantIds.push(
        (
          await grantCapability(ops, {
            workspaceId: WORKSPACE_ID,
            actorId: devId,
            capability,
            managedSystemId: systemId,
            grantedByActorId: adminId,
          })
        ).id,
      );
    }
    devCookie = await loginAs(app, externalId);
  });
  beforeEach(async () => {
    await ops.pool.query('DELETE FROM core.rate_limits WHERE key LIKE $1::text', [
      `${WORKSPACE_ID}:%`,
    ]);
    clusterId = (
      await insertVocClusterRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: systemId,
        createdBy: adminId,
      })
    ).id;
    clusterIds.push(clusterId);
    const findingId = (
      await insertFindingRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: systemId,
        sourceType: 'voc_cluster',
        sourceId: clusterId,
        status: 'active',
        createdBy: adminId,
      })
    ).id;
    findingIds.push(findingId);
    await ops.pool.query(
      `INSERT INTO core.entity_links
      (workspace_id,source_type,source_id,target_type,target_id,relation_type,visibility,status,managed_system_id,created_by)
      VALUES ($1::uuid,'voc_cluster',$2::uuid,'finding',$3::uuid,'evidence_of','internal_only','active',$4::uuid,$5::uuid)`,
      [WORKSPACE_ID, clusterId, findingId, systemId, adminId],
    );
    vocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: systemId,
        reporterId: adminId,
      })
    ).id;
    vocIds.push(vocId);
    foreignVocId = (
      await insertVocRow(ops, {
        workspaceId: WORKSPACE_ID,
        primaryManagedSystemId: otherSystemId,
        reporterId: adminId,
      })
    ).id;
    vocIds.push(foreignVocId);
    await ops.pool.query("UPDATE voc.vocs SET severity='high' WHERE id=ANY($1::uuid[])", [
      [vocId, foreignVocId],
    ]);
    await mute();
  });
  afterAll(async () => {
    if (ops) {
      const tokens = vocIds.map((id) => recoveryIdentity('high-severity-unlinked', id));
      for (const table of ['recovery_history', 'recovery_presentations', 'recovery_identities']) {
        await ops.pool.query(
          `DELETE FROM dashboard.${table} WHERE workspace_id=$1::uuid AND recovery_item_id=ANY($2::text[])`,
          [WORKSPACE_ID, tokens],
        );
      }
      await cleanupVocClusterFixtures(ops, {
        workspaceId: WORKSPACE_ID,
        actorIds,
        managedSystemIds: systemIds,
        clusterIds,
        findingIds,
        vocIds,
        permissionGrantIds: grantIds,
      });
    }
    await app?.close();
    await appDb?.close();
    await ops?.close();
  });

  it('route add resolves the muted gap and route remove reopens a visible new occurrence without reconciliation', async () => {
    const initial = await detail();
    expect(initial.statusCode).toBe(200);
    expect(recoveryDetailSchema.parse(initial.json())).toMatchObject({
      state: 'active',
      occurrence: 1,
      presentation: { state: 'muted' },
    });
    const hiddenList = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items?category=high-severity-unlinked&managed_system_id=${systemId}`,
      headers: headers(devCookie),
    });
    expect(hiddenList.statusCode).toBe(200);
    expect(recoveryListSchema.parse(hiddenList.json()).items).not.toContainEqual(
      expect.objectContaining({ recovery_item_id: token() }),
    );
    const added = await add();
    expect(added.statusCode, added.body).toBe(201);
    const resolved = await detail();
    expect(resolved.statusCode).toBe(200);
    expect(recoveryDetailSchema.parse(resolved.json())).toMatchObject({
      state: 'resolved',
      occurrence: 1,
    });
    const afterAdd = await snapshot();
    expect(afterAdd.identities).toContainEqual(
      expect.objectContaining({ recovery_item_id: token(), state: 'resolved', occurrence: 1 }),
    );
    expect(afterAdd.history).toEqual([
      expect.objectContaining({
        recovery_item_id: token(),
        occurrence: 1,
        outcome: 'resolved',
        evidence: 'command',
        action: 'voc_cluster_member_added',
        actor_id: devId,
      }),
    ]);
    const removed = await remove();
    expect(removed.statusCode, removed.body).toBe(204);
    const reopened = await detail();
    expect(reopened.statusCode).toBe(200);
    expect(recoveryDetailSchema.parse(reopened.json())).toMatchObject({
      state: 'active',
      occurrence: 2,
      presentation: { state: 'visible', snoozed_until: null },
    });
    const list = await app.inject({
      method: 'GET',
      url: `/dashboard/recovery-items?category=high-severity-unlinked&managed_system_id=${systemId}`,
      headers: headers(devCookie),
    });
    expect(list.statusCode).toBe(200);
    expect(recoveryListSchema.parse(list.json()).items).toContainEqual(
      expect.objectContaining({ recovery_item_id: token(), occurrence: 2 }),
    );
    const afterRemove = await snapshot();
    expect(afterRemove.identities).toContainEqual(
      expect.objectContaining({ recovery_item_id: token(), state: 'active', occurrence: 2 }),
    );
    expect(afterRemove.history).toEqual(afterAdd.history);
  });

  it('duplicate route add returns 200 without changing history or identity', async () => {
    expect((await add()).statusCode).toBe(201);
    const before = await snapshot();
    expect((await add()).statusCode).toBe(200);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['out-of-scope', 'missing', 'concealed'] as const)(
    'rejected %s route add leaves recovery unchanged',
    async (reason) => {
      await mute(foreignVocId, adminCookie);
      const before = await snapshot();
      const result = await add(
        reason === 'missing' ? randomUUID() : foreignVocId,
        reason === 'out-of-scope' ? adminCookie : devCookie,
      );
      expect(result.statusCode, result.body).toBe(reason === 'out-of-scope' ? 422 : 404);
      expect(result.json().code).toBe(
        reason === 'out-of-scope' ? 'validation.failed' : 'not_found.record',
      );
      if (reason === 'out-of-scope')
        expect(result.json().detail.fields).toEqual([{ path: ['voc_id'], code: 'out_of_scope' }]);
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(['add', 'remove'] as const)(
    'rolls back %s membership, audit and recovery when the real finish throws afterward',
    async (command) => {
      if (command === 'remove') expect((await add()).statusCode).toBe(201);
      const before = await snapshot();
      const recorder = createOwnerRecoveryRecorder();
      const service = createVocClustersService({
        db: appDb.db,
        auditService: createAuditService(),
        checkService: createCheckService({ db: appDb.db }),
        idempotencyService: createIdempotencyService(),
        recoveryRecorder: {
          ...recorder,
          async finish(...args) {
            await recorder.finish(...args);
            throw new Error('forced rollback after finish');
          },
        },
      });
      const actor = {
        workspace_id: WORKSPACE_ID,
        actor_id: devId,
        role_level: 'developer' as const,
      };
      const result =
        command === 'add'
          ? service.addMember({ actor, clusterId, input: { voc_id: vocId } })
          : service.removeMember({ actor, clusterId, vocId });
      await expect(result).rejects.toThrow('forced rollback after finish');
      expect(await snapshot()).toEqual(before);
    },
  );
});
