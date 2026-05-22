// Attachments application service — PLAN-22 C3b.
//
// Owns the upload-then-INSERT contract for POST /attachments:
//   1. Generate storage_key = `{workspace_id}/{uuid}/{sanitized_filename}`.
//   2. Stream bytes to object storage. A StorageUnavailableError raised by
//      the storage lib is mapped to the ADR-0012 envelope
//      `{ code: 'storage.unavailable', status: 502 }`.
//   3. INSERT voc_attachments row (voc_id=NULL, comment_id=NULL,
//      linked_at=NULL — C3-link adds the parent later).
//   4. On INSERT failure, best-effort `storage.delete(key)` to keep the
//      bucket free of orphaned bytes. The delete is swallowed; the original
//      INSERT error re-throws.
//   5. Emit `attachment_uploaded` audit row in the SAME transaction
//      (ADR-0008). The detail schema in @fops/shared rejects any `filename`
//      field — filenames may carry PII and audit rows are broadly readable.
//   6. Return the response envelope: `{ id, name, size_bytes, mime_type,
//      uploaded_by_actor_id, created_at }`.
//
// Layer rule: the route's idempotency frame opens the transaction and calls
// this service inside it. The storage put runs BEFORE the DB INSERT so we
// never persist a row that points at missing bytes.

import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { StorageBackend } from '../../lib/storage/index.js';
import { StorageUnavailableError } from '../../lib/storage/index.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { VocReadService } from '../voc/read-service.js';
import { insertAttachment } from './repo.js';

export interface UploadAttachmentActor {
  actor_id: string;
  workspace_id: string;
}

