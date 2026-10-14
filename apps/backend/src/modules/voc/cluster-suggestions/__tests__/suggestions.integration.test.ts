import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../../config.js';
import { type DbHandle, createDb } from '../../../../db/client.js';
import { buildServer } from '../../../../server.js';
import { insertActorRow } from '../../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../../test-support/auth.js';
import { insertMsDirectly } from '../../../../test-support/core-fixtures.js';
import {
  grantCapability,
  insertPermissionRequestRow,
  revokeCapabilityGrant,
} from '../../../../test-support/permissions-fixtures.js';
import { waitForRecoveryCommandWaiters } from '../../../../test-support/recovery-command-barrier.js';
import {
  cleanupVocClusterFixtures,
  insertVocClusterMemberRow,
  insertVocClusterRow,
} from '../../../../test-support/voc-cluster-fixtures.js';
import { insertVocDirectly } from '../../../../test-support/voc-fixtures.js';
import { recoveryIdentity } from '../../../dashboard/identity.js';
import type { EmbeddingProvider } from '../../embedding/port.js';
import { deriveVocEmbeddingInput } from '../../embedding/text.js';
import { runVocClusterSuggestions } from '../../jobs/cluster-suggestions.js';
import { type SuggestionRow, pendingPage } from '../repo.js';

const testIdentity = { provider: 'test', model: 'suggestions', dimensions: 3 };
const testProvider: EmbeddingProvider = {
  identity: () => testIdentity,
  embed: async () => {
    throw new Error('Hand-vector suggestion fixtures must not call a provider');
  },
};

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
function boundedUrl(value: string) {
  const url = new URL(value);
  url.searchParams.set('options', '-c statement_timeout=15000 -c lock_timeout=5000');
  return url.toString();
}
const runIntegration = Boolean(APP_URL && MIGRATE_URL && process.env.WORKSPACE_ID);

