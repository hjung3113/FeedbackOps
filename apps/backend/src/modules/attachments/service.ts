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

import type { StorageBackend } from '../../lib/storage/index.js';
import { StorageUnavailableError } from '../../lib/storage/index.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
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

  return { uploadAttachment };
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>;
