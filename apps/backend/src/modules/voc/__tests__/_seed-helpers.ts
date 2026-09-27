// VOC-local seed utilities for tests under this directory.
// Helpers consumed by tests in other modules live in src/test-support/.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../test-support/auth.js';
import { paragraphDoc } from '../../../test-support/rich-content-fixtures.js';

// ── Managed System helper via REST ────────────────────────────────────────────

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

// ── VOC helper via REST ──────────────────────────────────────────────────────

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

// ── Conversation entry helpers via SQL ───────────────────────────────────────

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

// PLAN-22 §Bug-1 (2026-05-22): direct insert of a linked attachment row
// for the GET /vocs/:id and GET /vocs/:id/conversation tests. Bypasses the
// POST /attachments + linkAttachments pipeline (those are exercised in the
// attachments suite). `parent` chooses which FK is populated.
export async function insertLinkedAttachment(
  dbHandle: DbHandle,
  workspaceId: string,
  parent:
    | { kind: 'voc'; vocId: string }
    | { kind: 'public_update' | 'reporter_reply' | 'internal_comment'; commentId: string },
  uploaderActorId: string,
  opts: { name?: string; sizeBytes?: number; mimeType?: string; archived?: boolean } = {},
): Promise<{ id: string }> {
  const { name = 'shot.png', sizeBytes = 1024, mimeType = 'image/png', archived = false } = opts;
  const storageKey = `${workspaceId}/${randomUUID()}/${name}`;
  const vocIdArg = parent.kind === 'voc' ? parent.vocId : null;
  const commentIdArg = parent.kind === 'voc' ? null : parent.commentId;
  const commentKindArg = parent.kind === 'voc' ? null : parent.kind;
  const res = await dbHandle.pool.query<{ id: string }>(
    `insert into voc.voc_attachments
       (voc_id, comment_id, comment_kind, name, size_bytes, mime_type,
        storage_key, uploaded_by_actor_id, linked_at, archived_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)
     returning id`,
    [
      vocIdArg,
      commentIdArg,
      commentKindArg,
      name,
      sizeBytes,
      mimeType,
      storageKey,
      uploaderActorId,
      archived ? new Date() : null,
    ],
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('insertLinkedAttachment: no id returned');
  return { id };
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
