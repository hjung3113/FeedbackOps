// Route-level acceptance; run by the conductor on a throwaway DB as fops_app.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { denyCapability, grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertTaskRow } from '../../../test-support/task-fixtures.js';
import { cleanupTestActorsByExternalIdPrefix } from '../../../test-support/voc-fixtures.js';

const workspaceId = process.env.WORKSPACE_ID ?? '';
const appUrl = process.env.DATABASE_URL ?? '';
const migrateUrl = process.env.DATABASE_URL_MIGRATE ?? '';
const runIntegration = Boolean(workspaceId && appUrl && migrateUrl);
type Page = {
  items: Array<{ id: string; display_id: string }>;
  page: { total?: number; cursor?: string; has_more: boolean };
};

describe.skipIf(!runIntegration).each(['tasks', 'findings'] as const)(
  '%s literal list search #1177',
  (domain) => {
    let app: FastifyInstance;
    let db: DbHandle;
    let migrate: DbHandle;
    let actorId: string;
    let cookie: string;
    let allowed: string;
    let denied: string;
    let matching: Array<{ id: string; display_id: string }>;
    let hidden: { id: string; display_id: string };
    let unrelated: { id: string; display_id: string };
    const prefix = `it-1177-${domain}-${randomUUID()}`;
    const token = `Search-${randomUUID()}`;
    const sourceId = randomUUID();
    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      db = createDb(appUrl);
      migrate = createDb(migrateUrl);
      app = await buildServer({ config: loadConfig(), dbHandle: db });
      await app.ready();
      actorId = (
        await insertActorRow(db, { workspaceId, externalId: prefix, roleLevel: 'developer' })
      ).id;
      cookie = await loginAs(app, prefix);
      allowed = await insertMsDirectly(db, workspaceId, `${prefix}-a`, 'Search allowed');
      denied = await insertMsDirectly(db, workspaceId, `${prefix}-b`, 'Search denied');
      const capability = domain === 'tasks' ? 'finding.manage' : 'finding.read';
      await grantCapability(db, workspaceId, actorId, capability, allowed, actorId);
      // Workspace grant plus a point deny pins the exclusion despite a title match.
      await grantCapability(db, workspaceId, actorId, capability, null, actorId);
      await denyCapability(db, workspaceId, actorId, capability, denied, actorId);
      async function seed(ms: string, title: string, active = true) {
        const input = { workspaceId, primaryManagedSystemId: ms, title, createdBy: actorId };
        return domain === 'tasks'
          ? insertTaskRow(migrate, { ...input, status: active ? 'doing' : 'done' })
          : insertFindingRow(migrate, {
              ...input,
              sourceId,
              status: active ? 'active' : 'archived',
            });
      }
      matching = [
        await seed(allowed, `Before ${token} Alpha`),
        await seed(allowed, `${token} 50%_\\ literal`),
        await seed(allowed, `${token} 50XY other`, false),
      ];
      hidden = await seed(denied, token);
      unrelated = await seed(allowed, 'Unrelated row');
    });
    beforeEach(async () => {
      await migrate.pool.query('delete from core.rate_limits where key = $1', [
        `${workspaceId}:${actorId}`,
      ]);
    });
    afterAll(async () => {
      if (!migrate) return;
      await app?.close();
      const table = domain === 'tasks' ? 'task.tasks' : 'finding.findings';
      await migrate.pool.query(
        `delete from ${table} where workspace_id=$1 and primary_managed_system_id = any($2::uuid[])`,
        [workspaceId, [allowed, denied]],
      );
      // Shared cleanup walks grant/deny/session/audit FKs before the Actor; systems go last.
      await cleanupTestActorsByExternalIdPrefix(db, workspaceId, prefix);
      await migrate.pool.query('delete from core.rate_limits where key=$1', [
        `${workspaceId}:${actorId}`,
      ]);
      await migrate.pool.query(
        'delete from core.managed_systems where workspace_id=$1 and id = any($2::uuid[])',
        [workspaceId, [allowed, denied]],
      );
      await db.close();
      await migrate.close();
    });
    async function get(params: Record<string, string> = {}) {
      return app.inject({
        method: 'GET',
        url: `/${domain}?${new URLSearchParams(params)}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      });
    }
    it('matches case-insensitive title substrings, pages the complete scoped set once, and leaves badges unchanged', async () => {
      const nav = () =>
        app.inject({
          method: 'GET',
          url: `/nav/counts?managed_system_id=${allowed}`,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
        });
      const before = await nav();
      expect(before.statusCode).toBe(200);
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const res = await get({
          q: token.toUpperCase(),
          limit: '1',
          ...(cursor ? { cursor } : {}),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json<Page>();
        expect(body.page.total).toBe(cursor === undefined ? 3 : undefined);
        ids.push(...body.items.map((row) => row.id));
        expect(body.page.has_more).toBe(ids.length < 3);
        cursor = body.page.cursor;
      } while (cursor);
      expect(ids.sort()).toEqual(matching.map((row) => row.id).sort());
      expect(new Set(ids).size).toBe(3);
      expect(ids).not.toContain(hidden.id);
      const full = await get({ q: token });
      expect(full.statusCode).toBe(200);
      expect(full.json().page).toBeUndefined();
      expect(
        full
          .json<Page>()
          .items.map((row) => row.id)
          .sort(),
      ).toEqual(ids);
      expect((await nav()).json()).toEqual(before.json());
    });
    it('matches a display ID prefix case-insensitively', async () => {
      const row = matching[0];
      if (!row) throw new Error('missing matching fixture');
      const q = row.display_id.slice(0, -1).toLowerCase();
      const expected = [...matching, unrelated].filter((item) =>
        item.display_id.toLowerCase().startsWith(q),
      );
      const res = await get({
        q,
        managed_system_id: allowed,
        limit: '100',
      });
      expect(res.statusCode).toBe(200);
      expect(
        res
          .json<Page>()
          .items.map((item) => item.id)
          .sort(),
      ).toEqual(expected.map((item) => item.id).sort());
      expect(res.json<Page>().page.total).toBe(expected.length);
      expect(res.json<Page>().items).not.toContainEqual(expect.objectContaining({ id: hidden.id }));
    });
    it.each(['%', '_', '\\'])(
      'treats %s literally rather than as a SQL wildcard',
      async (literal) => {
        const actual = await get({ q: literal, managed_system_id: allowed, limit: '100' });
        expect(actual.statusCode).toBe(200);
        expect(actual.json<Page>().items.map((row) => row.id)).toEqual([matching[1]?.id]);
        expect(actual.json<Page>().page.total).toBe(1);
      },
    );
    it('intersects existing filters and returns an exact zero for no matches', async () => {
      const filter = domain === 'tasks' ? { status: 'doing' } : { execution: 'none' };
      const res = await get({ ...filter, q: token, limit: '1' });
      expect(res.statusCode).toBe(200);
      expect(res.json<Page>().page.total).toBe(2);
      const empty = await get({ ...filter, q: `absent-${token}`, limit: '1' });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({ items: [], page: { has_more: false, total: 0 } });
    });
    it.each(['', '   '])('normalizes blank q=%j to no filter', async (q) => {
      const plain = await get({ managed_system_id: allowed, limit: '100' });
      const blank = await get({ managed_system_id: allowed, limit: '100', q });
      expect(blank.statusCode).toBe(200);
      expect(blank.json()).toEqual(plain.json());
    });
    it('rejects 101 characters with 422 at q', async () => {
      const res = await get({ q: 'a'.repeat(101) });
      expect(res.statusCode).toBe(422);
      expect(res.json().detail.fields).toEqual([{ path: ['q'], code: 'too_big' }]);
    });
  },
);
