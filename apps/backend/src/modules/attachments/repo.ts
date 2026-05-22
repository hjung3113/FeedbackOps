// Attachments repo — PLAN-22 C3b + C7b.
//
// Owns writes to voc.voc_attachments only (module ownership per
// docs/implementation/02-domain-module-boundaries.md). The route layer wraps
// the INSERT in the ADR-0015 idempotency frame; this repo emits a single
// INSERT ... RETURNING.
//
// C7b adds `linkAttachments` — atomically attaches pre-uploaded unlinked
// rows to a newly-created VOC or comment in the same transaction.
//
// Slice-3 #22 invariants:
//   * Initial INSERT leaves the attachment unlinked: voc_id = NULL,
//     comment_id = NULL, linked_at = NULL. The C7b link step attaches the
//     row to a VOC or comment.
//   * storage_key carries a UNIQUE index — accidental collisions surface as
//     a unique_violation, which the service layer maps after the storage put
//     succeeded.

import { sql } from 'drizzle-orm';

import type { Tx } from '../../db/tx.js';

export interface InsertAttachmentInput {
  id: string;
  workspaceId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  storageKey: string;
  uploadedByActorId: string;
}

export interface InsertedAttachmentRow {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by_actor_id: string;
  created_at: Date;
}

export async function insertAttachment(
  tx: Tx,
  input: InsertAttachmentInput,
): Promise<InsertedAttachmentRow> {
  // Raw SQL because the voc_attachments drizzle schema does not currently
  // expose a workspace_id column on the typed table (workspace association
  // travels via voc_id / comment_id after linking). The migration ships a
  // physical workspace_id-less table; insert stays minimal.
  const rows = await tx.execute<{
    id: string;
    name: string;
    size_bytes: string | number;
    mime_type: string;
    uploaded_by_actor_id: string;
    created_at: Date;
  }>(sql`
    insert into voc.voc_attachments
      (id, voc_id, comment_id, comment_kind, name, size_bytes, mime_type,
       storage_key, uploaded_by_actor_id, linked_at)
    values
      (${input.id}, null, null, null, ${input.name}, ${input.sizeBytes},
       ${input.mimeType}, ${input.storageKey}, ${input.uploadedByActorId}, null)
    returning id, name, size_bytes, mime_type, uploaded_by_actor_id, created_at
  `);
  const row = rows.rows[0];
  if (!row) throw new Error('insertAttachment returned no row');
  return {
    id: row.id,
    name: row.name,
    size_bytes: typeof row.size_bytes === 'string' ? Number(row.size_bytes) : row.size_bytes,
    mime_type: row.mime_type,
    uploaded_by_actor_id: row.uploaded_by_actor_id,
    created_at: row.created_at,
  };
}

// ── linkAttachments (PLAN-22 C7b) ──────────────────────────────────────────

export type LinkAttachmentsParent =
  | { kind: 'voc'; vocId: string }
  | { kind: 'public_update'; commentId: string }
  | { kind: 'reporter_reply'; commentId: string }
  | { kind: 'internal_comment'; commentId: string };

export interface LinkAttachmentsInput {
  attachmentIds: string[];
  parent: LinkAttachmentsParent;
  uploaderActorId: string;
}

export interface LinkedAttachmentRow {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by_actor_id: string;
  storage_key: string;
  created_at: Date;
  linked_at: Date;
}

/**
 * Atomically link a batch of pre-uploaded, unlinked, actor-owned attachment
 * rows to a parent VOC or comment. Same transaction as the parent INSERT so
 * any link failure rolls the parent back (atomic-linking contract).
 *
 * Guard predicate per row (all must hold; otherwise → 422):
 *   - row exists
 *   - voc_id IS NULL AND comment_id IS NULL (unlinked)
 *   - uploaded_by_actor_id === uploaderActorId (owned by caller)
 *   - archived_at IS NULL (active row)
 *
 * Returns the linked rows (one per requested id, in the SAME ORDER as the
 * input). Throws `LinkAttachmentsRejected` with the offending index when any
 * predicate fails — caller maps to `validation.failed { fields }`.
 */
export class LinkAttachmentsRejected extends Error {
  constructor(
    public readonly index: number,
    public readonly attachmentId: string,
    public readonly reason: 'not_found' | 'already_linked' | 'wrong_actor' | 'archived',
  ) {
    super(`attachment_ids[${index}] rejected: ${reason}`);
    this.name = 'LinkAttachmentsRejected';
  }
}

