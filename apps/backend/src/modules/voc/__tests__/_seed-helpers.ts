// _seed-helpers.ts — shared seed utilities for GET /vocs read integration tests.
//
// Scope: internal to __tests__/. Do NOT import from outside this directory.
// All helpers use the fops_app pool (APP_URL / DbHandle.pool) unless noted.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';

// ── Cookie / login helpers ────────────────────────────────────────────────────

export function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  return null;
}

export async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error(`mock-login failed: ${res.statusCode} ${res.body}`);
  return cookie;
}

// ── MS / AA helpers via REST ─────────────────────────────────────────────────

export async function createMs(
  app: FastifyInstance,
  cookie: string,
  slug: string,
  name: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/managed-systems',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: { slug, name },
  });
  if (res.statusCode !== 201) throw new Error(`createMs failed: ${res.statusCode} ${res.body}`);
  return res.json().id as string;
}

// Direct SQL insert of a managed system — bypasses mutation rate limit.
// Use this in read integration tests where many MSs need to be created quickly.
export async function insertMsDirectly(
  dbHandle: DbHandle,
  workspaceId: string,
  slug: string,
  name: string,
): Promise<string> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.managed_systems (workspace_id, slug, name)
     values ($1, $2, $3)
     returning id`,
    [workspaceId, slug, name],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertMsDirectly failed for slug=${slug}`);
  return id;
}

export async function createAa(
  app: FastifyInstance,
  cookie: string,
  body: { managed_system_id: string; slug: string; name: string },
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/analytics-areas',
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
    payload: body,
  });
  if (res.statusCode !== 201) throw new Error(`createAa failed: ${res.statusCode} ${res.body}`);
  return res.json().id as string;
}

// ── VOC helper via REST ──────────────────────────────────────────────────────

export function paragraphDoc(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

export async function postVoc(
  app: FastifyInstance,
  cookie: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ id: string; display_id: string; updated_at: string }> {
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'content-type': 'application/json',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await app.inject({ method: 'POST', url: '/vocs', headers, payload: body });
  if (res.statusCode !== 201) throw new Error(`postVoc failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; display_id: string; updated_at: string };
}

// ── Actor helpers via SQL ────────────────────────────────────────────────────

export async function insertDevActor(
  dbHandle: DbHandle,
  workspaceId: string,
  suffix: string,
): Promise<{ id: string; externalId: string }> {
  const externalId = `mock-dev-read-${suffix}`;
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $4, 'developer', 'internal_member')
       on conflict (workspace_id, external_id) do update set email = excluded.email
       returning id`,
    [workspaceId, externalId, `dev-read-${suffix}@local`, `Dev Read ${suffix}`],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`insertDevActor failed for ${externalId}`);
  return { id, externalId };
}

// ── Grant helpers via SQL ────────────────────────────────────────────────────

export async function grantCapability(
  dbHandle: DbHandle,
  workspaceId: string,
  actorId: string,
  capability: string,
  msId: string | null,
  grantedByActorId: string,
): Promise<string> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into permission.permission_grants
       (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [workspaceId, actorId, capability, msId, grantedByActorId],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`grantCapability: no id returned for ${capability}`);
  return id;
}

// ── VOC direct SQL insert (bypasses REST + rate limit) ───────────────────────

export interface InsertVocOpts {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  triageState?: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
  ownerUserId?: string;
  postponedAt?: boolean; // if true, sets triage_state_review_postponed_at = now()
}

export async function insertVocDirectly(
  dbHandle: DbHandle,
  workspaceId: string,
  msId: string,
  reporterId: string,
  title: string,
  opts: InsertVocOpts = {},
): Promise<{ id: string; updated_at: string }> {
  const {
    severity = null,
    triageState = 'untriaged',
    ownerUserId = null,
    postponedAt = false,
  } = opts;

  const res = await dbHandle.pool.query<{ id: string; updated_at: string }>(
    `insert into voc.vocs
       (workspace_id, primary_managed_system_id, reporter_id, display_id, title,
        description_rich_content, source_context, reporter_facing_status, triage_state,
        severity, owner_user_id, triage_state_review_postponed_at)
     values
       ($1, $2, $3, voc.next_voc_display_id($1::uuid), $4,
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}'::jsonb,
        'direct_use', 'received', $5,
        $6, $7, ${postponedAt ? 'now()' : 'NULL'})
     returning id, updated_at::text as updated_at`,
    [workspaceId, msId, reporterId, title, triageState, severity, ownerUserId],
  );
  const row = res.rows[0];
  if (!row) throw new Error(`insertVocDirectly failed for title=${title}`);
  return { id: row.id, updated_at: row.updated_at };
}

