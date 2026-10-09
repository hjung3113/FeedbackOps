// VOC triage update command and its idempotent entry point.
import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import type { PatchVocRequest } from '@fops/shared';
import { vocs } from '../../../db/schema/voc.js';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import { assertActiveAnalyticsAreaForManagedSystem } from '../../analytics-areas/index.js';
import { listWorkspaceAdminActorIds } from '../../auth/index.js';
import type { RoleLevel } from '../../auth/session-service.js';
import { runIdempotentCommand } from '../../core/idempotency/idempotent-command.js';
import { lockManagedSystem } from '../../managed-systems/index.js';
import { isRequestableDenial } from '../../permissions/index.js';
import { selectVocForUpdate } from '../repo.js';
import type { VocEnvelope, VocServiceDeps } from '../service.js';
import { type ReporterFacingStatus, nextReporterStates } from '../transitions.js';
import { composeEnvelope } from './compose-envelope.js';

export function createVocUpdateTriageCommands(deps: VocServiceDeps) {
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

    // 2. Permission re-check inside the tx (ADR-0019 Section D).
    // C3: permission check MUST fire before the If-Match comparison. The
    // previous ordering (stale_write before permission deny) leaked
    // `current_updated_at` of any in-workspace VOC to actors without
    // `voc.triage` grant — an activity-frequency probe vector. The check
    // only needs `row.primaryManagedSystemId`, which is available after the
    // FOR UPDATE above. Moving it here ensures unauthorised actors receive
    // 403 regardless of the If-Match value they supply.
    const decision = await deps.checkService.checkCapability(
      { actor_id: actor.actor_id, workspace_id: workspaceId, role_level: actor.role_level },
      'voc.triage',
      { workspace_id: workspaceId, managed_system_id: row.primaryManagedSystemId },
      { tx },
    );
    if (decision.allow !== true) {
      // F1: `no_grant`, `grant_revoked`, and `grant_expired` map to
      // `permission.scope_required` for developers (ADR-0061 §6).
      // Explicit deny and workspace mismatch remain denied.
      if (isRequestableDenial(decision.reason) && actor.role_level === 'developer') {
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
      // Explicit deny, workspace mismatch, and non-developer denials stay generic.
      throw new HttpError('permission.denied', `voc.triage denied: ${decision.reason}`, {
        reason: decision.reason,
      });
    }

    // 3. Optimistic concurrency check (after permission — C3: no current_updated_at
    // leak to unauthorised actors; only authorised actors see 409 stale_write detail).
    if (row.updatedAt.toISOString() !== ifMatch) {
      throw new HttpError('conflict.stale_write', 'voc updated_at does not match If-Match', {
        current_updated_at: row.updatedAt.toISOString(),
      });
    }

    // 4. FOR UPDATE lock on parent Managed System.
    const ms = await lockManagedSystem(tx, workspaceId, row.primaryManagedSystemId);
    if (!ms) throw new HttpError('not_found.record', 'managed system not found');
    if (ms.archived_at !== null) {
      throw new HttpError('conflict.parent_archived', 'parent managed system is archived', {
        fields: [{ path: ['primary_managed_system_id'], code: 'parent_archived' }],
      });
    }

    // 5. Analytics area cross-scope guard (only when supplied and non-null and changed).
    if (
      input.analytics_area_id !== undefined &&
      input.analytics_area_id !== null &&
      input.analytics_area_id !== row.analyticsAreaId
    ) {
      await assertActiveAnalyticsAreaForManagedSystem(
        tx,
        workspaceId,
        row.primaryManagedSystemId,
        input.analytics_area_id,
      );
    }

    // 6. Mutex: both owner fields non-null simultaneously (belt-and-suspenders;
    //    patchVocRequestSchema refine already catches this in the route layer).
    if (input.owner_user_id != null && input.owner_team_id != null) {
      throw new HttpError(
        'validation.failed',
        'owner_user_id and owner_team_id are mutually exclusive',
        {
          fields: [{ path: ['owner_team_id'], code: 'invalid' }],
        },
      );
    }
    if (input.postpone_review !== undefined && input.triage_state !== undefined) {
      throw new HttpError(
        'validation.failed',
        'postpone_review and triage_state cannot be set together',
        {
          fields: [{ path: ['postpone_review'], code: 'invalid' }],
        },
      );
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
        throw new HttpError('validation.failed', 'postpone_review only applies to untriaged VOCs', {
          fields: [{ path: ['postpone_review'], code: 'invalid_state' }],
        });
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
      const pNewOwnerUser =
        input.owner_user_id !== undefined ? (input.owner_user_id ?? null) : row.ownerUserId;
      const pNewOwnerTeam =
        input.owner_team_id !== undefined ? (input.owner_team_id ?? null) : row.ownerTeamId;
      // C2: the input-level mutex (step 6 above) only catches the case where
      // both owner fields are present in the payload. But if the row already
      // has one owner set and the client sends only the OTHER owner, the
      // resolved values end up both non-null → DB CHECK violation → 500.
      // Check the resolved pair here so the rejection is a clean 422.
      if (pNewOwnerUser != null && pNewOwnerTeam != null) {
        throw new HttpError(
          'validation.failed',
          'cannot have both owner_user_id and owner_team_id set; explicitly clear the other owner in the same PATCH',
          {
            fields: [{ path: ['owner_team_id'], code: 'invalid' }],
          },
        );
      }
      if (pNewOwnerUser !== row.ownerUserId || pNewOwnerTeam !== row.ownerTeamId) {
        postponePatch.ownerUserId = pNewOwnerUser;
        postponePatch.ownerTeamId = pNewOwnerTeam;
        pOwnerChanged = true;
      }
      if (
        input.analytics_area_id !== undefined &&
        input.analytics_area_id !== row.analyticsAreaId
      ) {
        postponePatch.analyticsAreaId = input.analytics_area_id ?? null;
        pAaChanged = true;
      }

      // WHY: The UPDATE is unconditional in the postpone path — no empty-diff
      // short-circuit. Each `postpone_review: true` call IS a distinct triage
      // deferral event; a second click by the user deserves its own audit row
      // and a fresh `triage_state_review_postponed_at`. (F14)
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
        if (pNewSev === 'high' || pNewSev === 'critical') {
          const adminActorIds = await listWorkspaceAdminActorIds(tx, workspaceId);
          const actorIds = pUpdated.ownerUserId
            ? [...new Set([pUpdated.ownerUserId, ...adminActorIds])]
            : adminActorIds;
          await deps.notify(tx, 'voc.severity_set_high_or_critical', {
            workspace_id: workspaceId,
            actor_ids: actorIds,
            subject_id: vocId,
            correlation_id: randomUUID(),
            detail: {
              voc_id: vocId,
              primary_managed_system_id: pUpdated.primaryManagedSystemId,
            },
            params: { severity: pNewSev },
          });
        }
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
        if (pUpdated.ownerUserId) {
          await deps.notify(tx, 'voc.assigned_to_me', {
            workspace_id: workspaceId,
            actor_ids: [pUpdated.ownerUserId],
            subject_id: vocId,
            correlation_id: randomUUID(),
            detail: {
              voc_id: vocId,
              primary_managed_system_id: pUpdated.primaryManagedSystemId,
            },
            params: {},
          });
        }
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
      const pNextStates = await nextReporterStates(
        pUpdated.reporterFacingStatus as ReporterFacingStatus,
        tx,
      );
      return composeEnvelope(pLockedVoc, pNextStates);
    }

    // 7b. Standard diff path. `postpone_review: false` is handled here.
    type VocPatch = {
      severity?: 'low' | 'medium' | 'high' | 'critical' | null;
      ownerUserId?: string | null;
      ownerTeamId?: string | null;
      analyticsAreaId?: string | null;
      triageState?: 'untriaged' | 'triaged' | 'needs_more_information' | 'dismissed_not_actionable';
      triageStateReviewPostponedAt?: null;
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
    const newOwnerUser =
      input.owner_user_id !== undefined ? (input.owner_user_id ?? null) : row.ownerUserId;
    const newOwnerTeam =
      input.owner_team_id !== undefined ? (input.owner_team_id ?? null) : row.ownerTeamId;
    // C2: resolved-value mutex — catches the case where the row already has
    // one owner and the client sends only the other without clearing the first.
    // The input-level mutex (step 6) only fires when both fields appear in the
    // payload; this guard fires on the resolved (input ?? row) pair.
    if (newOwnerUser != null && newOwnerTeam != null) {
      throw new HttpError(
        'validation.failed',
        'cannot have both owner_user_id and owner_team_id set; explicitly clear the other owner in the same PATCH',
        {
          fields: [{ path: ['owner_team_id'], code: 'invalid' }],
        },
      );
    }
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
      // C5: when transitioning AWAY from untriaged, clear the postponed_at
      // timestamp so the column doesn't carry a stale "postponed since X" value
      // on a row that is now triaged/dismissed/NMI. Future readers (BI, audit
      // reconstruction) would otherwise incorrectly interpret the row as
      // currently postponed.
      if (input.triage_state !== 'untriaged') {
        patch.triageStateReviewPostponedAt = null;
      }
    }

    // `postpone_review: false` clears a postponed untriaged review. On a VOC
    // that is not postponed the flag does not touch the timestamp and writes
    // no audit row; other fields in this request still apply above.
    const clearingPostpone =
      input.postpone_review === false &&
      row.triageState === 'untriaged' &&
      row.triageStateReviewPostponedAt !== null;
    if (clearingPostpone) {
      patch.triageStateReviewPostponedAt = null;
    }

    // 8. Empty diff — return current state without any writes.
    if (
      !severityChanged &&
      !ownerChanged &&
      !aaChanged &&
      !triageStateChanged &&
      !clearingPostpone
    ) {
      const nextStates = await nextReporterStates(
        row.reporterFacingStatus as ReporterFacingStatus,
        tx,
      );
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
    // a0. voc_triage_postpone_cleared — first, mirroring voc_triage_postponed.
    if (clearingPostpone) {
      await deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actor.actor_id,
        event_type: 'voc_triage_postpone_cleared',
        subject_type: 'voc',
        subject_id: vocId,
        summary: `VOC ${updated.displayId} triage review postpone cleared`,
        detail: { voc_id: vocId, actor_id: actor.actor_id },
      });
    }

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
      if (newSev === 'high' || newSev === 'critical') {
        const adminActorIds = await listWorkspaceAdminActorIds(tx, workspaceId);
        const actorIds = updated.ownerUserId
          ? [...new Set([updated.ownerUserId, ...adminActorIds])]
          : adminActorIds;
        await deps.notify(tx, 'voc.severity_set_high_or_critical', {
          workspace_id: workspaceId,
          actor_ids: actorIds,
          subject_id: vocId,
          correlation_id: randomUUID(),
          detail: {
            voc_id: vocId,
            primary_managed_system_id: updated.primaryManagedSystemId,
          },
          params: { severity: newSev },
        });
      }
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
      if (updated.ownerUserId) {
        await deps.notify(tx, 'voc.assigned_to_me', {
          workspace_id: workspaceId,
          actor_ids: [updated.ownerUserId],
          subject_id: vocId,
          correlation_id: randomUUID(),
          detail: {
            voc_id: vocId,
            primary_managed_system_id: updated.primaryManagedSystemId,
          },
          params: {},
        });
      }
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
    // WHY: The spec reads "initial triage commit" — NMI → triaged and
    // dismissed_not_actionable → triaged do NOT re-fire this event. If spec
    // later clarifies re-triage must emit commit, add `|| row.triageState ===
    // 'needs_more_information'` here. (F19)
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
  async function updateVocCommand(args: {
    actor: { actor_id: string; workspace_id: string; role_level: RoleLevel };
    vocId: string;
    ifMatch: string;
    input: PatchVocRequest;
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
      work: (tx) => updateVoc({ tx, actor, vocId, ifMatch, input }),
    });
  }
  return { updateVoc, updateVocCommand };
}