export async function linkAttachments(
  tx: Tx,
  input: LinkAttachmentsInput,
): Promise<LinkedAttachmentRow[]> {
  if (input.attachmentIds.length === 0) return [];

  // Resolve the SET clause based on parent kind.
  let vocIdSet: string | null = null;
  let commentIdSet: string | null = null;
  let commentKindSet:
    | 'public_update'
    | 'reporter_reply'
    | 'internal_comment'
    | null = null;
  if (input.parent.kind === 'voc') {
    vocIdSet = input.parent.vocId;
  } else {
    commentIdSet = input.parent.commentId;
    commentKindSet = input.parent.kind;
  }

  // Per-id UPDATE with a guarded WHERE — predicate failure → row count 0 →
  // caller-supplied reason discrimination via a follow-up SELECT.
  const linked: LinkedAttachmentRow[] = [];
  for (let i = 0; i < input.attachmentIds.length; i += 1) {
    const id = input.attachmentIds[i]!;
    const upd = await tx.execute<{
      id: string;
      name: string;
      size_bytes: string | number;
      mime_type: string;
      uploaded_by_actor_id: string;
      storage_key: string;
      created_at: Date;
      linked_at: Date;
    }>(sql`
      update voc.voc_attachments
         set voc_id = ${vocIdSet},
             comment_id = ${commentIdSet},
             comment_kind = ${commentKindSet},
             linked_at = now()
       where id = ${id}
         and voc_id is null
         and comment_id is null
         and uploaded_by_actor_id = ${input.uploaderActorId}
         and archived_at is null
       returning id, name, size_bytes, mime_type, uploaded_by_actor_id,
                 storage_key, created_at, linked_at
    `);
    const row = upd.rows[0];
    if (!row) {
      // Discriminate the reason — single follow-up SELECT.
      const reasonRows = await tx.execute<{
        voc_id: string | null;
        comment_id: string | null;
        uploaded_by_actor_id: string;
        archived_at: Date | null;
      }>(sql`
        select voc_id, comment_id, uploaded_by_actor_id, archived_at
          from voc.voc_attachments
         where id = ${id}
         limit 1
      `);
      const r = reasonRows.rows[0];
      if (!r) {
        throw new LinkAttachmentsRejected(i, id, 'not_found');
      }
      if (r.archived_at !== null) {
        throw new LinkAttachmentsRejected(i, id, 'archived');
      }
      if (r.voc_id !== null || r.comment_id !== null) {
        throw new LinkAttachmentsRejected(i, id, 'already_linked');
      }
      if (r.uploaded_by_actor_id !== input.uploaderActorId) {
        throw new LinkAttachmentsRejected(i, id, 'wrong_actor');
      }
      // Defensive: predicates not exhausted (shouldn't reach here).
      throw new LinkAttachmentsRejected(i, id, 'not_found');
    }
    linked.push({
      id: row.id,
      name: row.name,
      size_bytes:
        typeof row.size_bytes === 'string' ? Number(row.size_bytes) : row.size_bytes,
      mime_type: row.mime_type,
      uploaded_by_actor_id: row.uploaded_by_actor_id,
      storage_key: row.storage_key,
      created_at: row.created_at,
      linked_at: row.linked_at,
    });
  }
  return linked;
}

/**
 * Caller helper: convert a `LinkAttachmentsRejected` into the canonical
 * 422 envelope `validation.failed` shape (path `['attachment_ids', i]`,
 * code `'invalid'`). The reason is surfaced as `detail.reason` for debugging
 * but the public contract is just the field path + code.
 */
export function linkRejectedFields(err: LinkAttachmentsRejected): {
  fields: ReadonlyArray<{ path: ReadonlyArray<string | number>; code: string }>;
  reason: string;
} {
  return {
    fields: [{ path: ['attachment_ids', err.index], code: 'invalid' }],
    reason: err.reason,
  };
}

/**
 * Resolve linked rows back to the canonical AttachmentRef shape used by the
 * `voc_description_edited` audit event detail. Storage URI is derived from
 * the canonical `storage_key` (no exposure to clients — audit only).
 */
export function toAttachmentRefForAudit(row: LinkedAttachmentRow): {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  storage_uri: string;
} {
  return {
    id: row.id,
    name: row.name,
    size_bytes: row.size_bytes,
    mime_type: row.mime_type,
    // PLAN-22 C7b: audit replay shape carries `storage_uri`; map from the
    // canonical `storage_key` (post-C2 rename). Internal-only field.
    storage_uri: row.storage_key,
  };
}
