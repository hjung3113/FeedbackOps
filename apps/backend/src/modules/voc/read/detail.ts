// VOC detail read and post-write envelope assembly.
import type { VocDetailEnvelope, VocSummaryEnvelope } from '@fops/shared';
import type { Tx } from '../../../db/tx.js';
import { HttpError } from '../../../lib/errors.js';
import {
  actorEffectiveScope,
  actorReadScope,
  actorTriageScope,
} from '../authorization.js';
import * as repoRead from '../repo-read.js';
import type { ReadActorContext, VocReadServiceDeps } from '../read-service.js';
import { type ReporterFacingStatus, nextReporterStates } from '../transitions.js';
import { encodeConversationCursor } from './cursor.js';
import {
  mapAttachmentRow,
  mapConversationRowsWithAttachments,
  mapSimilarItems,
} from './mappers.js';
import { msInScope } from './scope.js';

export function createVocDetailReaders(deps: VocReadServiceDeps) {
  // ── resolveVocAccess ──────────────────────────────────────────────────────
  //
  // The ONE VOC read-authority decision (fetch + scopes + access matrix),
  // shared by getVocDetail and resolveVocReference so a Task-detail reference
  // can never disagree with the VOC detail read. Throws `not_found.record` when
  // the actor may not see the VOC at all (existence is not revealed).

  async function resolveVocAccess(args: { actor: ReadActorContext; vocId: string }) {
    const { actor, vocId } = args;

    // ── 1. Fetch VOC ────────────────────────────────────────────────────────
    const row = await repoRead.selectVocByIdForRead(deps.db, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'VOC not found');

    // ── 2. Resolve scopes in parallel ───────────────────────────────────────
    const [readScope, effectiveScope, triageScope] = await Promise.all([
      actorReadScope(deps.db, actor),
      actorEffectiveScope(deps.db, actor),
      actorTriageScope(deps.db, actor),
    ]);

    // ── 3. Compute access flags ──────────────────────────────────────────────
    const isReporter = row.reporterId === actor.actor_id;
    const primaryMs = row.primaryManagedSystemId;
    const msInReadScope = msInScope(readScope, primaryMs);
    const msInEffectiveScope = msInScope(effectiveScope, primaryMs);
    const canTriage = msInScope(triageScope, primaryMs);
    const isReporterArm = isReporter && !msInReadScope && !canTriage;

    // ── 4. Access matrix ─────────────────────────────────────────────────────
    const etag = `W/"${row.updatedAt.toISOString()}"`;

    if (!msInReadScope && !isReporter && !msInEffectiveScope) {
      // 404 to prevent existence probe.
      throw new HttpError('not_found.record', 'VOC not found');
    }

    const kind: 'full' | 'summary' =
      !msInReadScope && !isReporter && msInEffectiveScope ? 'summary' : 'full';

    return { kind, row, readScope, canTriage, isReporter, isReporterArm, primaryMs, etag };
  }
  // ── getVocDetail ──────────────────────────────────────────────────────────

  async function getVocDetail(args: {
    actor: ReadActorContext;
    vocId: string;
  }): Promise<
    | { kind: 'full'; envelope: VocDetailEnvelope; etag: string }
    | { kind: 'summary'; envelope: VocSummaryEnvelope; etag: string }
  > {
    const { actor, vocId } = args;

    const { kind, row, readScope, canTriage, isReporter, isReporterArm, primaryMs, etag } =
      await resolveVocAccess({ actor, vocId });

    if (kind === 'summary') {
      // ── SUMMARY path ────────────────────────────────────────────────────
      const decision = await deps.checkService.checkCapability(
        { actor_id: actor.actor_id, workspace_id: actor.workspace_id, role_level: actor.role_level },
        'voc.read',
        { workspace_id: actor.workspace_id, managed_system_id: primaryMs },
      );

      let selfDecision: Record<string, unknown>;
      if (!decision.allow && decision.reason === 'no_grant') {
        selfDecision = {
          state: 'request_access',
          requestable_permission: {
            permission: 'voc.read',
            managed_system_id: primaryMs,
            reason_required: false,
          },
        };
      } else if (!decision.allow) {
        selfDecision = {
          state: 'blocked_not_requestable',
          reason: decision.reason,
        };
      } else {
        // Should not reach here (actor has read access → msInReadScope would be true).
        // Guard: treat as blocked to avoid data leak.
        selfDecision = { state: 'blocked_not_requestable', reason: 'unknown' };
      }

      const envelope: VocSummaryEnvelope = {
        id: row.id,
        display_id: row.displayId,
        primary_managed_system_id: primaryMs,
        reporter_facing_status: row.reporterFacingStatus as VocSummaryEnvelope['reporter_facing_status'],
        created_at: row.createdAt.toISOString(),
        permission_decisions: { _self: selfDecision },
      };

      return { kind: 'summary', envelope, etag };
    }

    // ── FULL path (msInReadScope || isReporter) ────────────────────────────

    // ── 5. Load inline conversation (first 50 entries) ───────────────────────
    const convResult = await repoRead.selectConversationPage(deps.db, {
      workspaceId: actor.workspace_id,
      vocId,
      actorId: actor.actor_id,
      canTriage,
      isReporter,
      limit: 50,
    });

    // ── 5b. PLAN-22 §Bug-1: VOC-body attachments + per-comment attachments ──
    // Fetched in parallel — one query for VOC-body attachments, one bulk
    // query for ALL inline comment-attached rows (no N+1).
    const commentIds = convResult.entries.map((e) => e.id);
    const [vocAttRows, commentAttachmentsMap, similarCount, similarItems] = await Promise.all([
      repoRead.selectVocAttachments(deps.db, actor.workspace_id, vocId),
      repoRead.selectAttachmentsForComments(deps.db, actor.workspace_id, commentIds),
      repoRead.selectSimilarVocCount(deps.db, {
        workspaceId: actor.workspace_id,
        sourceVocId: vocId,
        primaryManagedSystemId: primaryMs,
        actorId: actor.actor_id,
        readScope,
      }),
      repoRead.selectSimilarVocItems(deps.db, {
        workspaceId: actor.workspace_id,
        sourceVocId: vocId,
        primaryManagedSystemId: primaryMs,
        actorId: actor.actor_id,
        readScope,
      }),
    ]);
    const links = await deps.entityLinksService.listLinks({
      actor,
      endpoint: { type: 'voc', id: vocId },
    });

    const conversationTimeline = mapConversationRowsWithAttachments(
      convResult.entries,
      commentAttachmentsMap,
    );
    let convNextCursor: string | undefined;
    if (convResult.hasMore && convResult.nextCursor) {
      convNextCursor = encodeConversationCursor(convResult.nextCursor);
    }

    // ── 6. Next reporter states ──────────────────────────────────────────────
    const nextStates = await nextReporterStates(
      row.reporterFacingStatus as ReporterFacingStatus,
      deps.db,
    );

    // ── 7. Permission decisions seed ─────────────────────────────────────────
    const permissionDecisionsSeed = await repoRead.selectPermissionDecisionsSeed(deps.db, actor.workspace_id, vocId);

    const permissionDecisions: Record<string, unknown> =
      permissionDecisionsSeed !== null && typeof permissionDecisionsSeed === 'object'
        ? (permissionDecisionsSeed as Record<string, unknown>)
        : {};

    // ── 8. Compose full envelope ─────────────────────────────────────────────
    const envelope: VocDetailEnvelope = {
      id: row.id,
      display_id: row.displayId,
      title: row.title,
      primary_managed_system_id: primaryMs,
      reporter_id: row.reporterId,
      severity: row.severity,
      reporter_facing_status: row.reporterFacingStatus as VocDetailEnvelope['reporter_facing_status'],
      triage_state: row.triageState as VocDetailEnvelope['triage_state'],
      source_context: row.sourceContext as VocDetailEnvelope['source_context'],
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      ...(!isReporterArm
        ? {
            analytics_area_id: row.analyticsAreaId,
            owner_user_id: row.ownerUserId,
            owner_team_id: row.ownerTeamId,
            similar_count: similarCount,
            similar: mapSimilarItems(similarItems),
          }
        : {}),
      // PLAN-22 §Bug-1: detail row also carries attachment_count (matches the
      // shared schema which extends vocListItemSchema).
      attachment_count: vocAttRows.length,
      description_rich_content: row.descriptionRichContent,
      next_actions: [],
      next_reporter_states: {
        allowed: nextStates.allowed,
        forbidden: nextStates.forbidden as Record<VocDetailEnvelope['reporter_facing_status'], string>,
      },
      linked_execution: { findingRef: null, taskRef: null },
      links,
      conversation_timeline: conversationTimeline,
      // conversation_page.cursor uses exactOptionalPropertyTypes: build without key when absent.
      conversation_page: convNextCursor !== undefined
        ? { cursor: convNextCursor, has_more: convResult.hasMore }
        : { has_more: convResult.hasMore },
      permission_decisions: permissionDecisions,
      // PLAN-22 §Bug-1: VOC-body linked attachments.
      attachments: vocAttRows.map(mapAttachmentRow),
    };

    return { kind: 'full', envelope, etag };
  }
  // ── composeDetailEnvelope ─────────────────────────────────────────────────
  // Post-write envelope refresh used by conversation-service (C3/#16).
  // Caller owns the transaction and is already authorised to act on the VOC —
  // access-matrix checks are intentionally skipped here; this path is NOT a
  // read entry-point for unauthenticated actors.
  //
  // Uses the supplied `tx` so the returned envelope reflects writes made in
  // the same transaction (e.g. status change, new conversation row).
  //
  // canTriage is derived from the actor's triage scope inside the tx so the
  // conversation visibility filter stays accurate post-write.

  async function composeDetailEnvelope(args: {
    tx: Tx;
    actor: ReadActorContext;
    vocId: string;
  }): Promise<VocDetailEnvelope> {
    const { tx, actor, vocId } = args;

    // Fetch the (possibly just-updated) VOC row inside the tx.
    const row = await repoRead.selectVocByIdForRead(tx, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'VOC not found after write');

    const primaryMs = row.primaryManagedSystemId;
    const isReporter = row.reporterId === actor.actor_id;

    // Resolve triage scope inside the tx (permissions may have changed if this
    // is ever used post-grant; belt-and-suspenders).
    const [triageScope, readScope] = await Promise.all([
      actorTriageScope(tx, actor),
      actorReadScope(tx, actor),
    ]);
    const canTriage = msInScope(triageScope, primaryMs);
    const isReporterArm = isReporter && !msInScope(readScope, primaryMs) && !canTriage;

    // Inline conversation (first 50 entries).
    const convResult = await repoRead.selectConversationPage(tx, {
      workspaceId: actor.workspace_id,
      vocId,
      actorId: actor.actor_id,
      canTriage,
      isReporter,
      limit: 50,
    });

    // PLAN-22 §Bug-1: VOC-body + per-comment attachments, hydrated inside tx
    // so the post-write envelope reflects link rows written in the same tx
    // (e.g. a public_update that just attached files).
    const commentIds = convResult.entries.map((e) => e.id);
    const [vocAttRows, commentAttachmentsMap, similarCount, similarItems] = await Promise.all([
      repoRead.selectVocAttachments(tx, actor.workspace_id, vocId),
      repoRead.selectAttachmentsForComments(tx, actor.workspace_id, commentIds),
      repoRead.selectSimilarVocCount(tx, {
        workspaceId: actor.workspace_id,
        sourceVocId: vocId,
        primaryManagedSystemId: primaryMs,
        actorId: actor.actor_id,
        readScope,
      }),
      repoRead.selectSimilarVocItems(tx, {
        workspaceId: actor.workspace_id,
        sourceVocId: vocId,
        primaryManagedSystemId: primaryMs,
        actorId: actor.actor_id,
        readScope,
      }),
    ]);
    // ADR-0047: listLinks is the single read authority on the focus VOC
    // (voc.read deny-first, or reporter). This post-write path also serves
    // triage-only writers (e.g. public updates), so an unreadable focus must
    // yield no links rather than 404-ing the write's response envelope —
    // duplicating the read check here would fork the authority (repo-read's
    // admin 'all' scope ignores explicit voc.read denies; listLinks does not).
    const links = await deps.entityLinksService.listLinks({
      actor,
      endpoint: { type: 'voc', id: vocId },
      onUnreadableFocus: 'empty',
    });

    const conversationTimeline = mapConversationRowsWithAttachments(
      convResult.entries,
      commentAttachmentsMap,
    );
    let convNextCursor: string | undefined;
    if (convResult.hasMore && convResult.nextCursor) {
      convNextCursor = encodeConversationCursor(convResult.nextCursor);
    }

    // Next reporter states.
    const nextStates = await nextReporterStates(
      row.reporterFacingStatus as ReporterFacingStatus,
      tx,
    );

    // Permission decisions seed.
    const permissionDecisionsSeed = await repoRead.selectPermissionDecisionsSeed(tx, actor.workspace_id, vocId);
    const permissionDecisions: Record<string, unknown> =
      permissionDecisionsSeed !== null && typeof permissionDecisionsSeed === 'object'
        ? (permissionDecisionsSeed as Record<string, unknown>)
        : {};

    return {
      id: row.id,
      display_id: row.displayId,
      title: row.title,
      primary_managed_system_id: primaryMs,
      reporter_id: row.reporterId,
      severity: row.severity,
      reporter_facing_status: row.reporterFacingStatus as VocDetailEnvelope['reporter_facing_status'],
      triage_state: row.triageState as VocDetailEnvelope['triage_state'],
      source_context: row.sourceContext as VocDetailEnvelope['source_context'],
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      ...(!isReporterArm
        ? {
            analytics_area_id: row.analyticsAreaId,
            owner_user_id: row.ownerUserId,
            owner_team_id: row.ownerTeamId,
            similar_count: similarCount,
            similar: mapSimilarItems(similarItems),
          }
        : {}),
      attachment_count: vocAttRows.length,
      description_rich_content: row.descriptionRichContent,
      next_actions: [],
      next_reporter_states: {
        allowed: nextStates.allowed,
        forbidden: nextStates.forbidden as Record<VocDetailEnvelope['reporter_facing_status'], string>,
      },
      linked_execution: { findingRef: null, taskRef: null },
      links,
      conversation_timeline: conversationTimeline,
      conversation_page: convNextCursor !== undefined
        ? { cursor: convNextCursor, has_more: convResult.hasMore }
        : { has_more: convResult.hasMore },
      permission_decisions: permissionDecisions,
      attachments: vocAttRows.map(mapAttachmentRow),
    };
  }
  return { resolveVocAccess, getVocDetail, composeDetailEnvelope };
}