// ── Conversation entry helpers via SQL ───────────────────────────────────────

export async function insertPublicUpdate(
  dbHandle: DbHandle,
  vocId: string,
  actorId: string,
  opts?: { createdAt?: string },
): Promise<string> {
  const body = paragraphDoc('public update');
  const createdAt = opts?.createdAt ?? undefined;
  let res;
  if (createdAt) {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_public_updates
         (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update, created_at)
       values ($1, $2, $3::jsonb, 'received', 'received', false, $4::timestamptz)
       returning id`,
      [vocId, actorId, JSON.stringify(body), createdAt],
    );
  } else {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_public_updates
         (voc_id, actor_id, body_rich_content, reporter_facing_status_before, reporter_facing_status_after, skip_public_update)
       values ($1, $2, $3::jsonb, 'received', 'received', false)
       returning id`,
      [vocId, actorId, JSON.stringify(body)],
    );
  }
  const id = res.rows[0]?.id;
  if (!id) throw new Error('insertPublicUpdate: no id returned');
  return id;
}

// reporter_replies has a BEFORE INSERT trigger enforcing actor_id = vocs.reporter_id.
// Pass the VOC's reporter_id as actorId.
export async function insertReporterReply(
  dbHandle: DbHandle,
  vocId: string,
  actorId: string,
  opts?: { createdAt?: string },
): Promise<string> {
  const body = paragraphDoc('reporter reply');
  const createdAt = opts?.createdAt ?? undefined;
  let res;
  if (createdAt) {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_reporter_replies (voc_id, actor_id, body_rich_content, created_at)
       values ($1, $2, $3::jsonb, $4::timestamptz)
       returning id`,
      [vocId, actorId, JSON.stringify(body), createdAt],
    );
  } else {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_reporter_replies (voc_id, actor_id, body_rich_content)
       values ($1, $2, $3::jsonb)
       returning id`,
      [vocId, actorId, JSON.stringify(body)],
    );
  }
  const id = res.rows[0]?.id;
  if (!id) throw new Error('insertReporterReply: no id returned');
  return id;
}

