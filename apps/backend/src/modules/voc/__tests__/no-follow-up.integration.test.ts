import { randomUUID } from 'node:crypto';
import type { DashboardAreaReport, DashboardSummary } from '@fops/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow, insertDevActor } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  expireCapabilityGrant,
  grantCapability,
  revokeCapabilityGrant,
} from '../../../test-support/permissions-fixtures.js';
import {
  insertVocClusterMemberRow,
  insertVocClusterRow,
} from '../../../test-support/voc-cluster-fixtures.js';
import { cleanupReadTestTables, insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { recoveryIdentity } from '../../dashboard/identity.js';

const workspace = process.env.WORKSPACE_ID ?? '';
const appUrl = process.env.DATABASE_URL ?? '';
const migrateUrl = process.env.DATABASE_URL_MIGRATE ?? '';
const prefix = 'it-1226';
function missingFixture(): never {
  throw new Error('Required no-follow-up fixture missing');
}

describe.skipIf(!workspace || !appUrl || !migrateUrl)('VOC no-follow-up routes', () => {
  let handle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;
  let admin: string;
  let reporter: string;
  let ms: string;
  let cookie: string;
  const headers = (session = cookie, key: string = randomUUID()) => ({
    cookie: `${SESSION_COOKIE_NAME}=${session}`,
    'idempotency-key': key,
  });
  async function seed(severity: 'high' | 'critical' | 'medium' = 'high') {
    return insertVocDirectly(handle, workspace, ms, reporter, uid('decision'), { severity });
  }
  async function post(id: string, session = cookie, key: string = randomUUID()) {
    return app.inject({
      method: 'POST',
      url: `/vocs/${id}/no-follow-up`,
      headers: headers(session, key),
      payload: { reason: '  추가 조치 불필요  ' },
    });
  }
  async function get(url: string) {
    const r = await app.inject({ method: 'GET', url, headers: headers() });
    expect(r.statusCode).toBe(200);
    return r.json();
  }
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    handle = createDb(appUrl);
    migrate = createDb(migrateUrl);
    app = await buildServer({ config: loadConfig(), dbHandle: handle });
    await app.ready();
    const actors = await handle.pool.query<{ id: string; external_id: string }>(
      "select id,external_id from core.actors where workspace_id=$1 and external_id in ('mock-admin-1','mock-user-1')",
      [workspace],
    );
    admin = actors.rows.find((a) => a.external_id === 'mock-admin-1')?.id ?? missingFixture();
    reporter = actors.rows.find((a) => a.external_id === 'mock-user-1')?.id ?? missingFixture();
    ms = await insertMsDirectly(handle, workspace, uid(prefix), 'VOC decision test');
    cookie = await loginAs(app, 'mock-admin-1');
  });
  beforeEach(async () => {
    await migrate.pool.query('delete from core.rate_limits where key=$1', [
      `${workspace}:${admin}`,
    ]);
  });
  afterAll(async () => {
    await migrate.pool.query(
      'delete from voc.no_follow_up_decisions where workspace_id=$1 and voc_id in (select id from voc.vocs where primary_managed_system_id in (select id from core.managed_systems where slug like $2))',
      [workspace, `${prefix}%`],
    );
    await migrate.pool.query(
      'delete from core.entity_links where workspace_id=$1 and managed_system_id=$2',
      [workspace, ms],
    );
    await migrate.pool.query(
      'delete from voc_cluster.voc_cluster_members where voc_id in (select id from voc.vocs where primary_managed_system_id=$1)',
      [ms],
    );
    await migrate.pool.query(
      'delete from voc_cluster.voc_clusters where primary_managed_system_id=$1',
      [ms],
    );
    await migrate.pool.query('delete from finding.findings where primary_managed_system_id=$1', [
      ms,
    ]);
    await cleanupReadTestTables(handle, workspace, prefix);
    await app.close();
    await handle.close();
    await migrate.close();
  });
  it.each(['high', 'critical'] as const)(
    'records %s once, resolves with command evidence and withdraws into a new visible occurrence',
    async (severity) => {
      const voc = await seed(severity);
      const token = recoveryIdentity('high-severity-unlinked', voc.id);
      const mute = await app.inject({
        method: 'PATCH',
        url: `/dashboard/recovery-items/${token}/presentation`,
        headers: headers(),
        payload: { action: 'mute' },
      });
      expect(mute.statusCode).toBe(200);
      const key: string = randomUUID();
      const result = await post(voc.id, cookie, key);
      expect(result.statusCode).toBe(200);
      expect(result.json().follow_up).toMatchObject({
        can_record: false,
        can_withdraw: true,
        decision: { reason: '추가 조치 불필요', actor_id: admin },
      });
      expect((await post(voc.id, cookie, key)).json()).toEqual(result.json());
      for (const tab of ['no-link', 'high-no-link']) {
        expect(
          (await get(`/vocs?view=inbox&tab=${tab}&managed_system_id=${ms}`)).items.some(
            (v: { id: string }) => v.id === voc.id,
          ),
        ).toBe(false);
      }
      expect(
        (await get(`/vocs?view=inbox&tab=no-task&managed_system_id=${ms}`)).items.some(
          (v: { id: string }) => v.id === voc.id,
        ),
      ).toBe(true);
      const history = await get(`/dashboard/recovery-history?managed_system_id=${ms}`);
      expect(history.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            item: expect.objectContaining({ recovery_item_id: token }),
            resolution: expect.objectContaining({
              outcome: 'resolved',
              evidence: 'command',
              action: 'recordVocNoFollowUp',
            }),
          }),
        ]),
      );
      const storedHistory = await handle.pool.query(
        'select actor_id from dashboard.recovery_history where workspace_id=$1 and recovery_item_id=$2',
        [workspace, token],
      );
      expect(storedHistory.rows).toEqual([{ actor_id: admin }]);
      const audits = await migrate.pool.query(
        "select event_type from core.audit_log where subject_id=$1 and event_type='voc_no_follow_up_recorded'",
        [voc.id],
      );
      expect(audits.rows).toHaveLength(1);
      const withdrawRequest = {
        method: 'DELETE' as const,
        url: `/vocs/${voc.id}/no-follow-up`,
        headers: headers(),
      };
      const withdrawn = await app.inject(withdrawRequest);
      expect((await app.inject(withdrawRequest)).json()).toEqual(withdrawn.json());
      expect(
        (
          await migrate.pool.query(
            "select event_type from core.audit_log where subject_id=$1 and event_type='voc_no_follow_up_withdrawn'",
            [voc.id],
          )
        ).rows,
      ).toHaveLength(1);
      expect(withdrawn.statusCode).toBe(200);
      expect(withdrawn.json().follow_up).toMatchObject({
        can_record: true,
        can_withdraw: false,
        decision: null,
      });
      const detail = await get(`/dashboard/recovery-items/${token}`);
      expect(detail).toMatchObject({ occurrence: 2, presentation: { state: 'visible' } });
      expect(
        (await get(`/vocs?view=inbox&tab=high-no-link&managed_system_id=${ms}`)).items.some(
          (v: { id: string }) => v.id === voc.id,
        ),
      ).toBe(true);
    },
  );
  it.each(['no-grant', 'explicit-deny', 'triage-only'] as const)(
    'honors %s without exposing internal detail',
    async (mode) => {
      const dev = await insertDevActor(handle, workspace, uid(mode));
      if (mode !== 'no-grant')
        await grantCapability(handle, workspace, dev.id, 'voc.triage', ms, admin);
      if (mode === 'explicit-deny')
        await denyCapability(handle, workspace, dev.id, 'voc.triage', ms, admin);
      const session = await loginAs(app, dev.externalId);
      const voc = await seed();
      const result = await post(voc.id, session);
      if (mode === 'triage-only') {
        expect(result.statusCode).toBe(200);
        expect(result.json()).not.toHaveProperty('follow_up');
        const withdraw = await app.inject({
          method: 'DELETE',
          url: `/vocs/${voc.id}/no-follow-up`,
          headers: headers(session),
        });
        expect(withdraw.statusCode).toBe(200);
        expect(withdraw.json()).not.toHaveProperty('follow_up');
      } else {
        expect(result.statusCode).toBe(403);
        expect(result.json().code).toBe(
          mode === 'no-grant' ? 'permission.scope_required' : 'permission.denied',
        );
        expect(
          (
            await handle.pool.query('select * from voc.no_follow_up_decisions where voc_id=$1', [
              voc.id,
            ])
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await migrate.pool.query(
              "select * from core.audit_log where subject_id=$1 and event_type like 'voc_no_follow_up_%'",
              [voc.id],
            )
          ).rows,
        ).toHaveLength(0);
      }
    },
  );
  it('rejects non-high and duplicate decisions; reporter-only GET omits internal state', async () => {
    expect((await post((await seed('medium')).id)).statusCode).toBe(409);
    const voc = await seed();
    expect((await post(voc.id)).statusCode).toBe(200);
    expect((await post(voc.id)).statusCode).toBe(409);
    const session = await loginAs(app, 'mock-user-1');
    const read = await app.inject({
      method: 'GET',
      url: `/vocs/${voc.id}`,
      headers: headers(session),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).not.toHaveProperty('follow_up');
    await handle.pool.query("update voc.vocs set severity='medium' where id=$1", [voc.id]);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/vocs/${voc.id}/no-follow-up`,
          headers: headers(),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await get(`/dashboard/recovery-items/${recoveryIdentity('high-severity-unlinked', voc.id)}`))
        .state,
    ).not.toBe('active');
  });
  it.each(['null', 'active', 'archived'] as const)(
    'moves all endpoint counts and exact Area destination for %s Area',
    async (context) => {
      const voc = await seed();
      let area: string | null = null;
      if (context !== 'null') {
        area =
          (
            await migrate.pool.query<{ id: string }>(
              'insert into core.analytics_areas(workspace_id,managed_system_id,slug,name,archived_at) values($1,$2,$3,$4,$5) returning id',
              [
                workspace,
                ms,
                uid(prefix),
                'Decision Area',
                context === 'archived' ? new Date() : null,
              ],
            )
          ).rows[0]?.id ?? missingFixture();
        await handle.pool.query('update voc.vocs set analytics_area_id=$1 where id=$2', [
          area,
          voc.id,
        ]);
      }
      async function snapshot(included = true) {
        const nav = (await get(`/nav/counts?managed_system_id=${ms}`)).counts['voc.inbox.no-link'];
        const summary = (await get(
          `/dashboard/summary?managed_system_id=${ms}`,
        )) as DashboardSummary;
        const queue =
          summary.action_queues.find((q) => q.id === 'high-severity-unlinked')?.count ??
          missingFixture();
        const ratio = summary.coverage.find((c) => c.id === 'high-followup') ?? missingFixture();
        const report = (await get(
          `/dashboard/analytics-areas?managed_system_id=${ms}`,
        )) as DashboardAreaReport;
        const metric =
          report.items.find((r) => r.analytics_area_id === area)?.voc?.high_no_followup ??
          missingFixture();
        if (metric.link) {
          const params = new URLSearchParams(metric.link.search);
          if (params.has('managedSystem')) {
            params.set('managed_system_id', params.get('managedSystem') ?? missingFixture());
            params.delete('managedSystem');
          }
          const destination = await get(`${metric.link.pathname}?${params}`);
          expect(destination.items).toHaveLength(metric.count);
          expect(destination.items.some((v: { id: string }) => v.id === voc.id)).toBe(included);
        }
        const recovery = await get(
          `/dashboard/recovery-items?category=high-severity-unlinked&managed_system_id=${ms}`,
        );
        return {
          nav,
          queue,
          value: ratio.value,
          total: ratio.total,
          area: metric.count,
          recovery: recovery.items.some(
            (i: { recovery_item_id: string }) =>
              i.recovery_item_id === recoveryIdentity('high-severity-unlinked', voc.id),
          ),
        };
      }
      const before = await snapshot();
      expect((await post(voc.id)).statusCode).toBe(200);
      const after = await snapshot(false);
      expect(after).toEqual({
        nav: before.nav - 1,
        queue: before.queue - 1,
        value: before.value + 1,
        total: before.total,
        area: before.area - 1,
        recovery: false,
      });
      const withdrawn = await app.inject({
        method: 'DELETE',
        url: `/vocs/${voc.id}/no-follow-up`,
        headers: headers(),
      });
      expect(withdrawn.statusCode).toBe(200);
      expect(await snapshot()).toEqual(before);
    },
  );

  it.each(['direct', 'cluster'] as const)(
    'honors hidden %s follow-up, attach/detach and decision withdrawal truth',
    async (origin) => {
      const dev = await insertDevActor(handle, workspace, uid(prefix));
      await grantCapability(handle, workspace, dev.id, 'voc.read', ms, admin);
      await grantCapability(handle, workspace, dev.id, 'voc.triage', ms, admin);
      const session = await loginAs(app, dev.externalId);
      const voc = await seed();
      const finding = await insertFindingRow(handle, {
        workspaceId: workspace,
        primaryManagedSystemId: ms,
        sourceId: randomUUID(),
        createdBy: admin,
      });
      let source = voc.id;
      if (origin === 'cluster') {
        source = (
          await insertVocClusterRow(handle, {
            workspaceId: workspace,
            primaryManagedSystemId: ms,
            createdBy: admin,
          })
        ).id;
        await insertVocClusterMemberRow(handle, {
          clusterId: source,
          vocId: voc.id,
          addedBy: admin,
        });
      }
      const link =
        (
          await migrate.pool.query<{ id: string }>(
            "insert into core.entity_links(workspace_id,managed_system_id,source_type,source_id,target_type,target_id,relation_type,created_by) values($1,$2,$3,$4,'finding',$5,'evidence_of',$6) returning id",
            [
              workspace,
              ms,
              origin === 'cluster' ? 'voc_cluster' : 'voc',
              source,
              finding.id,
              admin,
            ],
          )
        ).rows[0]?.id ?? missingFixture();
      const read = await app.inject({
        method: 'GET',
        url: `/vocs/${voc.id}`,
        headers: headers(session),
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().follow_up.can_record).toBe(false);
      expect(read.body).not.toContain(finding.id);
      expect((await post(voc.id, session)).statusCode).toBe(409);
      await migrate.pool.query("update core.entity_links set status='detached' where id=$1", [
        link,
      ]);
      expect((await post(voc.id, session)).statusCode).toBe(200);
      await migrate.pool.query("update core.entity_links set status='active' where id=$1", [link]);
      expect(
        (await get(`/vocs?view=inbox&tab=high-no-link&managed_system_id=${ms}`)).items.some(
          (v: { id: string }) => v.id === voc.id,
        ),
      ).toBe(false);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/vocs/${voc.id}/no-follow-up`,
            headers: headers(session),
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await get(
            `/dashboard/recovery-items/${recoveryIdentity('high-severity-unlinked', voc.id)}`,
          )
        ).state,
      ).toBe('resolved');
      await migrate.pool.query("update core.entity_links set status='detached' where id=$1", [
        link,
      ]);
      expect(
        (await get(`/vocs?view=inbox&tab=high-no-link&managed_system_id=${ms}`)).items.some(
          (v: { id: string }) => v.id === voc.id,
        ),
      ).toBe(true);
    },
  );

  it.each(['explicit-admin-deny', 'expired', 'revoked'] as const)(
    'preserves deny-first %s envelopes without state/audit/history writes',
    async (mode) => {
      const externalId = `mock-dev-read-${uid(prefix)}`;
      const actor =
        mode === 'explicit-admin-deny'
          ? {
              ...(await insertActorRow(handle, {
                workspaceId: workspace,
                externalId,
                roleLevel: 'admin',
              })),
              externalId,
            }
          : await insertDevActor(handle, workspace, uid(prefix));
      if (mode === 'explicit-admin-deny')
        await denyCapability(handle, workspace, actor.id, 'voc.triage', ms, admin);
      else {
        const grant = await grantCapability(handle, workspace, actor.id, 'voc.triage', ms, admin);
        if (mode === 'expired') await expireCapabilityGrant(handle, grant);
        else await revokeCapabilityGrant(handle, grant, admin);
      }
      const voc = await seed('medium');
      const response = await post(voc.id, await loginAs(app, actor.externalId));
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe(
        mode === 'explicit-admin-deny' ? 'permission.denied' : 'permission.scope_required',
      );
      if (mode !== 'explicit-admin-deny')
        expect(response.json().requestable_permission).toEqual({
          permission: 'voc.triage',
          managed_system_id: ms,
          reason_required: false,
        });
      expect(
        (
          await handle.pool.query('select * from voc.no_follow_up_decisions where voc_id=$1', [
            voc.id,
          ])
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await migrate.pool.query(
            "select * from core.audit_log where subject_id=$1 and event_type like 'voc_no_follow_up_%'",
            [voc.id],
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await handle.pool.query(
            'select * from dashboard.recovery_identities where recovery_item_id=$1',
            [recoveryIdentity('high-severity-unlinked', voc.id)],
          )
        ).rows,
      ).toHaveLength(0);
    },
  );
  it.each(['source', 'parent'] as const)(
    'retains the archived %s guard for record and withdrawal',
    async (archived) => {
      const parent = await insertMsDirectly(handle, workspace, uid(prefix), 'Archived guard');
      const voc = await insertVocDirectly(handle, workspace, parent, reporter, uid(prefix), {
        severity: 'high',
      });
      const setArchived = (value: Date | null) =>
        migrate.pool.query(
          archived === 'source'
            ? 'update voc.vocs set archived_at=$1 where id=$2'
            : 'update core.managed_systems set archived_at=$1 where id=$2',
          [value, archived === 'source' ? voc.id : parent],
        );
      await setArchived(new Date());
      expect((await post(voc.id)).json().code).toBe(
        archived === 'source' ? 'conflict.record_archived' : 'conflict.parent_archived',
      );
      await setArchived(null);
      expect((await post(voc.id)).statusCode).toBe(200);
      await setArchived(new Date());
      const withdrawn = await app.inject({
        method: 'DELETE',
        url: `/vocs/${voc.id}/no-follow-up`,
        headers: headers(),
      });
      expect(withdrawn.json().code).toBe(
        archived === 'source' ? 'conflict.record_archived' : 'conflict.parent_archived',
      );
      expect(
        (
          await handle.pool.query(
            'select withdrawn_at from voc.no_follow_up_decisions where voc_id=$1',
            [voc.id],
          )
        ).rows,
      ).toEqual([{ withdrawn_at: null }]);
      await setArchived(null);
    },
  );
  it('validates body, UUIDv4 key, bodyless withdrawal and missing subject before any writes', async () => {
    const voc = await seed();
    for (const payload of [
      { reason: '  ' },
      { reason: 'x'.repeat(2001) },
      { reason: 'valid', extra: true },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/vocs/${voc.id}/no-follow-up`,
            headers: headers(),
            payload,
          })
        ).statusCode,
      ).toBe(422);
    }
    expect((await post(voc.id, cookie, 'invalid')).statusCode).toBe(422);
    const unavailable = await app.inject({
      method: 'DELETE',
      url: `/vocs/${voc.id}/no-follow-up`,
      headers: headers(),
    });
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.json().detail.failure_code).toBe('action_no_longer_available');
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/vocs/${voc.id}/no-follow-up`,
          headers: headers(),
          payload: {},
        })
      ).statusCode,
    ).toBe(422);
    expect((await post(randomUUID())).statusCode).toBe(404);
    expect(
      (
        await handle.pool.query('select * from voc.no_follow_up_decisions where voc_id=$1', [
          voc.id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
