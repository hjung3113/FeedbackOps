// Reporter VOC description edit command and its idempotent entry point.
import { createHash, randomUUID } from 'node:crypto';

import type { EditDescriptionRequest } from '@fops/shared';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import { stableStringify } from '../../../lib/json/stable-stringify.js';
import { sanitizeRichContentOrThrow } from '../../../lib/rich-content/sanitize-or-throw.js';
import {
  LinkAttachmentsRejected,
  linkAttachments,
  linkRejectedFields,
  toAttachmentRefForAudit,
} from '../../attachments/index.js';
import { lockManagedSystem } from '../../managed-systems/index.js';
import { selectVocForUpdate, updateVocDescriptionFields } from '../repo.js';
import { type ReporterFacingStatus, nextReporterStates } from '../transitions.js';
import type { VocEnvelope, VocServiceDeps } from '../service.js';
import { composeEnvelope } from './compose-envelope.js';
import { runIdempotentCommand } from '../../core/idempotency/idempotent-command.js';

export function createVocEditDescriptionCommands(deps: VocServiceDeps) {
  // ── editVocDescription ────────────────────────────────────────────────────
  // PATCH /vocs/:id/description — Reporter-only, pre-triage-only edit.
  // Service-layer ordering (locked per plan §17):
  //   1. selectVocForUpdate → 404 / archived
  //   2. Actor must equal voc.reporter_id → 403 permission.denied
  //   3. triage_state must be 'untriaged' → 409 conflict.triage_already_committed
  //   4. If-Match compare → 409 conflict.stale_write
  //   5. Lock parent MS → archived → 409 conflict.parent_archived
  //   6. Sanitize description_rich_content
  //   7. Reject non-empty attachments → 422
  //   8. Diff computation
  //   9. Empty diff → return existing envelope, no UPDATE, no audit
  //  10. Non-empty diff → updateVocDescriptionFields + audit + return envelope
  async function editVocDescription(args: {
    tx: Tx;
    actor: { actor_id: string; workspace_id: string };
    vocId: string;
    ifMatch: string;
    input: EditDescriptionRequest;
  }): Promise<VocEnvelope> {
    const { tx, actor, vocId, ifMatch, input } = args;
    const workspaceId = actor.workspace_id;

    // 1. FOR UPDATE lock on the VOC row.
    const row = await selectVocForUpdate(tx, workspaceId, vocId);
    if (!row) throw new HttpError('not_found.record', 'voc not found');
    if (row.archivedAt !== null) {
      throw new HttpError('conflict.record_archived', 'voc is archived');
    }

    // 2. Reporter-only: actor must equal voc.reporter_id — no admin elevation.
    if (actor.actor_id !== row.reporterId) {
      throw new HttpError(
        'permission.denied',
        'only the original reporter may edit voc description',
        { fields: [{ path: ['actor_id'], code: 'not_reporter' }] },
      );
    }

    // 3. Triage state gate: only untriaged VOCs can have description edited.
    if (row.triageState !== 'untriaged') {
      throw new HttpError(
        'conflict.triage_already_committed',
        'voc triage has already been committed; description can no longer be edited',
        { current_triage_state: row.triageState },
      );
    }

    // 4. Optimistic concurrency check (after permission and state checks).
    if (row.updatedAt.toISOString() !== ifMatch) {
      throw new HttpError('conflict.stale_write', 'voc updated_at does not match If-Match', {
        current_updated_at: row.updatedAt.toISOString(),
      });
    }

    // 5. FOR UPDATE lock on parent Managed System.
    const ms = await lockManagedSystem(tx, workspaceId, row.primaryManagedSystemId);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at !== null) {
      throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    }

    // 6. Sanitize description_rich_content when present.
    let sanitizedDoc: ReturnType<typeof sanitizeRichContentOrThrow> | null = null;
    if (input.description_rich_content !== undefined) {
      sanitizedDoc = sanitizeRichContentOrThrow({
        surface: 'voc-description',
        doc: input.description_rich_content,
        fieldPath: ['description_rich_content'],
      });
    }

    // 7. PLAN-22 C7b — link supplied attachment_ids in the same tx. Each id
    // must be unlinked, actor-owned, non-archived. Failure rolls the tx back.
    // The legacy `attachment.unsupported_pending_storage_slice` rejection has
    // been retired.
    let linkedAttachmentsForAudit: ReturnType<typeof toAttachmentRefForAudit>[] = [];
    if (input.attachment_ids && input.attachment_ids.length > 0) {
      try {
        const linked = await linkAttachments(tx, {
          attachmentIds: input.attachment_ids,
          parent: { kind: 'voc', vocId },
          uploaderActorId: actor.actor_id,
        });
        linkedAttachmentsForAudit = linked.map(toAttachmentRefForAudit);
      } catch (err) {
        if (err instanceof LinkAttachmentsRejected) {
          throw new HttpError(
            'validation.failed',
            `attachment_ids[${err.index}] rejected: ${err.reason}`,
            linkRejectedFields(err),
          );
        }
        throw err;
      }
    }

    // 8. Diff computation.
    type DescChanges = {
      title?: { from: string; to: string };
      description_rich_content?: { from_hash: string; to_hash: string };
      attachments?: {
        from: ReadonlyArray<{
          id: string;
          name: string;
          size_bytes: number;
          mime_type: string;
          storage_uri: string;
        }>;
        to: ReadonlyArray<{
          id: string;
          name: string;
          size_bytes: number;
          mime_type: string;
          storage_uri: string;
        }>;
      };
    };
    const changes: DescChanges = {};

    // title diff
    if (input.title !== undefined && input.title !== row.title) {
      changes.title = { from: row.title, to: input.title };
    }

    // description_rich_content diff — compare via SHA-256 of stableStringify
    if (input.description_rich_content !== undefined && sanitizedDoc !== null) {
      const fromHash = createHash('sha256')
        .update(stableStringify(row.descriptionRichContent))
        .digest('hex');
      const toHash = createHash('sha256').update(stableStringify(sanitizedDoc)).digest('hex');
      if (fromHash !== toHash) {
        changes.description_rich_content = { from_hash: fromHash, to_hash: toHash };
      }
    }

    // attachments diff (PLAN-22 C7b) — audit replay shape unchanged:
    // `{ from: AttachmentRef[], to: AttachmentRef[] }`. Pre-C7b VOCs never
    // had linked attachments at edit time, so `from` is always [] for the
    // current chunk; `to` is the rows we just linked. Future chunks that
    // support remove/replace will populate `from` from a prior SELECT.
    if (input.attachment_ids !== undefined && linkedAttachmentsForAudit.length > 0) {
      changes.attachments = { from: [], to: linkedAttachmentsForAudit };
    }

    // 9. Empty diff — return current envelope without any writes.
    if (Object.keys(changes).length === 0) {
      // Breadcrumb: no-op edit, idempotency will cache the result.
      const nextStates = await nextReporterStates(
        row.reporterFacingStatus as ReporterFacingStatus,
        tx,
      );
      return composeEnvelope(row, nextStates);
    }

    // 10. Non-empty diff — UPDATE + audit + return refreshed envelope.
    // Attachment-only edits still need an updated row; pass the current title
    // through unchanged so the repo guard can bump updated_at.
    const updatedRow = await updateVocDescriptionFields({
      tx,
      vocId,
      workspaceId,
      title:
        changes.title !== undefined
          ? changes.title.to
          : changes.attachments !== undefined
            ? row.title
            : undefined,
      descriptionRichContent:
        changes.description_rich_content !== undefined && sanitizedDoc !== null
          ? sanitizedDoc
          : undefined,
    });

    await deps.auditService.record(tx, {
      workspace_id: workspaceId,
      actor_id: actor.actor_id,
      event_type: 'voc_description_edited',
      subject_type: 'voc',
      subject_id: vocId,
      summary: `VOC ${updatedRow.displayId} description edited by reporter`,
      detail: {
        voc_id: vocId,
        changes,
      },
    });

    // #168 (ADR-0034 D6) — only title/description changes alter the embedding
    // input. An attachment-only edit bumps updated_at but leaves the derived
    // text identical, so enqueuing it would be a guaranteed `unchanged` job.
    if (changes.title !== undefined || changes.description_rich_content !== undefined) {
      await deps.embeddingEnqueuer?.enqueue({
        workspaceId,
        vocId,
        correlationId: randomUUID(),
      });
    }

    const nextStates = await nextReporterStates(
      updatedRow.reporterFacingStatus as ReporterFacingStatus,
      tx,
    );
    return composeEnvelope(updatedRow, nextStates);
  }
  async function editVocDescriptionCommand(args: {
    actor: { actor_id: string; workspace_id: string };
    vocId: string;
    ifMatch: string;
    input: EditDescriptionRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: VocEnvelope }> {
    const { actor, vocId, ifMatch, input, idempotencyKey, requestHash } = args;
    return runIdempotentCommand({
      db: deps.db,
      idempotencyService: deps.idempotencyService,
      actorId: actor.actor_id,
      idempotencyKey,
      requestHash,
      status: 200,
      work: (tx) => editVocDescription({ tx, actor, vocId, ifMatch, input }),
    });
  }
  return { editVocDescription, editVocDescriptionCommand };
}
