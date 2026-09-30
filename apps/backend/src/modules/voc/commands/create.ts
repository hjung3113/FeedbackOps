// VOC creation command and its idempotent entry point.
import { randomUUID } from 'node:crypto';

import type { CreateVocRequest } from '@fops/shared';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import { sanitizeRichContentOrThrow } from '../../../lib/rich-content/sanitize-or-throw.js';
import { assertActiveAnalyticsAreaForManagedSystem } from '../../analytics-areas/index.js';
import {
  LinkAttachmentsRejected,
  linkAttachments,
  linkRejectedFields,
} from '../../attachments/index.js';
import { lockManagedSystem } from '../../managed-systems/index.js';
import { insertVoc } from '../repo.js';
import type { CreateVocActor, VocEnvelope, VocServiceDeps } from '../service.js';
import { type ReporterFacingStatus, nextReporterStates } from '../transitions.js';

export function createVocCreateCommands(deps: VocServiceDeps) {
  async function createVoc(args: {
    tx: Tx;
    actor: CreateVocActor;
    input: CreateVocRequest;
  }): Promise<VocEnvelope> {
    const { tx, actor, input } = args;

    // 1. FOR UPDATE on parent MS (cross-workspace + archive race).
    const ms = await lockManagedSystem(tx, actor.workspace_id, input.primary_managed_system_id);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at) {
      throw new HttpError('conflict.parent_archived', 'managed system archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    }

    // 2. FOR UPDATE on AA (if supplied) — verify MS match + not archived.
    if (input.analytics_area_id) {
      await assertActiveAnalyticsAreaForManagedSystem(
        tx,
        actor.workspace_id,
        ms.id,
        input.analytics_area_id,
      );
    }

    // 3. Sanitize rich content.
    const sanitized = sanitizeRichContentOrThrow({
      surface: 'voc-description',
      doc: input.description_rich_content,
      fieldPath: ['description_rich_content'],
    });

    // 4. INSERT vocs. `insertVoc` returns `inserted[0]` which is typed as
    // possibly-undefined under noUncheckedIndexedAccess; narrow defensively.
    // PLAN-22 C7b: the legacy `attachment.unsupported_pending_storage_slice`
    // raise has been retired; the storage slice ships, and attachments are
    // linked in step 5 below via `attachment_ids[]`.
    const row = await insertVoc(tx, {
      workspaceId: actor.workspace_id,
      primaryManagedSystemId: input.primary_managed_system_id,
      analyticsAreaId: input.analytics_area_id ?? null,
      reporterId: actor.actor_id,
      title: input.title,
      descriptionRichContent: sanitized,
      sourceContext: input.source_context,
    });
    if (!row) {
      throw new Error('insertVoc returned no row');
    }

    // 5. PLAN-22 C7b — atomic attachment linking. Each id must reference an
    // unlinked, actor-owned, non-archived voc_attachments row. Any predicate
    // failure raises validation.failed → tx rolls back (VOC not persisted).
    if (input.attachment_ids && input.attachment_ids.length > 0) {
      try {
        await linkAttachments(tx, {
          attachmentIds: input.attachment_ids,
          parent: { kind: 'voc', vocId: row.id },
          uploaderActorId: actor.actor_id,
        });
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

    // 6. Audit (same tx, ADR-0008).
    await deps.auditService.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: 'voc_created',
      subject_type: 'voc',
      subject_id: row.id,
      summary: `VOC ${row.displayId} created`,
      detail: {
        voc_id: row.id,
        workspace_id: actor.workspace_id,
        primary_managed_system_id: row.primaryManagedSystemId,
        analytics_area_id: row.analyticsAreaId,
        reporter_id: row.reporterId,
        source_context: row.sourceContext,
        attachment_ids: input.attachment_ids ?? [],
      },
    });

    // 6b. #168 (ADR-0034 D6) — enqueue the embedding job. Deliberately the
    // last thing before composing the envelope, and deliberately incapable of
    // failing this write: the enqueuer swallows and logs its own errors, and
    // does not join `tx`. A dropped enqueue costs at most one backfill cycle.
    await deps.embeddingEnqueuer?.enqueue({
      workspaceId: actor.workspace_id,
      vocId: row.id,
      correlationId: randomUUID(),
    });

    // 7. Compose envelope. Fresh VOC: next_actions=[] (frontend Inbox
    // row renders "처리 대기" copy); next_reporter_states reads the
    // transition matrix from #12.
    const nextStates = await nextReporterStates(
      row.reporterFacingStatus as ReporterFacingStatus,
      tx,
    );
    return {
      id: row.id,
      display_id: row.displayId,
      workspace_id: row.workspaceId,
      primary_managed_system_id: row.primaryManagedSystemId,
      analytics_area_id: row.analyticsAreaId,
      reporter_id: row.reporterId,
      title: row.title,
      description_rich_content: row.descriptionRichContent,
      severity: null,
      reporter_facing_status: row.reporterFacingStatus as ReporterFacingStatus,
      triage_state: 'untriaged',
      owner_user_id: null,
      owner_team_id: null,
      source_context: row.sourceContext,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      next_actions: [],
      next_reporter_states: nextStates,
      permission_decisions: {},
    };
  }
  // ── Application commands (#392) ───────────────────────────────────────────
  // Caller contract for HTTP and non-HTTP entry: each command owns the
  // complete atomic frame — transaction, advisory lock, idempotency
  // lookup/replay/record — and returns exactly what the routes used to
  // assemble (`{ status, body }`). The Tx-aware functions (createVoc,
  // updateVoc, editVocDescription) are internals shared with cluster
  // candidate-apply and existing tests.
  async function createVocCommand(args: {
    actor: CreateVocActor;
    input: CreateVocRequest;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<{ status: number; body: VocEnvelope }> {
    const { actor, input, idempotencyKey, requestHash } = args;
    return deps.db.transaction(async (tx) =>
      deps.idempotencyService.runIdempotent(
        tx,
        actor.actor_id,
        idempotencyKey,
        requestHash,
        async () => {
          const envelope = await createVoc({ tx, actor, input });
          return { status: 201, body: envelope };
        },
      ),
    );
  }
  return { createVoc, createVocCommand };
}