export interface UploadAttachmentInput {
  tx: Tx;
  actor: UploadAttachmentActor;
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

export interface AttachmentEnvelope {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by_actor_id: string;
  created_at: string;
}

export interface AttachmentsServiceDeps {
  storage: StorageBackend;
  auditService: AuditService;
  db: Db;
  vocReadService: VocReadService;
}

export interface DownloadAttachmentActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

export interface DownloadAttachmentInput {
  actor: DownloadAttachmentActor;
  id: string;
}

export interface DownloadAttachmentResult {
  stream: Readable;
  mimeType: string;
  size: number;
  filename: string;
}

export function createAttachmentsService(deps: AttachmentsServiceDeps) {
  async function uploadAttachment(input: UploadAttachmentInput): Promise<AttachmentEnvelope> {
    const { tx, actor, bytes, mimeType, filename } = input;

    const attachmentId = randomUUID();
    const storageKey = `${actor.workspace_id}/${attachmentId}/${filename}`;

    // 1. Upload first — never INSERT a DB row that references missing bytes.
    try {
      await deps.storage.put({ key: storageKey, bytes, mimeType });
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        throw new HttpError('storage.unavailable', err.message);
      }
      throw err;
    }

    // 2. INSERT. On failure, best-effort cleanup of the just-uploaded bytes
    //    so the bucket does not accumulate orphans.
    let row;
    try {
      row = await insertAttachment(tx, {
        id: attachmentId,
        workspaceId: actor.workspace_id,
        name: filename,
        sizeBytes: bytes.length,
        mimeType,
        storageKey,
        uploadedByActorId: actor.actor_id,
      });
    } catch (insertErr) {
      try {
        await deps.storage.delete(storageKey);
      } catch {
        /* swallow — best-effort cleanup */
      }
      throw insertErr;
    }

    // 3. Audit (same tx, ADR-0008). Detail schema rejects `filename`.
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'attachment_uploaded',
      subject_type: 'attachment',
      subject_id: row.id,
      summary: `attachment ${row.id} uploaded`,
      detail: {
        attachment_id: row.id,
        actor_id: actor.actor_id,
        storage_key: storageKey,
        size_bytes: row.size_bytes,
        mime_type: row.mime_type,
      },
    });

    return {
      id: row.id,
      name: row.name,
      size_bytes: row.size_bytes,
      mime_type: row.mime_type,
      uploaded_by_actor_id: row.uploaded_by_actor_id,
      created_at: row.created_at.toISOString(),
    };
  }

  // ── downloadAttachment — PLAN-22 C4a ────────────────────────────────────
  //
  // Streaming GET path: select metadata, gate on entitlement, then hand the
  // route a Readable + headers. Entitlement model:
  //   * Workspace gate: storage_key MUST start with `${ctx.workspace_id}/`.
  //     Cross-workspace returns 404 (not 403) — leaking 403 confirms the row
  //     exists under another workspace.
  //   * Linked to a VOC: reuse vocReadService.getVocDetail. `kind: 'full'`
  //     → permit. `kind: 'summary'` → 403. getVocDetail throwing
  //     not_found.record → 403 (caller cannot see the parent).
  //   * Linked to a comment: not in C4a scope — comment entitlement helper
  //     does not exist as a standalone service yet. We fall back to the
  //     parent-VOC entitlement via the comment_id → voc_id resolution
  //     query; if no parent VOC is reachable, treat as 403.
  //   * Unlinked (voc_id IS NULL AND comment_id IS NULL): permit only the
  //     original uploader.
  async function downloadAttachment(
    input: DownloadAttachmentInput,
  ): Promise<DownloadAttachmentResult> {
    const { actor, id } = input;

    // 1. Fetch attachment metadata.
    const rows = await deps.db.execute<{
      id: string;
      voc_id: string | null;
      comment_id: string | null;
      comment_kind: string | null;
      name: string;
      size_bytes: string | number;
      mime_type: string;
      storage_key: string;
      uploaded_by_actor_id: string;
    }>(sql`
      select id, voc_id, comment_id, comment_kind, name, size_bytes,
             mime_type, storage_key, uploaded_by_actor_id
        from voc.voc_attachments
       where id = ${id}
       limit 1
    `);
    const row = rows.rows[0];
    if (!row) throw new HttpError('not_found.record', 'attachment not found');

    // 2. Workspace gate via storage_key prefix. The attachments table has no
    //    direct workspace_id column; the prefix is the canonical workspace
    //    binding (per uploadAttachment's `${workspace_id}/${uuid}/${name}`).
    if (!row.storage_key.startsWith(`${actor.workspace_id}/`)) {
      throw new HttpError('not_found.record', 'attachment not found');
    }

    // 3. Entitlement.
    if (row.voc_id) {
      try {
        const detail = await deps.vocReadService.getVocDetail({
          actor,
          vocId: row.voc_id,
        });
        if (detail.kind !== 'full') {
          throw new HttpError(
            'permission.denied',
            'attachment not accessible to caller',
          );
        }
      } catch (err) {
        if (err instanceof HttpError) {
          // not_found.record from getVocDetail means caller has no access at
          // all to the parent VOC. Surface as permission.denied — the row
          // exists inside the workspace; the attachment id was already
          // confirmed reachable above. 403 keeps the access-vs-existence
          // semantics consistent (the row exists, the caller just can't view).
          if (err.code === 'not_found.record') {
            throw new HttpError(
              'permission.denied',
              'attachment not accessible to caller',
            );
          }
          throw err;
        }
        throw err;
      }
    } else if (row.comment_id) {
      // Resolve parent VOC for the comment (works for public_update /
      // reporter_reply / internal_comment — all carry voc_id).
      let parentVocId: string | null = null;
      const kind = row.comment_kind;
      if (kind === 'public_update') {
        const q = await deps.db.execute<{ voc_id: string }>(sql`
          select voc_id from voc.voc_public_updates where id = ${row.comment_id} limit 1
        `);
        parentVocId = q.rows[0]?.voc_id ?? null;
      } else if (kind === 'reporter_reply') {
        const q = await deps.db.execute<{ voc_id: string }>(sql`
          select voc_id from voc.voc_reporter_replies where id = ${row.comment_id} limit 1
        `);
        parentVocId = q.rows[0]?.voc_id ?? null;
      } else if (kind === 'internal_comment') {
        const q = await deps.db.execute<{ voc_id: string }>(sql`
          select voc_id from voc.voc_internal_comments where id = ${row.comment_id} limit 1
        `);
        parentVocId = q.rows[0]?.voc_id ?? null;
      }
      if (!parentVocId) {
        throw new HttpError('permission.denied', 'attachment not accessible to caller');
      }
      try {
        const detail = await deps.vocReadService.getVocDetail({ actor, vocId: parentVocId });
        if (detail.kind !== 'full') {
          throw new HttpError('permission.denied', 'attachment not accessible to caller');
        }
      } catch (err) {
        if (err instanceof HttpError && err.code === 'not_found.record') {
          throw new HttpError('permission.denied', 'attachment not accessible to caller');
        }
        throw err;
      }
    } else {
      // Unlinked: only the uploader.
      if (row.uploaded_by_actor_id !== actor.actor_id) {
        throw new HttpError('permission.denied', 'attachment not accessible to caller');
      }
    }

    // 4. Stream from storage. Surface StorageUnavailableError as 502;
    //    NoSuchKey (stale row whose bytes are missing) as 404.
    let got;
    try {
      got = await deps.storage.get(row.storage_key);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        throw new HttpError('storage.unavailable', err.message);
      }
      const name = (err as { name?: string } | null | undefined)?.name;
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new HttpError('not_found.record', 'attachment not found');
      }
      throw err;
    }

    return {
      stream: got.stream,
      mimeType: got.mimeType ?? row.mime_type,
      size: typeof got.size === 'number'
        ? got.size
        : typeof row.size_bytes === 'string'
          ? Number(row.size_bytes)
          : row.size_bytes,
      filename: row.name,
    };
  }

  return { uploadAttachment, downloadAttachment };
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>;
