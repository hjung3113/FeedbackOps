// apps/backend/src/modules/voc/service.ts
// VOC application service. Owns transactions, sanitization,
// FOR-UPDATE-guarded parent checks, INSERT, and audit emission per
// ADR-0008 + ADR-0019. Per apps/backend/AGENTS.md Layer Rules, the public
// API accepts a `Tx` so the controller's idempotency frame can own the
// transaction.

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import { sanitizeTipTap } from '../../lib/rich-content/sanitize.js';
import { nextReporterStates, type ReporterFacingStatus } from './transitions.js';
import { insertVoc, lockAnalyticsArea, lockManagedSystem } from './repo.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CreateVocRequest } from '@fops/shared';

export interface CreateVocActor {
  actor_id: string;
  workspace_id: string;
}

export interface VocEnvelope {
  id: string;
  display_id: string;
  workspace_id: string;
  primary_managed_system_id: string;
  analytics_area_id: string | null;
  reporter_id: string;
  title: string;
  description_rich_content: unknown;
  severity: null;
  reporter_facing_status: ReporterFacingStatus;
  triage_state: 'untriaged';
  owner_user_id: null;
  owner_team_id: null;
  source_context: string;
  created_at: string;
  updated_at: string;
  next_actions: never[];
  next_reporter_states: {
    allowed: ReporterFacingStatus[];
    forbidden: Partial<Record<ReporterFacingStatus, string>>;
  };
  permission_decisions: Record<string, never>;
}

export interface VocServiceDeps {
  db: Db;
  auditService: AuditService;
}

export function createVocService(deps: VocServiceDeps) {
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
      const aa = await lockAnalyticsArea(tx, actor.workspace_id, input.analytics_area_id);
      if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
      if (aa.managed_system_id !== ms.id) {
        throw new HttpError('validation.failed', 'analytics_area does not belong to managed_system', {
          fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }],
        });
      }
      if (aa.archived_at) {
        throw new HttpError('conflict.parent_archived', 'analytics area archived', {
          fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
        });
      }
    }

    // 3. Sanitize rich content.
    const sanitized = sanitizeTipTap({
      surface: 'voc-description',
      doc: input.description_rich_content,
    });
    if (!sanitized.ok) {
      throw new HttpError(sanitized.error.code, sanitized.error.reason, {
        fields: [
          {
            path: ['description_rich_content'],
            code: sanitized.error.code === 'rich_content.external_image_forbidden'
              ? 'external_image_forbidden'
              : 'disallowed_node',
          },
        ],
        hint: sanitized.error.path,
      });
    }

    // 4. Attachment guard — Slice 3 ships with no upload endpoint.
    if (input.attachments && input.attachments.length > 0) {
      throw new HttpError(
        'attachment.unsupported_pending_storage_slice',
        'attachments are not supported until the storage slice ships (#22)',
        {
          fields: [{ path: ['attachments'], code: 'unsupported' }],
        },
      );
    }

    // 5. INSERT vocs. `insertVoc` returns `inserted[0]` which is typed as
    // possibly-undefined under noUncheckedIndexedAccess; narrow defensively.
    const row = await insertVoc(tx, {
      workspaceId: actor.workspace_id,
      primaryManagedSystemId: input.primary_managed_system_id,
      analyticsAreaId: input.analytics_area_id ?? null,
      reporterId: actor.actor_id,
      title: input.title,
      descriptionRichContent: sanitized.doc,
      sourceContext: input.source_context,
    });
    if (!row) {
      throw new Error('insertVoc returned no row');
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
      },
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

  return { createVoc };
}

export type VocService = ReturnType<typeof createVocService>;
