// Integration tests for repo-read.ts — DB-backed.
//
// Gate: DATABASE_URL + WORKSPACE_ID env vars. Without them the suite is skipped.
// Uses the fops_app pool directly (no server). Fixtures are created inline;
// cleanup runs in afterAll to leave the DB tidy.
//
// Test naming mirrors the plan §C1 coverage list:
//   - Scope resolvers: admin → 'all', no grants, workspace-wide, MS-scoped.
//   - listVocsForRead: view filters, scope filter, cursor pagination.
//   - selectVocByIdForRead: round-trip + workspace isolation.
//   - selectConversationPage: visibility matrix.
//   - outOfScopeSummary: histogram + null cases.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import {
  actorEffectiveScope,
  actorReadScope,
  actorTriageScope,
  allManagedSystemIds,
  listVocsForRead,
  outOfScopeSummary,
  selectConversationPage,
  selectVocByIdForRead,
} from '../repo-read.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function insertDevActor(
  handle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-rr-dev-${suffix}`;
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       VALUES ($1, $2, $3, $4, 'developer', 'internal_member')
       ON CONFLICT (workspace_id, external_id) DO UPDATE SET email = excluded.email
       RETURNING id`,
    [workspaceId, externalId, `rr-dev-${suffix}@local`, `RR Dev ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertDevActor failed for ${externalId}`);
  return { id, externalId };
}

async function insertUserActor(
  handle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-rr-user-${suffix}`;
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       VALUES ($1, $2, $3, $4, 'user', 'internal_member')
       ON CONFLICT (workspace_id, external_id) DO UPDATE SET email = excluded.email
       RETURNING id`,
    [workspaceId, externalId, `rr-user-${suffix}@local`, `RR User ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertUserActor failed for ${externalId}`);
  return { id, externalId };
}