describe.skipIf(!runIntegration)(
  'bounded Cluster suggestions: real routes and roles (#1097)',
  () => {
    let db: DbHandle;
    let ops: DbHandle;
    let app: FastifyInstance;
    let ws: string;
    let ms: string;
    let admin: string;
    let cookie: string;
    let actors: string[];
    let systems: string[];
    let vocIds: string[];
    let grantIds: string[];
    const headers = (c = cookie, key = randomUUID()) => ({
      cookie: `${SESSION_COOKIE_NAME}=${c}`,
      'idempotency-key': key,
    });
    beforeEach(async () => {
      db = createDb(boundedUrl(APP_URL));
      ops = createDb(boundedUrl(MIGRATE_URL));
      actors = [];
      systems = [];
      vocIds = [];
      grantIds = [];
      ws = randomUUID();
      await ops.pool.query('insert into core.workspaces(id,name) values($1,$2)', [
        ws,
        `suggestions-${ws}`,
      ]);
      const actor = await insertActorRow(ops, {
        workspaceId: ws,
        externalId: `sg-admin-${ws}`,
        roleLevel: 'admin',
      });
      admin = actor.id;
      actors.push(admin);
      ms = await newMs();
      await ops.pool.query(
        'insert into core.workspace_settings(workspace_id,voc_cluster_suggestions_enabled) values($1,true)',
        [ws],
      );
      await db.pool.query('delete from core.rate_limits');
      process.env.NODE_ENV = 'test';
      app = await buildServer({
        dbHandle: db,
        embeddingProvider: testProvider,
        config: {
          ...loadConfig(),
          WORKSPACE_ID: ws,
          EMBEDDING_PROVIDER: 'fake',
          EMBEDDING_VERSION: 1,
        },
      });
      await app.ready();
      cookie = await loginAs(app, `sg-admin-${ws}`);
    });
    afterEach(async () => {
      if (!ops) return;
      await app?.close();
      const clusters = await ops.pool.query<{ id: string }>(
        'select id from voc_cluster.voc_clusters where workspace_id=$1',
        [ws],
      );
      for (const table of [
        'voc_cluster_suggestions',
        'voc_cluster_suggestion_admissions',
        'voc_cluster_suggestion_cursors',
        'voc_cluster_suggestion_counters',
      ]) {
        await ops.pool.query(`delete from voc.${table} where workspace_id=$1`, [ws]);
      }
      await ops.pool.query('delete from core.audit_log where workspace_id=$1', [ws]);
      await ops.pool.query('delete from core.rate_limits where key like $1::text', [`${ws}:%`]);
      await ops.pool.query('delete from core.notifications where workspace_id=$1', [ws]);
      await ops.pool.query('delete from permission.permission_requests where workspace_id=$1', [
        ws,
      ]);
      await ops.pool.query('delete from permission.permission_grants where workspace_id=$1', [ws]);
      await ops.pool.query('delete from permission.permission_denies where workspace_id=$1', [ws]);
      await ops.pool.query('delete from core.workspace_settings where workspace_id=$1', [ws]);
      await cleanupVocClusterFixtures(ops, {
        workspaceId: ws,
        actorIds: actors,
        managedSystemIds: systems,
        vocIds,
        clusterIds: clusters.rows.map((r) => r.id),
        findingIds: [],
        permissionGrantIds: grantIds,
        deleteWorkspace: true,
      });
      await db.close();
      await ops.close();
    });
    async function newMs() {
      const id = await insertMsDirectly(ops, ws, `sg-${randomUUID()}`, 'suggestions');
      systems.push(id);
      return id;
    }
    async function voc(system = ms, vector = '[1,0,0]') {
      const v = await insertVocDirectly(ops, ws, system, admin, `suggestion ${randomUUID()}`);
      vocIds.push(v.id);
      const source = await ops.pool.query(
        'select title,description_rich_content from voc.vocs where id=$1',
        [v.id],
      );
      const hash = deriveVocEmbeddingInput({
        title: source.rows[0].title,
        descriptionRichContent: source.rows[0].description_rich_content,
      }).sourceHash;
      await ops.pool.query(
        `insert into voc.voc_embeddings(voc_id,workspace_id,embedding_version,provider,model,dimensions,embedding,source_hash,updated_at)
      select id,workspace_id,1,'test','suggestions',3,$2::vector,$3,updated_at from voc.vocs where id=$1`,
        [v.id, vector, hash],
      );
      return v.id;
    }
    async function run(
      version = 1,
      enabled = true,
      handle = db,
      identity = {
        ...testIdentity,
        model: version === 2 ? 'v2' : testIdentity.model,
      },
    ) {
      return runVocClusterSuggestions(
        {
          db: handle.db,
          embeddingVersion: version,
          embeddingEnabled: enabled,
          embeddingIdentity: identity,
        },
        { correlation_id: randomUUID(), workspace_id: ws },
      );
    }
    async function rows() {
      return (
        await ops.pool.query(
          'select * from voc.voc_cluster_suggestions where workspace_id=$1 order by voc_a_id,voc_b_id',
          [ws],
        )
      ).rows;
    }
    async function list(c = cookie) {
      return app.inject({ method: 'GET', url: '/voc-cluster-suggestions', headers: headers(c) });
    }
    async function action(
      name: string,
      row: SuggestionRow,
      input: Record<string, unknown> = {},
      c = cookie,
      key = randomUUID(),
    ) {
      return app.inject({
        method: 'POST',
        url: `/voc-cluster-suggestions/${row.id}/${name}`,
        headers: headers(c, key),
        payload: {
          expected_revision: row.revision,
          ...(name !== 'discard'
            ? {
                embedding_version: row.embedding_version,
                source_hashes: [row.source_hash_a, row.source_hash_b],
              }
            : {}),
          ...input,
        },
      });
    }
    async function pair(system = ms) {
      return [await voc(system), await voc(system)] as const;
    }
    async function pending() {
      await pair();
      await run();
      const row = (await rows())[0];
      expect(row).toBeDefined();
      return row;
    }
    async function domainCounts() {
      const result: Record<string, string> = {};
      for (const table of [
        'voc_cluster.voc_clusters',
        'voc_cluster.voc_cluster_members',
        'voc.voc_recommendation_decisions',
        'core.audit_log',
        'core.entity_links',
      ]) {
        result[table] = (
          await ops.pool.query(`select count(*)::text as n from ${table}`)
        ).rows[0].n;
      }
      return result;
    }

    it('generates one disjoint pair; retry spends no slot and read writes no domain rows', async () => {
      await pair();
      await voc();
      const beforeGeneration = await domainCounts();
      await run();
      expect(await domainCounts()).toEqual(beforeGeneration);
      const first = await rows();
      expect(first).toHaveLength(1);
      await run();
      expect(await rows()).toEqual(first);
      expect(
        (
          await ops.pool.query(
            'select new_admissions from voc.voc_cluster_suggestion_admissions where workspace_id=$1',
            [ws],
          )
        ).rows[0].new_admissions,
      ).toBe(1);
      const before = await domainCounts();
      const response = await list();
      expect(response.statusCode).toBe(200);
      expect(response.json().items).toHaveLength(1);
      expect(response.json()).not.toHaveProperty('total');
      expect(await domainCounts()).toEqual(before);
    });
    it.each([
      'setting off',
      'provider off',
      'archived',
      'stale watermark',
      'wrong hash',
      'wrong dimensions',
      'wrong model',
      'cross MS',
      'draft member',
      'confirmed member',
      'dismiss forward',
      'dismiss reverse',
    ])('does not admit %s', async (reason) => {
      const [a, b] = await pair();
      if (reason === 'setting off')
        await ops.pool.query(
          'update core.workspace_settings set voc_cluster_suggestions_enabled=false where workspace_id=$1',
          [ws],
        );
      if (reason === 'archived')
        await ops.pool.query('update voc.vocs set archived_at=now() where id=$1', [a]);
      if (reason === 'stale watermark')
        await ops.pool.query(
          "update voc.voc_embeddings set updated_at=updated_at-interval '1 second' where voc_id=$1",
          [a],
        );
      if (reason === 'wrong hash')
        await ops.pool.query("update voc.voc_embeddings set source_hash='wrong' where voc_id=$1", [
          a,
        ]);
      if (reason === 'wrong dimensions')
        await ops.pool.query(
          "update voc.voc_embeddings set dimensions=2,embedding='[1,0]'::vector where voc_id=$1",
          [a],
        );
      if (reason === 'wrong model')
        await ops.pool.query("update voc.voc_embeddings set model='other' where voc_id=$1", [a]);
      if (reason === 'cross MS')
        await ops.pool.query('update voc.vocs set primary_managed_system_id=$2 where id=$1', [
          b,
          await newMs(),
        ]);
      if (reason.endsWith('member')) {
        const c = await insertVocClusterRow(ops, {
          workspaceId: ws,
          primaryManagedSystemId: ms,
          createdBy: admin,
          status: reason === 'draft member' ? 'draft' : 'confirmed',
        });
        await insertVocClusterMemberRow(ops, { clusterId: c.id, vocId: a, addedBy: admin });
      }
      if (reason.startsWith('dismiss'))
        await ops.pool.query(
          `insert into voc.voc_recommendation_decisions(workspace_id,source_voc_id,candidate_voc_id,embedding_version,scope_key,state,decided_by)
      values($1,$2,$3,1,'all','dismissed',$4)`,
          [ws, reason === 'dismiss forward' ? a : b, reason === 'dismiss forward' ? b : a, admin],
        );
      await run(1, reason !== 'provider off');
      expect(await rows()).toHaveLength(0);
    });
    async function seedPair(system = ms, score = 1) {
      const [a, b] = [...(await pair(system))].sort();
      if (score !== 1) {
        await ops.pool.query('update voc.voc_embeddings set embedding=$2::vector where voc_id=$1', [
          b,
          JSON.stringify([score, Math.sqrt(1 - score * score), 0]),
        ]);
      }
      const result = await ops.pool.query(
        `insert into voc.voc_cluster_suggestions(workspace_id,primary_managed_system_id,voc_a_id,voc_b_id,
      provider,model,dimensions,embedding_version,source_hash_a,source_hash_b,embedding_watermark_a,embedding_watermark_b,score,cut,run_correlation_id)
      select $1,$2,$3::uuid,$4::uuid,e.provider,e.model,e.dimensions,1,e.source_hash,f.source_hash,e.updated_at,f.updated_at,(1-(e.embedding <=> f.embedding)),0.85,$5
      from voc.voc_embeddings e cross join voc.voc_embeddings f where e.voc_id=$3::uuid and f.voc_id=$4::uuid and e.embedding_version=1 and f.embedding_version=1 returning *`,
        [ws, system, a, b, randomUUID()],
      );
      return result.rows[0];
    }
    async function persona(role: 'user' | 'developer', read = false, manage = false) {
      const externalId = `sg-${randomUUID()}`;
      const actor = await insertActorRow(ops, { workspaceId: ws, externalId, roleLevel: role });
      actors.push(actor.id);
      if (read)
        for (const capability of ['voc.read', 'finding.read'])
          grantIds.push(await grantCapability(ops, ws, actor.id, capability, ms, admin));
      if (manage)
        grantIds.push(await grantCapability(ops, ws, actor.id, 'finding.manage', ms, admin));
      return { id: actor.id, cookie: await loginAs(app, externalId) };
    }
    it.each(['user', 'ungranted developer', 'finding only'])(
      'hides entire pairs from %s, with no count',
      async (kind) => {
        await pending();
        const p = await persona(kind === 'user' ? 'user' : 'developer');
        if (kind === 'finding only')
          grantIds.push(await grantCapability(ops, ws, p.id, 'finding.read', ms, admin));
        const response = await list(p.cookie);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ available: true, items: [] });
      },
    );
    it.each(['finding scope', 'VOC A', 'VOC B'])(
      'hidden higher-score rows do not consume the read ceiling: %s',
      async (guard) => {
        const hiddenMs = await newMs();
        const p = await persona('developer', true);
        for (let i = 0; i < 4; i++) {
          const hidden = await seedPair(hiddenMs);
          if (guard !== 'finding scope')
            await ops.pool.query('update voc.vocs set reporter_id=$2 where id=$1', [
              guard === 'VOC A' ? hidden.voc_b_id : hidden.voc_a_id,
              p.id,
            ]);
        }
        const visible = await seedPair(ms, 0.99);
        const capability = guard === 'finding scope' ? 'voc.read' : 'finding.read';
        grantIds.push(await grantCapability(ops, ws, p.id, capability, hiddenMs, admin));
        const bounded = await buildServer({
          dbHandle: db,
          config: { ...loadConfig(), WORKSPACE_ID: ws, EMBEDDING_PROVIDER: 'fake' },
          embeddingProvider: testProvider,
          suggestionPageSize: 2,
          suggestionReadScanCeiling: 2,
        });
        try {
          const response = await bounded.inject({
            method: 'GET',
            url: '/voc-cluster-suggestions',
            headers: headers(p.cookie),
          });
          expect(response.statusCode).toBe(200);
          expect(response.json().items.map((r: { id: string }) => r.id)).toEqual([visible.id]);
        } finally {
          await bounded.close();
        }
      },
    );
    it('pages tied pairs across MSs and counts the eligible tie at the workspace cap', async () => {
      const old = await seedPair(ms);
      const currentMs = await newMs();
      await ops.pool.query(
        'update voc.vocs set primary_managed_system_id=$2 where id=any($1::uuid[])',
        [[old.voc_a_id, old.voc_b_id], currentMs],
      );
      await ops.pool.query(
        `update voc.voc_embeddings e set updated_at=v.updated_at from voc.vocs v
         where e.voc_id=v.id and v.id=any($1::uuid[])`,
        [[old.voc_a_id, old.voc_b_id]],
      );
      const inserted = await ops.pool.query(
        `insert into voc.voc_cluster_suggestions
        (id,workspace_id,primary_managed_system_id,voc_a_id,voc_b_id,provider,model,dimensions,
         embedding_version,source_hash_a,source_hash_b,embedding_watermark_a,embedding_watermark_b,score,cut,run_correlation_id)
        select 'ffffffff-ffff-4fff-bfff-ffffffffffff'::uuid,s.workspace_id,$2,s.voc_a_id,s.voc_b_id,
         s.provider,s.model,s.dimensions,s.embedding_version,s.source_hash_a,s.source_hash_b,
         e.updated_at,f.updated_at,s.score,s.cut,s.run_correlation_id
        from voc.voc_cluster_suggestions s
        join voc.voc_embeddings e on e.voc_id=s.voc_a_id and e.embedding_version=s.embedding_version
        join voc.voc_embeddings f on f.voc_id=s.voc_b_id and f.embedding_version=s.embedding_version
        where s.id=$1 returning *`,
        [old.id, currentMs],
      );
      const current = inserted.rows[0];
      // Deterministic seek check: the page after the old tied row must reach the current row (higher id).
      const afterOld = await db.db.transaction((tx) =>
        pendingPage(
          tx,
          ws,
          { score: old.score, voc_a_id: old.voc_a_id, voc_b_id: old.voc_b_id, id: old.id },
          undefined,
          1,
        ),
      );
      expect(afterOld.map((r) => r.id)).toEqual([current.id]);
      const bounded = await buildServer({
        dbHandle: db,
        config: { ...loadConfig(), WORKSPACE_ID: ws, EMBEDDING_PROVIDER: 'fake' },
        embeddingProvider: testProvider,
        suggestionPageSize: 1,
      });
      try {
        const response = await bounded.inject({
          method: 'GET',
          url: '/voc-cluster-suggestions',
          headers: headers(),
        });
        expect(response.json().items.map((r: { id: string }) => r.id)).toEqual([current.id]);
      } finally {
        await bounded.close();
      }
      for (let i = 0; i < 19; i++) await seedPair(await newMs());
      await pair(await newMs());
      await runVocClusterSuggestions(
        {
          db: db.db,
          embeddingVersion: 1,
          embeddingEnabled: true,
          embeddingIdentity: testIdentity,
          suggestionPageSize: 1,
        },
        { correlation_id: randomUUID(), workspace_id: ws },
      );
      expect(await rows()).toHaveLength(21); // 20 eligible plus retained old scope.
      const counter = await ops.pool.query(
        'select eligible_pending_count from voc.voc_cluster_suggestion_counters where workspace_id=$1',
        [ws],
      );
      expect(counter.rows[0].eligible_pending_count).toBe(20);
    });
    it.each(['developer without Finding read', 'user with both reads'])(
      'requires elevated Finding read independently: %s',
      async (kind) => {
        await pending();
        const p = await persona(kind.startsWith('user') ? 'user' : 'developer');
        grantIds.push(await grantCapability(ops, ws, p.id, 'voc.read', ms, admin));
        if (kind.startsWith('user'))
          grantIds.push(await grantCapability(ops, ws, p.id, 'finding.read', ms, admin));
        const response = await list(p.cookie);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ available: true, items: [] });
      },
    );
    it('pages past more than 20 stale rows and applies the visible limit after C6', async () => {
      for (let i = 0; i < 105; i++) {
        const row = await seedPair(ms, 1);
        await ops.pool.query(
          "update voc.voc_embeddings set source_hash='obsolete' where voc_id=$1",
          [row.voc_a_id],
        );
      }
      const valid = await seedPair(ms, 0.99);
      const response = await list();
      expect(response.json().items.map((r: { id: string }) => r.id)).toEqual([valid.id]);
    });
    it('counts genuinely eligible pairs beyond the first page and refuses the 21st', async () => {
      for (let i = 0; i < 101; i++) {
        const row = await seedPair(ms, 1);
        await ops.pool.query(
          "update voc.voc_embeddings set source_hash='obsolete' where voc_id=$1",
          [row.voc_a_id],
        );
      }
      for (let i = 0; i < 20; i++) await seedPair(await newMs(), 0.99);
      await pair();
      await run();
      expect(
        (
          await ops.pool.query(
            'select eligible_pending_count from voc.voc_cluster_suggestion_counters where workspace_id=$1',
            [ws],
          )
        ).rows[0].eligible_pending_count,
      ).toBe(20);
      expect(await rows()).toHaveLength(121);
      const visible = await list();
      expect(visible.json().items).toHaveLength(20);
      expect(visible.json()).not.toHaveProperty('total');
    });
    it('metadata refresh with a full hourly bucket spends no slot; identical retry is untouched', async () => {
      const old = await pending();
      await ops.pool.query(
        "update voc.voc_embeddings set embedding_version=2,model='v2' where workspace_id=$1",
        [ws],
      );
      await ops.pool.query(
        `insert into voc.voc_cluster_suggestion_admissions(workspace_id,primary_managed_system_id,window_start,new_admissions)
      values($1,$2,date_trunc('hour',now() at time zone 'UTC') at time zone 'UTC',5)
      on conflict(workspace_id,primary_managed_system_id,window_start) do update set new_admissions=5`,
        [ws, ms],
      );
      await run(2);
      const refreshed = (await rows())[0];
      expect(refreshed.id).toBe(old.id);
      expect(refreshed.revision).toBe(2);
      expect(refreshed.embedding_version).toBe(2);
      await run(2);
      expect(await rows()).toEqual([refreshed]);
      expect(
        (
          await ops.pool.query(
            'select new_admissions from voc.voc_cluster_suggestion_admissions where workspace_id=$1',
            [ws],
          )
        ).rows[0].new_admissions,
      ).toBe(5);
    });
    it('defers the sixth hourly admission and reconciliation discovers it in the next hour', async () => {
      for (let i = 0; i < 6; i++) {
        const ids = await pair();
        const vector = JSON.stringify(Array.from({ length: 8 }, (_, j) => (j === i ? 1 : 0)));
        await ops.pool.query(
          'update voc.voc_embeddings set dimensions=8,embedding=$2::vector where voc_id=any($1::uuid[])',
          [ids, vector],
        );
      }
      await run(1, true, db, { ...testIdentity, dimensions: 8 });
      expect(await rows()).toHaveLength(5);
      await run(1, true, db, { ...testIdentity, dimensions: 8 });
      expect(await rows()).toHaveLength(5);
      // Admission identity is immutable (0062 trigger): move the bucket to the previous hour by delete + insert.
      await ops.pool.query(
        `with old as (
           delete from voc.voc_cluster_suggestion_admissions where workspace_id=$1
           returning workspace_id, primary_managed_system_id, window_start, new_admissions)
         insert into voc.voc_cluster_suggestion_admissions
           (workspace_id, primary_managed_system_id, window_start, new_admissions)
         select workspace_id, primary_managed_system_id, window_start - interval '1 hour', new_admissions from old`,
        [ws],
      );
      await run(1, true, db, { ...testIdentity, dimensions: 8 });
      expect(await rows()).toHaveLength(6);
      expect(
        (
          await ops.pool.query(
            'select sum(new_admissions)::int as n from voc.voc_cluster_suggestion_admissions where workspace_id=$1',
            [ws],
          )
        ).rows[0].n,
      ).toBe(6);
    });
    it('excludes ten vetoed nearer neighbours before the neighbour limit', async () => {
      const source = await voc();
      const cluster = await insertVocClusterRow(ops, {
        workspaceId: ws,
        primaryManagedSystemId: ms,
        createdBy: admin,
      });
      for (let i = 0; i < 10; i++)
        await insertVocClusterMemberRow(ops, {
          clusterId: cluster.id,
          vocId: await voc(),
          addedBy: admin,
        });
      const valid = await voc(ms, '[0.99,0.1,0]');
      await run();
      const row = (await rows())[0];
      expect([row.voc_a_id, row.voc_b_id].sort()).toEqual([source, valid].sort());
    });
    it('confirms atomically with human provenance, five audits and 200 replay', async () => {
      const row = await pending();
      const p = await persona('developer', true, true);
      const key = randomUUID();
      const result = await action('confirm', row, {}, p.cookie, key);
      expect(result.statusCode).toBe(201);
      const id = result.json().voc_cluster_id;
      const cluster = (
        await ops.pool.query('select * from voc_cluster.voc_clusters where id=$1', [id])
      ).rows[0];
      expect(cluster).toMatchObject({ status: 'confirmed', created_by: p.id, confirmed_by: p.id });
      expect(cluster.confirmed_at).not.toBeNull();
      const members = (
        await ops.pool.query(
          'select voc_id,added_by from voc_cluster.voc_cluster_members where cluster_id=$1 order by voc_id',
          [id],
        )
      ).rows;
      expect(members).toEqual([
        { voc_id: row.voc_a_id, added_by: p.id },
        { voc_id: row.voc_b_id, added_by: p.id },
      ]);
      const audits = (
        await ops.pool.query(
          "select event_type,detail,actor_id from core.audit_log where workspace_id=$1 and event_type like 'voc_cluster%'",
          [ws],
        )
      ).rows;
      expect(audits.map((r) => r.event_type).sort()).toEqual(
        [
          'voc_cluster_created',
          'voc_cluster_member_added',
          'voc_cluster_member_added',
          'voc_cluster_suggestion_confirmed',
          'voc_cluster_updated',
        ].sort(),
      );
      expect(audits.every((r) => r.actor_id === p.id)).toBe(true);
      const suggestionAudit = audits.find(
        (r) => r.event_type === 'voc_cluster_suggestion_confirmed',
      );
      expect(suggestionAudit.detail).toMatchObject({
        voc_a_id: row.voc_a_id,
        voc_b_id: row.voc_b_id,
        voc_cluster_id: id,
        revision: 2,
      });
      expect(suggestionAudit.detail).not.toHaveProperty('title');
      const created = audits.find((r) => r.event_type === 'voc_cluster_created');
      expect(created.detail.title).toBe(cluster.title);
      const before = await domainCounts();
      const replay = await action('confirm', row, {}, p.cookie, key);
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toEqual(result.json());
      expect(await domainCounts()).toEqual(before);
      expect(
        (await action('confirm', row, { expected_revision: 999 }, p.cookie, key)).json().code,
      ).toBe('conflict.idempotency_key_reuse');
      await ops.pool.query(
        'update permission.permission_grants set revoked_at=now(),revoked_by_actor_id=$2,revoked_reason=$3 where actor_id=$1',
        [p.id, admin, 'test'],
      );
      expect([403, 404]).toContain((await action('confirm', row, {}, p.cookie, key)).statusCode);
      expect(await domainCounts()).toEqual(before);
    });
    it.each([
      ['finding.manage', 403, 'permission.denied'],
      ['voc.read', 404, 'not_found.record'],
    ] as const)('confirm replay reauthorizes only-revoked %s', async (capability, status, code) => {
      const row = await pending();
      const p = await persona('developer');
      const grants = new Map<string, string>();
      for (const cap of ['voc.read', 'finding.read', 'finding.manage']) {
        const id = await grantCapability(ops, ws, p.id, cap, ms, admin);
        grantIds.push(id);
        grants.set(cap, id);
      }
      const key = randomUUID();
      const confirmed = await action('confirm', row, {}, p.cookie, key);
      expect(confirmed.statusCode, confirmed.body).toBe(201);
      const revokedGrant = grants.get(capability);
      if (!revokedGrant) throw new Error('Replay grant missing');
      await revokeCapabilityGrant(ops, revokedGrant, admin);
      const before = await domainCounts();
      const stored = await rows();
      const replay = await action('confirm', row, {}, p.cookie, key);
      expect(replay.statusCode, replay.body).toBe(status);
      expect(replay.json().code).toBe(code);
      expect(await domainCounts()).toEqual(before);
      expect(await rows()).toEqual(stored);
    });
    it.each(['provider', 'model', 'dimensions'] as const)(
      'rejects mutually compatible embeddings with inactive %s',
      async (field) => {
        const row = await pending();
        const other = {
          ...testIdentity,
          [field]: field === 'dimensions' ? 4 : 'inactive',
        };
        await ops.pool.query(
          `update voc.voc_embeddings set provider=$2,model=$3,dimensions=$4,
          embedding=$5::vector where workspace_id=$1`,
          [
            ws,
            other.provider,
            other.model,
            other.dimensions,
            field === 'dimensions' ? '[1,0,0,0]' : '[1,0,0]',
          ],
        );
        // Stored metadata agrees too: pair compatibility alone cannot reject this fixture.
        await ops.pool.query(
          'update voc.voc_cluster_suggestions set provider=$2,model=$3,dimensions=$4 where id=$1',
          [row.id, other.provider, other.model, other.dimensions],
        );
        await pair(await newMs());
        await ops.pool.query(
          `update voc.voc_embeddings set provider=$2,model=$3,dimensions=$4,
          embedding=$5::vector where workspace_id=$1`,
          [
            ws,
            other.provider,
            other.model,
            other.dimensions,
            field === 'dimensions' ? '[1,0,0,0]' : '[1,0,0]',
          ],
        );
        const before = await domainCounts();
        await run();
        expect(await rows()).toHaveLength(1);
        expect((await list()).json()).toEqual({ available: true, items: [] });
        const confirm = await action('confirm', row);
        expect(confirm.statusCode).toBe(409);
        expect(confirm.json().code).toBe('conflict.stale_write');
        expect(await domainCounts()).toEqual(before);
        expect((await action('discard', row)).statusCode).toBe(200);
        const discarded = (await rows())[0];
        const afterDiscard = await domainCounts();
        const restore = await action('restore', discarded);
        expect(restore.statusCode).toBe(409);
        expect(restore.json().code).toBe('conflict.stale_write');
        expect((await rows())[0]).toEqual(discarded);
        expect(await domainCounts()).toEqual(afterDiscard);
      },
    );
    it.each(['revision', 'hash', 'version', 'text', 'membership'])(
      'rejects stale confirm %s without domain effects',
      async (kind) => {
        const row = await pending();
        const input: Record<string, unknown> = {};
        if (kind === 'revision') input.expected_revision = 999;
        if (kind === 'hash') input.source_hashes = ['old', 'old'];
        if (kind === 'version') input.embedding_version = 2;
        if (kind === 'text')
          await ops.pool.query("update voc.vocs set title='changed',updated_at=now() where id=$1", [
            row.voc_a_id,
          ]);
        if (kind === 'membership') {
          const c = await insertVocClusterRow(ops, {
            workspaceId: ws,
            primaryManagedSystemId: ms,
            createdBy: admin,
          });
          await insertVocClusterMemberRow(ops, {
            clusterId: c.id,
            vocId: row.voc_a_id,
            addedBy: admin,
          });
        }
        const before = await domainCounts();
        const result = await action('confirm', row, input);
        expect(result.statusCode).toBe(409);
        expect(result.json().code).toBe('conflict.stale_write');
        expect(await domainCounts()).toEqual(before);
      },
    );
    it('discard keeps its original deadline and only its actor can undo, including restore no-op', async () => {
      const row = await pending();
      const discard = await action('discard', row);
      expect(discard.statusCode).toBe(200);
      const discarded = (await rows())[0];
      const again = await action('discard', discarded);
      expect(again.json().discarded_at).toBe(discard.json().discarded_at);
      expect(again.json().undo_until).toBe(discard.json().undo_until);
      const other = await persona('developer', true, true);
      expect((await action('restore', discarded, {}, other.cookie)).statusCode).toBe(403);
      const restore = await action('restore', discarded);
      expect(restore.statusCode).toBe(200);
      const restored = (await rows())[0];
      const before = await domainCounts();
      expect((await action('restore', restored)).json()).toEqual(restore.json());
      expect(await domainCounts()).toEqual(before);
    });
    it('discard veto suppresses a genuinely rescored pair across a model/version bump', async () => {
      const row = await pending();
      await action('discard', row);
      await ops.pool.query(
        "update voc.voc_embeddings set embedding_version=2,model='v2' where workspace_id=$1",
        [ws],
      );
      await run(2);
      expect(await rows()).toHaveLength(1);
      expect((await rows())[0]).toMatchObject({
        id: row.id,
        state: 'discarded',
        embedding_version: 1,
      });
    });
    it('terminal pair veto remains after both VOCs move to another Managed System', async () => {
      const row = await pending();
      await action('discard', row);
      const next = await newMs();
      await ops.pool.query(
        'update voc.vocs set primary_managed_system_id=$2 where id=any($1::uuid[])',
        [[row.voc_a_id, row.voc_b_id], next],
      );
      await run();
      expect(await rows()).toHaveLength(1);
      expect((await rows())[0].state).toBe('discarded');
    });
    it.each(['expiry', 'membership', 'dismissal'])(
      'keeps discard suppression on stale restore: %s',
      async (kind) => {
        const row = await pending();
        await action('discard', row);
        if (kind === 'expiry')
          await ops.pool.query(
            "update voc.voc_cluster_suggestions set discarded_at=now()-interval '6 minutes' where id=$1",
            [row.id],
          );
        if (kind === 'membership') {
          const c = await insertVocClusterRow(ops, {
            workspaceId: ws,
            primaryManagedSystemId: ms,
            createdBy: admin,
          });
          await insertVocClusterMemberRow(ops, {
            clusterId: c.id,
            vocId: row.voc_a_id,
            addedBy: admin,
          });
        }
        if (kind === 'dismissal')
          await ops.pool.query(
            `insert into voc.voc_recommendation_decisions(workspace_id,source_voc_id,candidate_voc_id,embedding_version,scope_key,state,decided_by)
      values($1,$2,$3,1,'all','dismissed',$4)`,
            [ws, row.voc_a_id, row.voc_b_id, admin],
          );
        const result = await action('restore', (await rows())[0]);
        expect(result.statusCode).toBe(409);
        expect((await rows())[0].state).toBe('discarded');
      },
    );
    it('retains confirmed veto after member removal and refuses discard/restore', async () => {
      const row = await pending();
      const response = await action('confirm', row);
      expect(response.statusCode).toBe(201);
      await ops.pool.query('delete from voc_cluster.voc_cluster_members where cluster_id=$1', [
        response.json().voc_cluster_id,
      ]);
      await ops.pool.query(
        "update voc.voc_embeddings set embedding_version=2,model='v2' where workspace_id=$1",
        [ws],
      );
      await run(2);
      expect(await rows()).toHaveLength(1);
      expect((await rows())[0].state).toBe('confirmed');
      for (const name of ['discard', 'restore'])
        expect((await action(name, (await rows())[0])).statusCode).toBe(409);
    });
    it('serializes two independent generation runs at the final workspace slot', async () => {
      for (let i = 0; i < 19; i++) {
        const system = await newMs();
        await seedPair(system);
        await ops.pool.query(
          `insert into voc.voc_cluster_suggestion_admissions(workspace_id,primary_managed_system_id,window_start,new_admissions)
        values($1,$2,(date_trunc('hour',now() at time zone 'UTC') at time zone 'UTC')-interval '1 hour',1)`,
          [ws, system],
        );
      }
      await pair();
      await pair(await newMs());
      const other = createDb(boundedUrl(APP_URL));
      try {
        await Promise.all([run(), run(1, true, other)]);
        expect(await rows()).toHaveLength(20);
        const counter = await ops.pool.query(
          'select eligible_pending_count from voc.voc_cluster_suggestion_counters where workspace_id=$1',
          [ws],
        );
        expect(counter.rows[0].eligible_pending_count).toBe(20);
        const current = await ops.pool.query(
          `select sum(new_admissions)::int as n from voc.voc_cluster_suggestion_admissions
        where workspace_id=$1 and window_start=date_trunc('hour',now() at time zone 'UTC') at time zone 'UTC'`,
          [ws],
        );
        expect(current.rows[0].n).toBe(1);
      } finally {
        await other.close();
      }
    });
    it('a stale pending pair releases the workspace cap', async () => {
      for (let i = 0; i < 20; i++) await seedPair(await newMs());
      const stale = (await rows())[0];
      await ops.pool.query("update voc.voc_embeddings set source_hash='obsolete' where voc_id=$1", [
        stale.voc_a_id,
      ]);
      await pair();
      await run();
      expect(await rows()).toHaveLength(21);
      expect(
        (
          await ops.pool.query(
            'select eligible_pending_count from voc.voc_cluster_suggestion_counters where workspace_id=$1',
            [ws],
          )
        ).rows[0].eligible_pending_count,
      ).toBe(20);
    });
    it('rechecks a setting switched off while generation waits for its recovery lock', async () => {
      await pair();
      const blocker = await db.pool.connect();
      let request: Promise<unknown> | undefined;
      try {
        await blocker.query('begin');
        await blocker.query(
          "select pg_advisory_xact_lock(hashtextextended('recovery-command:'||$1,0))",
          [ws],
        );
        const running = run();
        request = running;
        await waitForRecoveryCommandWaiters(
          ops,
          ws,
          1,
          running.then(() => ({ statusCode: 200 })),
        );
        await ops.pool.query(
          'update core.workspace_settings set voc_cluster_suggestions_enabled=false where workspace_id=$1',
          [ws],
        );
        await blocker.query('commit');
        await running;
        expect(await rows()).toHaveLength(0);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled(request ? [request] : []);
      }
    });
    it('confirm racing manual addMember completes with no partial Cluster or deadlock', async () => {
      const row = await pending();
      const cluster = await insertVocClusterRow(ops, {
        workspaceId: ws,
        primaryManagedSystemId: ms,
        createdBy: admin,
      });
      const blocker = await db.pool.connect();
      let requests: Promise<{ statusCode: number; body: string }>[] = [];
      try {
        await blocker.query('begin');
        await blocker.query(
          "select pg_advisory_xact_lock(hashtextextended('recovery-command:'||$1,0))",
          [ws],
        );
        const confirm = action('confirm', row).then((r) => r);
        await waitForRecoveryCommandWaiters(ops, ws, 1, confirm);
        const add = app
          .inject({
            method: 'POST',
            url: `/voc-clusters/${cluster.id}/vocs`,
            headers: headers(),
            payload: { voc_id: row.voc_a_id },
          })
          .then((r) => r);
        requests = [confirm, add];
        await waitForRecoveryCommandWaiters(ops, ws, 2, add);
        await blocker.query('commit');
        const [confirmed, added] = await Promise.all(requests);
        if (!confirmed || !added) throw new Error('Race results missing');
        expect(added.statusCode, added.body).toBe(201);
        expect([201, 409]).toContain(confirmed.statusCode);
        expect(requests).toHaveLength(2);
        expect(confirmed.body + added.body).not.toContain('40P01');
        const final = (await rows())[0];
        if (confirmed.statusCode === 201) {
          expect(final.state).toBe('confirmed');
          expect(
            (
              await ops.pool.query(
                'select count(*)::int as n from voc_cluster.voc_cluster_members where cluster_id=$1',
                [final.voc_cluster_id],
              )
            ).rows[0].n,
          ).toBe(2);
        } else {
          expect(final.state).toBe('pending');
          expect(confirmed.body).toContain('conflict.stale_write');
        }
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled(requests);
      }
    });
    it('real manual createCluster, permission approval and generation complete through a three-connection barrier', async () => {
      await pair();
      const person = await persona('developer');
      const permission = await insertPermissionRequestRow(ops, {
        workspaceId: ws,
        requesterActorId: person.id,
        requestedCapability: 'voc.read',
        requestedManagedSystemId: ms,
        reason: 'suggestions lock regression',
      });
      const blocker = await db.pool.connect();
      const requests: Promise<unknown>[] = [];
      try {
        await blocker.query('begin');
        await blocker.query(
          "select pg_advisory_xact_lock(hashtextextended('recovery-command:'||$1,0))",
          [ws],
        );
        const generation = run();
        requests.push(generation);
        await waitForRecoveryCommandWaiters(
          ops,
          ws,
          1,
          generation.then(() => ({ statusCode: 200 })),
        );
        const approval = app
          .inject({
            method: 'POST',
            url: `/permissions/requests/${permission.id}/approve`,
            headers: headers(),
            payload: { expected_revision: 1 },
          })
          .then((r) => r);
        requests.push(approval);
        await waitForRecoveryCommandWaiters(ops, ws, 2, approval);
        const manual = await app.inject({
          method: 'POST',
          url: '/voc-clusters',
          headers: headers(),
          payload: { title: 'manual lock regression', primary_managed_system_id: ms },
        });
        expect(manual.statusCode, manual.body).toBe(201);
        await blocker.query('commit');
        const [generated, approved] = await Promise.all([generation, approval]);
        expect(approved.statusCode, approved.body).toBe(200);
        expect(approved.body + manual.body).not.toContain('40P01');
        expect(generated.timed_out).toBe(0);
        expect(await rows()).toHaveLength(1);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled(requests);
      }
    });
    it('confirmation preserves active missing-followup recovery until a followup is linked', async () => {
      const row = await pending();
      await ops.pool.query(
        "update voc.vocs set severity='high',updated_at=now() where id=any($1::uuid[])",
        [[row.voc_a_id, row.voc_b_id]],
      );
      // Updating non-text fields requires a fresh embedding watermark, then refresh.
      await ops.pool.query(
        'update voc.voc_embeddings e set updated_at=v.updated_at from voc.vocs v where e.voc_id=v.id and v.workspace_id=$1',
        [ws],
      );
      await run();
      const refreshed = (await rows())[0];
      const tokens = [row.voc_a_id, row.voc_b_id].map((id) =>
        recoveryIdentity('high-severity-unlinked', id),
      );
      for (const token of tokens) {
        const response = await app.inject({
          method: 'GET',
          url: `/dashboard/recovery-items/${encodeURIComponent(token)}`,
          headers: headers(),
        });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().state).toBe('active');
      }
      const confirm = await action('confirm', refreshed);
      expect(confirm.statusCode, confirm.body).toBe(201);
      for (const token of tokens) {
        const response = await app.inject({
          method: 'GET',
          url: `/dashboard/recovery-items/${encodeURIComponent(token)}`,
          headers: headers(),
        });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().state).toBe('active');
      }
      const history = await ops.pool.query(
        "select action,actor_id from dashboard.recovery_history where workspace_id=$1 and recovery_item_id=any($2::text[]) and action='voc_cluster_member_added'",
        [ws, tokens],
      );
      expect(history.rows).toEqual([]);
    });
    it('a late audit failure rolls back confirmation, memberships and recovery', async () => {
      const row = await pending();
      const before = await domainCounts();
      const recoveryBefore: Record<string, unknown> = {};
      for (const table of ['recovery_identities', 'recovery_history', 'recovery_presentations']) {
        recoveryBefore[table] = (
          await ops.pool.query(`select * from dashboard.${table} where workspace_id=$1`, [ws])
        ).rows;
      }
      // Real DB failure at the final suggestion audit, not a mock of the command.
      // Trigger is scoped to this suite's workspace and removed in finally.
      const name = `sg_fail_${ws.replaceAll('-', '')}`;
      await ops.pool.query(`create function core.${name}() returns trigger language plpgsql as $$ begin
      if NEW.workspace_id='${ws}'::uuid and NEW.event_type='voc_cluster_suggestion_confirmed' then raise exception 'late suggestion audit failure'; end if;
      return NEW; end $$`);
      try {
        await ops.pool.query(
          `create trigger ${name} before insert on core.audit_log for each row execute function core.${name}()`,
        );
        const response = await action('confirm', row);
        expect(response.statusCode).toBe(500);
        expect(await domainCounts()).toEqual(before);
        expect((await rows())[0].state).toBe('pending');
        for (const table of ['recovery_identities', 'recovery_history', 'recovery_presentations']) {
          expect(
            (await ops.pool.query(`select * from dashboard.${table} where workspace_id=$1`, [ws]))
              .rows,
          ).toEqual(recoveryBefore[table]);
        }
      } finally {
        await ops.pool.query(`drop trigger if exists ${name} on core.audit_log`);
        await ops.pool.query(`drop function core.${name}()`);
      }
    });
    it('a pair with only one readable VOC is absent in full', async () => {
      const row = await pending();
      const p = await persona('developer');
      grantIds.push(await grantCapability(ops, ws, p.id, 'finding.read', ms, admin));
      await ops.pool.query('update voc.vocs set reporter_id=$2 where id=$1', [row.voc_a_id, p.id]);
      const result = await list(p.cookie);
      expect(result.json()).toEqual({ available: true, items: [] });
      expect((await action('confirm', row, {}, p.cookie)).statusCode).toBe(404);
    });
    it('provider-disabled reads return the explicit empty availability union', async () => {
      await pending();
      const disabled = await buildServer({
        dbHandle: db,
        config: { ...loadConfig(), WORKSPACE_ID: ws, EMBEDDING_PROVIDER: 'disabled' },
      });
      try {
        const c = await loginAs(disabled, `sg-admin-${ws}`);
        const result = await disabled.inject({
          method: 'GET',
          url: '/voc-cluster-suggestions',
          headers: headers(c),
        });
        expect(result.statusCode).toBe(200);
        expect(result.json()).toEqual({ available: false, reason: 'provider_disabled', items: [] });
      } finally {
        await disabled.close();
      }
    });
    it('generation never pairs across workspaces', async () => {
      const otherWs = randomUUID();
      const otherActors: string[] = [];
      const otherSystems: string[] = [];
      const otherVocs: string[] = [];
      try {
        await voc();
        await ops.pool.query('insert into core.workspaces(id,name) values($1,$2)', [
          otherWs,
          'other suggestion fixture',
        ]);
        const actor = await insertActorRow(ops, {
          workspaceId: otherWs,
          externalId: `sg-${otherWs}`,
          roleLevel: 'admin',
        });
        otherActors.push(actor.id);
        const system = await insertMsDirectly(ops, otherWs, `sg-${otherWs}`, 'other');
        otherSystems.push(system);
        const v = await insertVocDirectly(ops, otherWs, system, actor.id, 'foreign');
        otherVocs.push(v.id);
        await ops.pool.query(
          `insert into voc.voc_embeddings(voc_id,workspace_id,embedding_version,provider,model,dimensions,embedding,source_hash,updated_at)
        select id,workspace_id,1,'test','suggestions',3,'[1,0,0]'::vector,$2,updated_at from voc.vocs where id=$1`,
          [
            v.id,
            deriveVocEmbeddingInput({
              title: 'foreign',
              descriptionRichContent: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
              },
            }).sourceHash,
          ],
        );
        await run();
        expect(await rows()).toHaveLength(0);
      } finally {
        await ops.pool.query('delete from core.workspace_settings where workspace_id=$1', [
          otherWs,
        ]);
        await cleanupVocClusterFixtures(ops, {
          workspaceId: otherWs,
          actorIds: otherActors,
          managedSystemIds: otherSystems,
          vocIds: otherVocs,
          clusterIds: [],
          findingIds: [],
          deleteWorkspace: true,
        });
      }
    });
    it('keeps review enabled when generation is switched off, with 200 already-confirmed response', async () => {
      const row = await pending();
      await ops.pool.query(
        'update core.workspace_settings set voc_cluster_suggestions_enabled=false where workspace_id=$1',
        [ws],
      );
      expect((await list()).json().items).toHaveLength(1);
      const confirm = await action('confirm', row);
      expect(confirm.statusCode).toBe(201);
      const before = await domainCounts();
      const terminal = await action('confirm', row, {
        expected_revision: 999,
        source_hashes: ['old', 'old'],
        embedding_version: 99,
      });
      expect(terminal.statusCode).toBe(200);
      expect(terminal.json()).toEqual(confirm.json());
      expect(await domainCounts()).toEqual(before);
    });
    it('restore cannot reoccupy a VOC now in another eligible pending pair', async () => {
      const row = await pending();
      await action('discard', row);
      await voc();
      await run();
      expect((await rows()).filter((r) => r.state === 'pending')).toHaveLength(1);
      const discarded = (await rows()).find((r) => r.id === row.id);
      const restore = await action('restore', discarded);
      expect(restore.statusCode).toBe(409);
      expect(restore.json().code).toBe('conflict.stale_write');
    });
    it('restore does not exceed workspace cap', async () => {
      const row = await pending();
      await action('discard', row);
      for (let i = 0; i < 20; i++) await seedPair(await newMs());
      const restore = await action(
        'restore',
        (await rows()).find((r) => r.id === row.id),
      );
      expect(restore.statusCode).toBe(409);
      expect((await rows()).find((r) => r.id === row.id).state).toBe('discarded');
    });
    it('a timeout leaves cursor and counters unchanged', async () => {
      await pair();
      const blocker = await db.pool.connect();
      let request: Promise<unknown> | undefined;
      try {
        await blocker.query('begin');
        await blocker.query(
          "select pg_advisory_xact_lock(hashtextextended('recovery-command:'||$1,0))",
          [ws],
        );
        const run = runVocClusterSuggestions(
          {
            db: db.db,
            embeddingEnabled: true,
            embeddingVersion: 1,
            embeddingIdentity: testIdentity,
            statementTimeoutMs: 50,
          },
          { workspace_id: ws, correlation_id: randomUUID() },
        );
        request = run;
        expect((await run).timed_out).toBe(1);
        expect(await rows()).toEqual([]);
        for (const table of [
          'voc_cluster_suggestion_cursors',
          'voc_cluster_suggestion_counters',
          'voc_cluster_suggestion_admissions',
        ])
          expect(
            (await ops.pool.query(`select * from voc.${table} where workspace_id=$1`, [ws])).rows,
          ).toEqual([]);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled(request ? [request] : []);
      }
    });
    it('request bodies and required UUIDv4 idempotency keys are validated at the HTTP boundary', async () => {
      const row = await pending();
      for (const payload of [{ expected_revision: 0 }, { expected_revision: 1, extra: true }]) {
        const result = await app.inject({
          method: 'POST',
          url: `/voc-cluster-suggestions/${row.id}/discard`,
          headers: headers(),
          payload,
        });
        expect(result.statusCode).toBe(422);
        expect(result.json().code).toBe('validation.failed');
      }
      const missing = await app.inject({
        method: 'POST',
        url: `/voc-cluster-suggestions/${row.id}/discard`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
        payload: { expected_revision: 1 },
      });
      expect(missing.statusCode).toBe(422);
    });
  },
  120_000,
);
