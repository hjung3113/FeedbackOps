// Attachments repo — PLAN-22 C3b.
//
// Owns writes to voc.voc_attachments only (module ownership per
// docs/implementation/02-domain-module-boundaries.md). The route layer wraps
// the INSERT in the ADR-0015 idempotency frame; this repo emits a single
// INSERT ... RETURNING.
//
// Slice-3 #22 invariants:
//   * Initial INSERT leaves the attachment unlinked: voc_id = NULL,
//     comment_id = NULL, linked_at = NULL. The C3 link step (later commit)
//     attaches the row to a VOC or comment.
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