async function insertMs(
  handle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<string> {
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO core.managed_systems (workspace_id, slug, name)
       VALUES ($1, $2, $3)
       RETURNING id`,
    [workspaceId, `rr-ms-${suffix}`, `RR MS ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertMs failed for rr-ms-${suffix}`);
  return id;
}

async function insertVoc(
  handle: DbHandle,
  workspaceId: string,
  msId: string,
  reporterId: string,
  opts: { severity?: string | null; triageState?: string; ownerUserId?: string | null; reporterFacingStatus?: string } = {},
): Promise<string> {
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO voc.vocs
       (workspace_id, display_id, primary_managed_system_id, reporter_id, title,
        description_rich_content, source_context, severity, triage_state, owner_user_id,
        reporter_facing_status)
     VALUES ($1, voc.next_voc_display_id($1), $2, $3, 'RR Test VOC',
             '{"type":"doc","content":[]}'::jsonb, 'direct_use',
             $4, $5, $6, $7)
     RETURNING id`,
    [
      workspaceId,
      msId,
      reporterId,
      opts.severity ?? null,
      opts.triageState ?? 'untriaged',
      opts.ownerUserId ?? null,
      opts.reporterFacingStatus ?? 'received',
    ],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('insertVoc failed');
  return id;
}

async function grantCapability(
  handle: DbHandle,
  workspaceId: string,
  actorId: string,
  capability: string,
  msId: string | null,
  grantedById: string,
): Promise<string> {
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO permission.permission_grants
       (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [workspaceId, actorId, capability, msId, grantedById],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('grantCapability failed');
  return id;
}

async function insertPublicUpdate(
  handle: DbHandle,
  vocId: string,
  actorId: string,
): Promise<string> {
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO voc.voc_public_updates
       (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after)
     VALUES ($1, $2, '{"type":"doc","content":[]}'::jsonb, 'received', 'reviewing')
     RETURNING id`,
    [vocId, actorId],
  );
  return res.rows[0]!.id;
}

async function insertReporterReply(
  handle: DbHandle,
  vocId: string,
  actorId: string,
): Promise<string> {
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO voc.voc_reporter_replies
       (voc_id, actor_id, body_rich_content)
     VALUES ($1, $2, '{"type":"doc","content":[]}'::jsonb)
     RETURNING id`,
    [vocId, actorId],
  );
  return res.rows[0]!.id;
}

async function insertInternalComment(
  handle: DbHandle,
  vocId: string,
  actorId: string,
): Promise<string> {
  const res = await handle.pool.query<{ id: string }>(
    `INSERT INTO voc.voc_internal_comments
       (voc_id, actor_id, body_rich_content)
     VALUES ($1, $2, '{"type":"doc","content":[]}'::jsonb)
     RETURNING id`,
    [vocId, actorId],
  );
  return res.rows[0]!.id;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe.skipIf(!runIntegration)('repo-read integration (#15 C1)', () => {
  let handle: DbHandle;
  let adminActorId: string;
  let suffix: string;

  beforeAll(async () => {
    handle = createDb(APP_URL);
    suffix = randomUUID().slice(0, 8);

    const r = await handle.pool.query<{ id: string }>(
      `SELECT id FROM core.actors WHERE external_id = 'mock-admin-1' AND workspace_id = $1`,
      [WORKSPACE_ID],
    );
    adminActorId = r.rows[0]?.id ?? '';
    if (!adminActorId) throw new Error('mock-admin-1 not found');
  });

  afterAll(async () => {
    // Clean up in reverse FK order: vocs → managed_systems → actors → grants.
    await handle.pool.query(
      `DELETE FROM permission.permission_grants
        WHERE workspace_id = $1
          AND actor_id IN (SELECT id FROM core.actors WHERE external_id LIKE $2)`,
      [WORKSPACE_ID, `mock-rr-%${suffix}%`],
    );
    await handle.pool.query(
      `DELETE FROM voc.vocs
        WHERE primary_managed_system_id IN (
          SELECT id FROM core.managed_systems WHERE slug LIKE $1
        )`,
      [`rr-ms-%-${suffix}%`],
    );
    await handle.pool.query(
      `DELETE FROM core.managed_systems WHERE slug LIKE $1`,
      [`rr-ms-%-${suffix}%`],
    );
    await handle.pool.query(
      `DELETE FROM core.sessions WHERE actor_id IN (SELECT id FROM core.actors WHERE external_id LIKE $1)`,
      [`mock-rr-%${suffix}%`],
    );
    await handle.pool.query(
      `DELETE FROM core.actors WHERE external_id LIKE $1 AND workspace_id = $2`,
      [`mock-rr-%${suffix}%`, WORKSPACE_ID],
    );
    await handle.close();
  });

  // ── allManagedSystemIds ────────────────────────────────────────────────────
  it('allManagedSystemIds returns active MS ids for workspace', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `all-${suffix}`);
    const ids = await allManagedSystemIds(handle.db, WORKSPACE_ID);
    expect(ids).toContain(msId);
  });

  // ── Scope resolvers ───────────────────────────────────────────────────────
  it('actorEffectiveScope: admin → all', async () => {
    const scope = await actorEffectiveScope(handle.db, {
      actor_id: adminActorId,
      workspace_id: WORKSPACE_ID,
      role_level: 'admin',
    });
    expect(scope.kind).toBe('all');
  });

  it('actorReadScope: developer with no grants → scoped:[]', async () => {
    const { id: devId } = await insertDevActor(handle, WORKSPACE_ID, `scope-none-${suffix}`);
    const scope = await actorReadScope(handle.db, {
      actor_id: devId,
      workspace_id: WORKSPACE_ID,
      role_level: 'developer',
    });
    expect(scope).toEqual({ kind: 'scoped', managedSystemIds: [] });
  });

  it('actorReadScope: developer with workspace-wide voc.read → all', async () => {
    const { id: devId } = await insertDevActor(handle, WORKSPACE_ID, `scope-ws-${suffix}`);
    await grantCapability(handle, WORKSPACE_ID, devId, 'voc.read', null, adminActorId);
    const scope = await actorReadScope(handle.db, {
      actor_id: devId,
      workspace_id: WORKSPACE_ID,
      role_level: 'developer',
    });
    expect(scope.kind).toBe('all');
  });

  it('actorReadScope: developer with MS-scoped voc.read → scoped:[msId]', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `scope-ms-${suffix}`);
    const { id: devId } = await insertDevActor(handle, WORKSPACE_ID, `scope-msscoped-${suffix}`);
    await grantCapability(handle, WORKSPACE_ID, devId, 'voc.read', msId, adminActorId);
    const scope = await actorReadScope(handle.db, {
      actor_id: devId,
      workspace_id: WORKSPACE_ID,
      role_level: 'developer',
    });
    expect(scope).toEqual({ kind: 'scoped', managedSystemIds: [msId] });
  });

  it('actorTriageScope: developer with voc.triage grant → scoped:[msId]', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `triage-scope-${suffix}`);
    const { id: devId } = await insertDevActor(handle, WORKSPACE_ID, `triage-dev-${suffix}`);
    await grantCapability(handle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    const scope = await actorTriageScope(handle.db, {
      actor_id: devId,
      workspace_id: WORKSPACE_ID,
      role_level: 'developer',
    });
    expect(scope).toEqual({ kind: 'scoped', managedSystemIds: [msId] });
  });

  it('actorEffectiveScope: developer with voc.triage (any cap) → scoped:[msId]', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `eff-scope-${suffix}`);
    const { id: devId } = await insertDevActor(handle, WORKSPACE_ID, `eff-dev-${suffix}`);
    await grantCapability(handle, WORKSPACE_ID, devId, 'voc.triage', msId, adminActorId);
    // effectiveScope includes any capability.
    const scope = await actorEffectiveScope(handle.db, {
      actor_id: devId,
      workspace_id: WORKSPACE_ID,
      role_level: 'developer',
    });
    expect(scope).toEqual({ kind: 'scoped', managedSystemIds: [msId] });
  });

  // ── listVocsForRead — basic ───────────────────────────────────────────────
  it('listVocsForRead: basic inbox view returns VOCs in workspace', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `list-basic-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `list-reporter-${suffix}`);
    const vocId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId);

    const result = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'all' },
      view: 'inbox',
      sort: 'created_at:desc',
      limit: 10,
    });

    expect(result.rows.some((r) => r.id === vocId)).toBe(true);
  });

  it('listVocsForRead: scoped:[] → zero rows, no DB query', async () => {
    const result = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'scoped', managedSystemIds: [] },
      view: 'inbox',
      sort: 'created_at:desc',
      limit: 10,
    });
    expect(result.rows).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('listVocsForRead: scope filter limits to specific MS', async () => {
    const msA = await insertMs(handle, WORKSPACE_ID, `scope-a-${suffix}`);
    const msB = await insertMs(handle, WORKSPACE_ID, `scope-b-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `scope-rep-${suffix}`);
    const vocA = await insertVoc(handle, WORKSPACE_ID, msA, reporterId);
    const vocB = await insertVoc(handle, WORKSPACE_ID, msB, reporterId);

    const result = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'scoped', managedSystemIds: [msA] },
      view: 'inbox',
      sort: 'created_at:desc',
      limit: 50,
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(vocA);
    expect(ids).not.toContain(vocB);
  });

  it('listVocsForRead: view=my filters to reporter_id', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `my-view-${suffix}`);
    const { id: reporter1 } = await insertUserActor(handle, WORKSPACE_ID, `my-r1-${suffix}`);
    const { id: reporter2 } = await insertUserActor(handle, WORKSPACE_ID, `my-r2-${suffix}`);
    const voc1 = await insertVoc(handle, WORKSPACE_ID, msId, reporter1);
    await insertVoc(handle, WORKSPACE_ID, msId, reporter2);

    const result = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'all' },
      view: 'my',
      actorIdForMyFilter: reporter1,
      sort: 'created_at:desc',
      limit: 50,
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(voc1);
    // All returned rows should belong to reporter1.
    expect(result.rows.every((r) => r.reporterId === reporter1)).toBe(true);
  });

  it('listVocsForRead: view=triage filters to untriaged+needs_more_information', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `triage-view-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `triage-rep-${suffix}`);
    const untriagedId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId, { triageState: 'untriaged' });
    const triagedId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId, { triageState: 'triaged' });

    const result = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'all' },
      view: 'triage',
      sort: 'triage_pinned',
      limit: 50,
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(untriagedId);
    expect(ids).not.toContain(triagedId);
  });

  it('listVocsForRead: tab=similar → zero rows immediately', async () => {
    const result = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'all' },
      view: 'inbox',
      tab: 'similar',
      sort: 'created_at:desc',
      limit: 10,
    });
    expect(result.rows).toHaveLength(0);
  });

  it('listVocsForRead: filterSeverity filters correctly', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `sev-filter-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `sev-rep-${suffix}`);
    const highId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId, { severity: 'high' });
    const lowId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId, { severity: 'low' });

    const result = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'scoped', managedSystemIds: [msId] },
      view: 'inbox',
      filterSeverity: ['high'],
      sort: 'created_at:desc',
      limit: 50,
    });

    const ids = result.rows.map((r) => r.id);
    expect(ids).toContain(highId);
    expect(ids).not.toContain(lowId);
  });

  // ── Cursor pagination (75 rows → 50+25) ──────────────────────────────────
  it('listVocsForRead: cursor pagination 75 rows → page1 (50) + page2 (25)', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `cursor-pg-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `cursor-rep-${suffix}`);

    // Insert 75 VOCs.
    const ids: string[] = [];
    for (let i = 0; i < 75; i++) {
      ids.push(await insertVoc(handle, WORKSPACE_ID, msId, reporterId));
    }

    // Page 1.
    const page1 = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'scoped', managedSystemIds: [msId] },
      view: 'inbox',
      sort: 'created_at:desc',
      limit: 50,
    });

    expect(page1.rows).toHaveLength(50);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();

    // Page 2 using cursor.
    const page2 = await listVocsForRead(handle.db, {
      workspaceId: WORKSPACE_ID,
      scopeFilter: { kind: 'scoped', managedSystemIds: [msId] },
      view: 'inbox',
      sort: 'created_at:desc',
      cursor: page1.nextCursor!,
      limit: 50,
    });

    expect(page2.rows).toHaveLength(25);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeNull();

    // No overlap between pages.
    const p1Ids = new Set(page1.rows.map((r) => r.id));
    const p2Ids = page2.rows.map((r) => r.id);
    for (const id of p2Ids) {
      expect(p1Ids.has(id)).toBe(false);
    }

    // All 75 inserted ids appear across both pages.
    const allReturned = new Set([...page1.rows.map((r) => r.id), ...page2.rows.map((r) => r.id)]);
    for (const id of ids) {
      expect(allReturned.has(id)).toBe(true);
    }
  });

  // ── selectVocByIdForRead ──────────────────────────────────────────────────
  it('selectVocByIdForRead: round-trip returns correct row', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `detail-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `detail-rep-${suffix}`);
    const vocId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId, { severity: 'high' });

    const row = await selectVocByIdForRead(handle.db, WORKSPACE_ID, vocId);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(vocId);
    expect(row!.severity).toBe('high');
    expect(row!.workspaceId).toBe(WORKSPACE_ID);
    expect(row!.primaryManagedSystemId).toBe(msId);
  });

  it('selectVocByIdForRead: different workspace → null (workspace isolation)', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `ws-iso-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `ws-iso-rep-${suffix}`);
    const vocId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId);

    const row = await selectVocByIdForRead(handle.db, randomUUID(), vocId);
    expect(row).toBeNull();
  });

  it('selectVocByIdForRead: non-existent voc → null', async () => {
    const row = await selectVocByIdForRead(handle.db, WORKSPACE_ID, randomUUID());
    expect(row).toBeNull();
  });

  // ── selectConversationPage ────────────────────────────────────────────────
  it('selectConversationPage: canTriage sees all 3 kinds', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `conv-triage-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `conv-triage-rep-${suffix}`);
    const { id: triagerId } = await insertDevActor(handle, WORKSPACE_ID, `conv-triage-dev-${suffix}`);
    const vocId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId);

    const puId = await insertPublicUpdate(handle, vocId, triagerId);
    const rrId = await insertReporterReply(handle, vocId, reporterId);
    const icId = await insertInternalComment(handle, vocId, triagerId);

    const result = await selectConversationPage(handle.db, {
      vocId,
      actorId: triagerId,
      canTriage: true,
      isReporter: false,
      limit: 50,
    });

    const ids = result.entries.map((e) => e.id);
    expect(ids).toContain(puId);
    expect(ids).toContain(rrId);
    expect(ids).toContain(icId);
  });

  it('selectConversationPage: reporter (no triage) sees own replies + public, NOT internal', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `conv-rep-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `conv-rep-rep-${suffix}`);
    const { id: otherReporterId } = await insertUserActor(handle, WORKSPACE_ID, `conv-rep-other-${suffix}`);
    const { id: triagerId } = await insertDevActor(handle, WORKSPACE_ID, `conv-rep-dev-${suffix}`);
    const vocId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId);

    const puId = await insertPublicUpdate(handle, vocId, triagerId);
    const rrOwnId = await insertReporterReply(handle, vocId, reporterId);
    // Note: reporter_replies FK requires actor_id to match reporter_id per DB trigger;
    // in the test we can't easily insert a reply from a different actor due to the trigger.
    // So we only test own reply visibility here.
    const icId = await insertInternalComment(handle, vocId, triagerId);

    const result = await selectConversationPage(handle.db, {
      vocId,
      actorId: reporterId,
      canTriage: false,
      isReporter: true,
      limit: 50,
    });

    const ids = result.entries.map((e) => e.id);
    expect(ids).toContain(puId);
    expect(ids).toContain(rrOwnId);
    expect(ids).not.toContain(icId); // internal not visible to reporter

    // All reporter_replies returned should belong to the reporter.
    const replies = result.entries.filter((e) => e.kind === 'reporter_reply');
    expect(replies.every((r) => r.actorId === reporterId)).toBe(true);

    // No internal_comment in results.
    expect(result.entries.every((e) => e.kind !== 'internal_comment')).toBe(true);

    // otherReporterId not used here but kept for reference.
    void otherReporterId;
  });

  it('selectConversationPage: kind filter limits to one kind', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `conv-kind-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `conv-kind-rep-${suffix}`);
    const { id: triagerId } = await insertDevActor(handle, WORKSPACE_ID, `conv-kind-dev-${suffix}`);
    const vocId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId);

    await insertPublicUpdate(handle, vocId, triagerId);
    await insertInternalComment(handle, vocId, triagerId);

    const result = await selectConversationPage(handle.db, {
      vocId,
      actorId: triagerId,
      canTriage: true,
      isReporter: false,
      kind: 'public_update',
      limit: 50,
    });

    expect(result.entries.every((e) => e.kind === 'public_update')).toBe(true);
  });

  it('selectConversationPage: cursor pagination works DESC', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `conv-cursor-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `conv-cur-rep-${suffix}`);
    const { id: triagerId } = await insertDevActor(handle, WORKSPACE_ID, `conv-cur-dev-${suffix}`);
    const vocId = await insertVoc(handle, WORKSPACE_ID, msId, reporterId);

    // Insert 5 public updates.
    for (let i = 0; i < 5; i++) {
      await insertPublicUpdate(handle, vocId, triagerId);
    }

    const page1 = await selectConversationPage(handle.db, {
      vocId,
      actorId: triagerId,
      canTriage: true,
      isReporter: false,
      limit: 3,
    });
    expect(page1.entries).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await selectConversationPage(handle.db, {
      vocId,
      actorId: triagerId,
      canTriage: true,
      isReporter: false,
      cursor: page1.nextCursor!,
      limit: 3,
    });
    expect(page2.entries).toHaveLength(2);
    expect(page2.hasMore).toBe(false);

    // No overlap.
    const p1Ids = new Set(page1.entries.map((e) => e.id));
    for (const e of page2.entries) {
      expect(p1Ids.has(e.id)).toBe(false);
    }
  });

  // ── outOfScopeSummary ────────────────────────────────────────────────────
  it('outOfScopeSummary: readScope=all → null', async () => {
    const result = await outOfScopeSummary(handle.db, {
      workspaceId: WORKSPACE_ID,
      effectiveScope: { kind: 'all' },
      readScope: { kind: 'all' },
    });
    expect(result).toBeNull();
  });

  it('outOfScopeSummary: effective ⊆ read → null', async () => {
    const msId = await insertMs(handle, WORKSPACE_ID, `oos-sub-${suffix}`);
    const result = await outOfScopeSummary(handle.db, {
      workspaceId: WORKSPACE_ID,
      effectiveScope: { kind: 'scoped', managedSystemIds: [msId] },
      readScope: { kind: 'scoped', managedSystemIds: [msId] },
    });
    expect(result).toBeNull();
  });

  it('outOfScopeSummary: diff with VOCs → count + histogram', async () => {
    const msEffective = await insertMs(handle, WORKSPACE_ID, `oos-eff-${suffix}`);
    const msRead = await insertMs(handle, WORKSPACE_ID, `oos-read-${suffix}`);
    const { id: reporterId } = await insertUserActor(handle, WORKSPACE_ID, `oos-rep-${suffix}`);

    // 2 VOCs in msEffective (out-of-read-scope), 1 high, 1 null severity.
    await insertVoc(handle, WORKSPACE_ID, msEffective, reporterId, { severity: 'high' });
    await insertVoc(handle, WORKSPACE_ID, msEffective, reporterId, { severity: null });

    const result = await outOfScopeSummary(handle.db, {
      workspaceId: WORKSPACE_ID,
      effectiveScope: { kind: 'scoped', managedSystemIds: [msEffective] },
      readScope: { kind: 'scoped', managedSystemIds: [msRead] },
    });

    expect(result).not.toBeNull();
    expect(result!.count).toBe(2);
    // high severity counted, null excluded from histogram.
    expect(result!.severity_distribution.high).toBe(1);
    expect(result!.severity_distribution.low).toBe(0);
  });

  it('outOfScopeSummary: diff with zero VOCs → null', async () => {
    const msEmpty = await insertMs(handle, WORKSPACE_ID, `oos-empty-${suffix}`);
    const result = await outOfScopeSummary(handle.db, {
      workspaceId: WORKSPACE_ID,
      effectiveScope: { kind: 'scoped', managedSystemIds: [msEmpty] },
      readScope: { kind: 'scoped', managedSystemIds: [] },
    });
    expect(result).toBeNull();
  });
});
