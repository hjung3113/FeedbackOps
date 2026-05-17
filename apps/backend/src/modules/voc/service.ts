// apps/backend/src/modules/voc/service.ts
// VOC application service. Owns transactions, sanitization,
// FOR-UPDATE-guarded parent checks, INSERT, and audit emission per
// ADR-0008 + ADR-0019. Per apps/backend/AGENTS.md Layer Rules, the public
// API accepts a `Tx` so the controller's idempotency frame can own the
// transaction.

import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { vocs } from '../../db/schema/voc.js';
import { HttpError } from '../../lib/errors.js';
import { sanitizeTipTap } from '../../lib/rich-content/sanitize.js';
import { nextReporterStates, type ReporterFacingStatus } from './transitions.js';
import { insertVoc, lockAnalyticsArea, lockManagedSystem, selectVocForUpdate } from './repo.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CheckService } from '../permissions/check-service.js';
import type { RoleLevel } from '../auth/session-service.js';
import type { CreateVocRequest, PatchVocRequest } from '@fops/shared';

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
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  reporter_facing_status: ReporterFacingStatus;
  triage_state: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
  owner_user_id: string | null;
  owner_team_id: string | null;
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
  checkService: CheckService;
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

  async function updateVoc(args: {
    tx: Tx;
    actor: { actor_id: string; workspace_id: string; role_level: RoleLevel };
    vocId: string;
    ifMatch: string;
    input: PatchVocRequest;
  }): Promise<VocEnvelope> {
    const { tx, actor, vocId, ifMatch, input } = args;
    const workspaceId = actor.workspace_id;

    // 1. FOR UPDATE lock on the VOC row.
    const row = await selectVocForUpdate(tx, workspaceId, vocId);
    if (!row) throw new HttpError('not_found.record', 'voc not found');
    if (row.archivedAt !== null) throw new HttpError('conflict.record_archived', 'voc is archived');

    // 2. Optimistic concurrency check.
    if (row.updatedAt.toISOString() !== ifMatch) {
      throw new HttpError('conflict.stale_write', 'voc updated_at does not match If-Match', {
        current_updated_at: row.updatedAt.toISOString(),
      });
    }

    // 3. FOR UPDATE lock on parent Managed System.
    const ms = await lockManagedSystem(tx, workspaceId, row.primaryManagedSystemId);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at !== null) {
      throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    }

    // 4. Permission re-check inside the tx (ADR-0019 Section D).
    const decision = await deps.checkService.checkCapability(
      { actor_id: actor.actor_id, workspace_id: workspaceId, role_level: actor.role_level },
      'voc.triage',
      { workspace_id: workspaceId, managed_system_id: row.primaryManagedSystemId },
      { tx },
    );
    if (decision.allow !== true) {
      // F1: discriminate by reason. Only `no_grant` for a developer role maps
      // to `permission.scope_required` (actor may request MS-scoped access).
      // Explicit deny / revoke / expiry → `permission.denied` with no
      // requestable_permission (ADR-0012 / ErrorEnvelope semantics).
      if (decision.reason === 'no_grant' && actor.role_level === 'developer') {
        throw new HttpError(
          'permission.scope_required',
          'voc.triage capability required; developer needs MS-scoped grant',
          {
            requiredScope: [row.primaryManagedSystemId],
            requestable_permission: {
              permission: 'voc.triage',
              managed_system_id: row.primaryManagedSystemId,
              reason_required: false,
            },
          },
        );
      }
      // explicit_deny / grant_revoked / grant_expired → generic denied.
      throw new HttpError(
        'permission.denied',
        `voc.triage denied: ${decision.reason}`,
        { reason: decision.reason },
      );
    }

    // 5. Analytics area cross-scope guard (only when supplied and non-null and changed).
    if (
      input.analytics_area_id !== undefined &&
      input.analytics_area_id !== null &&
      input.analytics_area_id !== row.analyticsAreaId
    ) {
      const aa = await lockAnalyticsArea(tx, workspaceId, input.analytics_area_id);
      if (!aa) throw new HttpError('not_found.record', 'analytics area not found');
      if (aa.managed_system_id !== row.primaryManagedSystemId) {
        throw new HttpError('validation.failed', 'analytics_area does not belong to managed_system', {
          fields: [{ path: ['analytics_area_id'], code: 'out_of_scope' }],
        });
      }
      if (aa.archived_at !== null) {
        throw new HttpError('conflict.parent_archived', 'analytics area archived', {
          fields: [{ path: ['analytics_area_id'], code: 'parent_archived' }],
        });
      }
    }

    // 6. Mutex: both owner fields non-null simultaneously (belt-and-suspenders;
    //    patchVocRequestSchema refine already catches this in the route layer).
    if (input.owner_user_id != null && input.owner_team_id != null) {
      throw new HttpError('validation.failed', 'owner_user_id and owner_team_id are mutually exclusive', {
        fields: [{ path: ['owner_team_id'], code: 'invalid' }],
      });
    }
    if (input.postpone_review === true && input.triage_state !== undefined) {
      throw new HttpError('validation.failed', 'postpone_review and triage_state cannot be set together', {
        fields: [{ path: ['postpone_review'], code: 'invalid' }],
      });
    }

    // 7a. postpone_review path — set postponed_at and emit a single audit row.
    //     Other mutable fields (severity, owner, AA) may still change alongside;
    //     they emit their own audit rows below in the standard diff path.
    if (input.postpone_review === true) {
      // F7: postpone is semantically "delay a pending triage decision". Applying
      // it to a row that is already triaged (or dismissed) is invalid — the
      // triage_state_review_postponed_at column is only meaningful for untriaged
      // VOCs. Guard here so the audit log stays clean.
      if (row.triageState !== 'untriaged') {
        throw new HttpError(
          'validation.failed',
          'postpone_review only applies to untriaged VOCs',
          { fields: [{ path: ['postpone_review'], code: 'invalid_state' }] },
        );
      }
      // Build the diff for any accompanying field changes.
      type VocPostponePatch = {
        triageStateReviewPostponedAt: ReturnType<typeof sql>;
        severity?: 'low' | 'medium' | 'high' | 'critical' | null;
        ownerUserId?: string | null;
        ownerTeamId?: string | null;
        analyticsAreaId?: string | null;
      };
      const postponePatch: VocPostponePatch = {
        triageStateReviewPostponedAt: sql`NOW()`,
      };
      let pSeverityChanged = false;
      let pOwnerChanged = false;
      let pAaChanged = false;

      if (input.severity !== undefined && input.severity !== row.severity) {
        postponePatch.severity = input.severity;
        pSeverityChanged = true;
      }
      const pNewOwnerUser = input.owner_user_id !== undefined ? (input.owner_user_id ?? null) : row.ownerUserId;
      const pNewOwnerTeam = input.owner_team_id !== undefined ? (input.owner_team_id ?? null) : row.ownerTeamId;
      if (pNewOwnerUser !== row.ownerUserId || pNewOwnerTeam !== row.ownerTeamId) {
        postponePatch.ownerUserId = pNewOwnerUser;
        postponePatch.ownerTeamId = pNewOwnerTeam;
        pOwnerChanged = true;
      }
      if (input.analytics_area_id !== undefined && input.analytics_area_id !== row.analyticsAreaId) {
        postponePatch.analyticsAreaId = input.analytics_area_id ?? null;
        pAaChanged = true;
      }

      const pUpdatedRows = await tx
        .update(vocs)
        .set({ ...postponePatch, updatedAt: sql`NOW()` })
        .where(and(eq(vocs.id, vocId), eq(vocs.workspaceId, workspaceId)))
        .returning();
      const pUpdated = pUpdatedRows[0];
      if (!pUpdated) throw new HttpError('internal.unexpected', 'voc UPDATE returned no row');

      const pNewSev = pUpdated.severity as VocEnvelope['severity'];

      // Emit postpone audit first, then any accompanying field audits in order.
      await deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actor.actor_id,
        event_type: 'voc_triage_postponed',
        subject_type: 'voc',
        subject_id: vocId,
        summary: `VOC ${pUpdated.displayId} triage review postponed`,
        detail: { voc_id: vocId, actor_id: actor.actor_id },
      });
      if (pSeverityChanged) {
        await deps.auditService.record(tx, {
          workspace_id: workspaceId,
          actor_id: actor.actor_id,
          event_type: 'voc_severity_set',
          subject_type: 'voc',
          subject_id: vocId,
          summary: `VOC ${pUpdated.displayId} severity set to ${String(pNewSev)}`,
          detail: { voc_id: vocId, from: row.severity, to: pNewSev },
        });
      }
      if (pOwnerChanged) {
        await deps.auditService.record(tx, {
          workspace_id: workspaceId,
          actor_id: actor.actor_id,
          event_type: 'voc_owner_assigned',
          subject_type: 'voc',
          subject_id: vocId,
          summary: `VOC ${pUpdated.displayId} owner assigned`,
          detail: {
            voc_id: vocId,
            from: { user_id: row.ownerUserId, team_id: row.ownerTeamId },
            to: { user_id: pUpdated.ownerUserId, team_id: pUpdated.ownerTeamId },
          },
        });
      }
      if (pAaChanged) {
        await deps.auditService.record(tx, {
          workspace_id: workspaceId,
          actor_id: actor.actor_id,
          event_type: 'voc_analytics_area_linked',
          subject_type: 'voc',
          subject_id: vocId,
          summary: `VOC ${pUpdated.displayId} analytics area linked`,
          detail: { voc_id: vocId, from: row.analyticsAreaId, to: pUpdated.analyticsAreaId },
        });
      }

      const pLockedVoc = {
        id: pUpdated.id,
        workspaceId: pUpdated.workspaceId,
        primaryManagedSystemId: pUpdated.primaryManagedSystemId,
        analyticsAreaId: pUpdated.analyticsAreaId,
        reporterId: pUpdated.reporterId,
        displayId: pUpdated.displayId,
        title: pUpdated.title,
        descriptionRichContent: pUpdated.descriptionRichContent,
        severity: pNewSev,
        reporterFacingStatus: pUpdated.reporterFacingStatus,
        triageState: pUpdated.triageState as VocEnvelope['triage_state'],
        triageStateReviewPostponedAt: pUpdated.triageStateReviewPostponedAt,
        ownerUserId: pUpdated.ownerUserId,
        ownerTeamId: pUpdated.ownerTeamId,
        sourceContext: pUpdated.sourceContext,
        archivedAt: pUpdated.archivedAt,
        createdAt: pUpdated.createdAt,
        updatedAt: pUpdated.updatedAt,
      };
      const pNextStates = await nextReporterStates(pUpdated.reporterFacingStatus as ReporterFacingStatus, tx);
      return composeEnvelope(pLockedVoc, pNextStates);
    }

    // 7b. Standard diff path (no postpone_review).
    type VocPatch = {
      severity?: 'low' | 'medium' | 'high' | 'critical' | null;
      ownerUserId?: string | null;
      ownerTeamId?: string | null;
      analyticsAreaId?: string | null;
      triageState?: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
    };
    const patch: VocPatch = {};
    let severityChanged = false;
    let ownerChanged = false;
    let aaChanged = false;
    let triageStateChanged = false;

    if (input.severity !== undefined && input.severity !== row.severity) {
      patch.severity = input.severity;
      severityChanged = true;
    }

    // Owner fields treated as a unit.
    const newOwnerUser = input.owner_user_id !== undefined ? (input.owner_user_id ?? null) : row.ownerUserId;
    const newOwnerTeam = input.owner_team_id !== undefined ? (input.owner_team_id ?? null) : row.ownerTeamId;
    if (newOwnerUser !== row.ownerUserId || newOwnerTeam !== row.ownerTeamId) {
      patch.ownerUserId = newOwnerUser;
      patch.ownerTeamId = newOwnerTeam;
      ownerChanged = true;
    }

    if (input.analytics_area_id !== undefined && input.analytics_area_id !== row.analyticsAreaId) {
      patch.analyticsAreaId = input.analytics_area_id ?? null;
      aaChanged = true;
    }

    if (input.triage_state !== undefined && input.triage_state !== row.triageState) {
      patch.triageState = input.triage_state;
      triageStateChanged = true;
    }

    // 8. Empty diff — return current state without any writes.
    if (!severityChanged && !ownerChanged && !aaChanged && !triageStateChanged) {
      const nextStates = await nextReporterStates(row.reporterFacingStatus as ReporterFacingStatus, tx);
      return composeEnvelope(row, nextStates);
    }

    // 9. UPDATE the voc row.
    const updatedRows = await tx
      .update(vocs)
      .set({ ...patch, updatedAt: sql`NOW()` })
      .where(and(eq(vocs.id, vocId), eq(vocs.workspaceId, workspaceId)))
      .returning();
    const updated = updatedRows[0];
    if (!updated) throw new HttpError('internal.unexpected', 'voc UPDATE returned no row');

    const newSev = updated.severity as VocEnvelope['severity'];
    const newOwnerUser2 = updated.ownerUserId;
    const newOwnerTeam2 = updated.ownerTeamId;
    const newAa = updated.analyticsAreaId;
    const newTriageState = updated.triageState as VocEnvelope['triage_state'];

    // 10. Emit audit events in deterministic order (same tx).
    // a. voc_severity_set — emitted for any severity change including null
    //    (de-triage / severity-clear). Schema now accepts nullable `to`
    //    (F2 — vocSeveritySetDetailSchema widened).
    if (severityChanged) {
      await deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actor.actor_id,
        event_type: 'voc_severity_set',
        subject_type: 'voc',
        subject_id: vocId,
        summary: `VOC ${updated.displayId} severity set to ${String(newSev)}`,
        detail: { voc_id: vocId, from: row.severity, to: newSev },
      });
    }

    // b. voc_owner_assigned
    if (ownerChanged) {
      await deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actor.actor_id,
        event_type: 'voc_owner_assigned',
        subject_type: 'voc',
        subject_id: vocId,
        summary: `VOC ${updated.displayId} owner assigned`,
        detail: {
          voc_id: vocId,
          from: { user_id: row.ownerUserId, team_id: row.ownerTeamId },
          to: { user_id: newOwnerUser2, team_id: newOwnerTeam2 },
        },
      });
    }

    // c. voc_analytics_area_linked
    if (aaChanged) {
      await deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actor.actor_id,
        event_type: 'voc_analytics_area_linked',
        subject_type: 'voc',
        subject_id: vocId,
        summary: `VOC ${updated.displayId} analytics area linked`,
        detail: { voc_id: vocId, from: row.analyticsAreaId, to: newAa },
      });
    }

    // d. voc_triage_committed — only when transitioning untriaged → triaged.
    if (triageStateChanged && row.triageState === 'untriaged' && newTriageState === 'triaged') {
      await deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actor.actor_id,
        event_type: 'voc_triage_committed',
        subject_type: 'voc',
        subject_id: vocId,
        summary: `VOC ${updated.displayId} triage committed`,
        detail: {
          voc_id: vocId,
          severity: newSev,
          owner_user_id: newOwnerUser2,
          owner_team_id: newOwnerTeam2,
          analytics_area_id: newAa,
          cluster_decision: null,
        },
      });
    }

    // 11. Compose and return envelope with new row state (standard diff path).
    const updatedLockedVoc = {
      id: updated.id,
      workspaceId: updated.workspaceId,
      primaryManagedSystemId: updated.primaryManagedSystemId,
      analyticsAreaId: updated.analyticsAreaId,
      reporterId: updated.reporterId,
      displayId: updated.displayId,
      title: updated.title,
      descriptionRichContent: updated.descriptionRichContent,
      severity: newSev,
      reporterFacingStatus: updated.reporterFacingStatus,
      triageState: newTriageState,
      triageStateReviewPostponedAt: updated.triageStateReviewPostponedAt,
      ownerUserId: newOwnerUser2,
      ownerTeamId: newOwnerTeam2,
      sourceContext: updated.sourceContext,
      archivedAt: updated.archivedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
    const nextStates = await nextReporterStates(
      updated.reporterFacingStatus as ReporterFacingStatus,
      tx,
    );
    return composeEnvelope(updatedLockedVoc, nextStates);
  }

  function composeEnvelope(
    row: {
      id: string;
      displayId: string;
      workspaceId: string;
      primaryManagedSystemId: string;
      analyticsAreaId: string | null;
      reporterId: string;
      title: string;
      descriptionRichContent: unknown;
      severity: VocEnvelope['severity'];
      reporterFacingStatus: string;
      triageState: VocEnvelope['triage_state'];
      ownerUserId: string | null;
      ownerTeamId: string | null;
      sourceContext: string;
      createdAt: Date;
      updatedAt: Date;
    },
    nextStates: { allowed: ReporterFacingStatus[]; forbidden: Partial<Record<ReporterFacingStatus, string>> },
  ): VocEnvelope {
    return {
      id: row.id,
      display_id: row.displayId,
      workspace_id: row.workspaceId,
      primary_managed_system_id: row.primaryManagedSystemId,
      analytics_area_id: row.analyticsAreaId,
      reporter_id: row.reporterId,
      title: row.title,
      description_rich_content: row.descriptionRichContent,
      severity: row.severity,
      reporter_facing_status: row.reporterFacingStatus as ReporterFacingStatus,
      triage_state: row.triageState,
      owner_user_id: row.ownerUserId,
      owner_team_id: row.ownerTeamId,
      source_context: row.sourceContext,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      next_actions: [],
      next_reporter_states: nextStates,
      permission_decisions: {},
    };
  }

  return { createVoc, updateVoc };
}

export type VocService = ReturnType<typeof createVocService>;