export async function insertInternalComment(
  dbHandle: DbHandle,
  vocId: string,
  actorId: string,
  opts?: { createdAt?: string },
): Promise<string> {
  const body = paragraphDoc('internal comment');
  const createdAt = opts?.createdAt ?? undefined;
  let res;
  if (createdAt) {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_internal_comments (voc_id, actor_id, body_rich_content, created_at)
       values ($1, $2, $3::jsonb, $4::timestamptz)
       returning id`,
      [vocId, actorId, JSON.stringify(body), createdAt],
    );
  } else {
    res = await dbHandle.pool.query<{ id: string }>(
      `insert into voc.voc_internal_comments (voc_id, actor_id, body_rich_content)
       values ($1, $2, $3::jsonb)
       returning id`,
      [vocId, actorId, JSON.stringify(body)],
    );
  }
  const id = res.rows[0]?.id;
  if (!id) throw new Error('insertInternalComment: no id returned');
  return id;
}

// ── Permission decisions seed fixture ────────────────────────────────────────

export async function insertPermissionDecisionsSeed(
  dbHandle: DbHandle,
  vocId: string,
  envelope: Record<string, unknown>,
): Promise<void> {
  await dbHandle.pool.query(
    `insert into voc.voc_permission_decisions_seed_fixture (voc_id, envelope)
     values ($1, $2::jsonb)
     on conflict (voc_id) do update set envelope = excluded.envelope`,
    [vocId, JSON.stringify(envelope)],
  );
}

// ── Deny helpers via SQL ─────────────────────────────────────────────────────

export async function denyCapability(
  dbHandle: DbHandle,
  workspaceId: string,
  actorId: string,
  capability: string,
  msId: string | null,
  createdByActorId: string,
): Promise<string> {
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into permission.permission_denies
       (workspace_id, actor_id, capability, managed_system_id, reason, created_by_actor_id)
     values ($1, $2, $3, $4, 'test-deny', $5)
     returning id`,
    [workspaceId, actorId, capability, msId, createdByActorId],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error(`denyCapability: no id returned for ${capability}`);
  return id;
}

export async function revokeDeny(
  dbHandle: DbHandle,
  denyId: string,
  revokedByActorId: string,
): Promise<void> {
  await dbHandle.pool.query(
    `update permission.permission_denies set revoked_at = now(), revoked_by_actor_id = $2 where id = $1`,
    [denyId, revokedByActorId],
  );
}

// ── Cleanup helpers ──────────────────────────────────────────────────────────

/** Cleans all VOC read-test fixtures from product tables. Scopes by MS slug prefix.
 *
 * Cleanup order:
 *   1. permission_grants (references actors)
 *   2. voc_permission_decisions_seed_fixture (fops_app has DELETE on this table)
 *   3. voc.vocs — conversation tables (public_updates, reporter_replies, internal_comments)
 *      have ON DELETE CASCADE on voc_id, so cascade automatically. fops_app has no
 *      DELETE on conversation tables; they are append-only at the product layer.
 *   4. analytics_areas, managed_systems (MS delete requires no voc referencing it)
 *   5. sessions, idempotency_keys, rate_limits, actors
 */
export async function cleanupReadTestTables(
  dbHandle: DbHandle,
  workspaceId: string,
  msSlugPrefix: string,
): Promise<void> {
  // 1. Clean grants + denies for test dev actors before removing actors.
  await dbHandle.pool.query(
    `delete from permission.permission_grants
      where workspace_id = $1
        and actor_id in (
          select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1
        )`,
    [workspaceId],
  );
  await dbHandle.pool.query(
    `delete from permission.permission_denies
      where workspace_id = $1
        and actor_id in (
          select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1
        )`,
    [workspaceId],
  );

  // 2. Clean permission decisions seed fixture (fops_app has DELETE).
  await dbHandle.pool.query(
    `delete from voc.voc_permission_decisions_seed_fixture
      where voc_id in (
        select id from voc.vocs
         where primary_managed_system_id in (
           select id from core.managed_systems where slug like $1 and workspace_id = $2
         )
      )`,
    [`${msSlugPrefix}%`, workspaceId],
  );

  // 3. Delete VOCs — conversation tables cascade automatically (ON DELETE CASCADE).
  //    fops_app has DELETE on voc.vocs, but NOT on conversation tables.
  await dbHandle.pool.query(
    `delete from voc.vocs
      where primary_managed_system_id in (
        select id from core.managed_systems where slug like $1 and workspace_id = $2
      )`,
    [`${msSlugPrefix}%`, workspaceId],
  );

  // 4. Remove analytics_areas and managed_systems.
  await dbHandle.pool.query(
    `delete from core.analytics_areas
      where managed_system_id in (
        select id from core.managed_systems where slug like $1 and workspace_id = $2
      )`,
    [`${msSlugPrefix}%`, workspaceId],
  );
  await dbHandle.pool.query(
    `delete from core.managed_systems where slug like $1 and workspace_id = $2`,
    [`${msSlugPrefix}%`, workspaceId],
  );

  // 5. Sessions (only dev test actors, not admin/reporter), idempotency, rate limits, actors.
  await dbHandle.pool.query('delete from core.idempotency_keys');
  await dbHandle.pool.query('delete from core.rate_limits');
  // Only delete sessions belonging to test-created dev actors, NOT admin/reporter sessions.
  // Admin and reporter sessions are created in beforeAll and must survive beforeEach cleanup.
  await dbHandle.pool.query(
    `delete from core.sessions
       where actor_id in (
         select id from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1
       )`,
    [workspaceId],
  );
  await dbHandle.pool.query(
    `delete from core.actors where external_id like 'mock-dev-read-%' and workspace_id = $1`,
    [workspaceId],
  );
}

// ── Unique slug generator ─────────────────────────────────────────────────────

export function uid(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export { randomUUID };
export { SESSION_COOKIE_NAME };
