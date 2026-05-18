// apps/backend/src/modules/voc/read-service.ts
//
// Read application service for the VOC module.
// Owns view semantics, scope resolution orchestration, access-matrix decisions,
// and envelope assembly. No route handlers. No DB queries — everything goes
// through repo-read.ts (C1) + cursor.ts.
//
// Access matrix (codex BLOCKER fix):
//   msInReadScope || isReporter          → FULL envelope
//   !msInReadScope && !isReporter && msInEffectiveScope → SUMMARY envelope
//   !msInReadScope && !isReporter && !msInEffectiveScope → 404 not_found.record
//
// ETag (Slice 3): weak W/"<voc.updated_at-ISO>". Conversation tables immutable
// until #16 lands. TODO(#16): compose with max(conv.created_at) once #16 ships.

import { z } from 'zod';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { CheckService } from '../permissions/check-service.js';
import type {
  ConversationEntry,
  GetConversationQuery,
  ListVocsQuery,
  VocDetailEnvelope,
  VocListItem,
  VocSummaryEnvelope,
} from '@fops/shared';

import { decodeCursor, encodeCursor } from './cursor.js';
import type { ConversationRow, Scope, VocReadRow } from './repo-read.js';
import * as repoRead from './repo-read.js';
import { nextReporterStates, type ReporterFacingStatus } from './transitions.js';

// ── Public interface ─────────────────────────────────────────────────────────

export interface VocReadServiceDeps {
  db: Db;
  checkService: CheckService;
}

export interface ReadActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

// ── Inline conversation cursor (conversation-specific; separate from VOC list cursor) ──

interface ConversationCursor {
  createdAt: string;
  id: string;
}

function encodeConversationCursor(c: ConversationCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64');
}

// WHY (M5): zod schema validates cursor field types (not just presence) to
// prevent malformed UUID/datetime strings from reaching SQL and causing 500s.
// offset: true allows both Z and +HH:MM suffixes (postgres text → ISO conversion
// produces +00:00 which requires this option).
const conversationCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true, message: 'createdAt must be an ISO datetime' }),
  id: z.string().uuid({ message: 'id must be a UUID' }),
});

function decodeConversationCursor(raw: string): ConversationCursor {
  const fail = () =>
    new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  let json: string;
  try {
    json = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    throw fail();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw fail();
  }
  // WHY (M5): validate field types, not just presence — malformed dates/UUIDs
  // would reach SQL and cause 500 errors on the timestamptz/uuid casts.
  const result = conversationCursorSchema.safeParse(parsed);
  if (!result.success) {
    throw fail();
  }
  return result.data;
}

// ── Row mappers ──────────────────────────────────────────────────────────────

function mapRowToListItem(row: VocReadRow): VocListItem {
  return {
    id: row.id,
    display_id: row.displayId,
    title: row.title,
    primary_managed_system_id: row.primaryManagedSystemId,
    analytics_area_id: row.analyticsAreaId,
    reporter_id: row.reporterId,
    owner_user_id: row.ownerUserId,
    owner_team_id: row.ownerTeamId,
    severity: row.severity,
    reporter_facing_status: row.reporterFacingStatus as VocListItem['reporter_facing_status'],
    triage_state: row.triageState as VocListItem['triage_state'],
    source_context: row.sourceContext as VocListItem['source_context'],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    similar_count: 0,
  };
}

function mapConversationRow(row: ConversationRow): ConversationEntry {
  const entry: ConversationEntry = {
    id: row.id,
    kind: row.kind,
    actor_id: row.actorId,
    body_rich_content: row.bodyRichContent,
    created_at: row.createdAt.toISOString(),
    visibility: row.visibility,
  };
  if (row.kind === 'public_update') {
    entry.reporter_facing_status_before = row.reporterFacingStatusBefore;
    entry.reporter_facing_status_after = row.reporterFacingStatusAfter;
    entry.skip_public_update = row.skipPublicUpdate;
    entry.skip_reason = row.skipReason ?? null;
  }
  return entry;
}

// ── Scope helpers ────────────────────────────────────────────────────────────

function msInScope(scope: Scope, msId: string): boolean {
  if (scope.kind === 'all') return true;
  return scope.managedSystemIds.includes(msId);
}

function intersectScopes(a: Scope, b: Scope): Scope {
  if (a.kind === 'all' && b.kind === 'all') return { kind: 'all' };
  const aIds = a.kind === 'all' ? null : a.managedSystemIds;
  const bIds = b.kind === 'all' ? null : b.managedSystemIds;
  if (aIds === null && bIds !== null) return { kind: 'scoped', managedSystemIds: bIds };
  if (bIds === null && aIds !== null) return { kind: 'scoped', managedSystemIds: aIds };
  if (aIds !== null && bIds !== null) {
    const bSet = new Set(bIds);
    return { kind: 'scoped', managedSystemIds: aIds.filter((id) => bSet.has(id)) };
  }
  return { kind: 'all' };
}

// ── Service factory ──────────────────────────────────────────────────────────

export function createVocReadService(deps: VocReadServiceDeps) {
  // ── listVocs ───────────────────────────────────────────────────────────────

  async function listVocs(args: {
    actor: ReadActorContext;
    query: ListVocsQuery;
  }): Promise<{
    items: VocListItem[];
    page: { cursor?: string; has_more: boolean };
    out_of_scope_summary?: { count: number; severity_distribution: Record<string, number> };
  }> {
    const { actor, query } = args;
    const { view, managed_system_id, tab, limit } = query;
    const filterSeverity = query['filter.severity'];
    const filterReporterFacingStatus = query['filter.reporter_facing_status'];
    const filterOwner = query['filter.owner'];

    // ── 1. View=triage: reject query.sort (server-pinned sort) ──────────────
    if (view === 'triage' && query.sort !== undefined) {
      throw new HttpError('validation.failed', 'sort param not allowed for view=triage', {
        fields: [{ path: ['sort'], code: 'invalid' }],
      });
    }

    // ── 2. Tab filter cross-view validation ──────────────────────────────────
    if (tab === 'waiting' && view !== 'triage') {
      throw new HttpError('validation.failed', 'tab=waiting is only valid for view=triage', {
        fields: [{ path: ['tab'], code: 'invalid_for_view' }],
      });
    }

    // ── 3. Determine sort key and direction ──────────────────────────────────
    // For triage view, use internal 'triage_pinned' sort.
    // For other views, default to 'created_at:desc' if sort not specified.
    let sortKey: string;
    let sortDir: 'asc' | 'desc';

    if (view === 'triage') {
      sortKey = 'triage_pinned';
      sortDir = 'asc'; // triage_pinned uses ASC direction internally (it has its own multi-key sort)
    } else {
      const rawSort = query.sort ?? 'created_at:desc';
      // triage_pinned is not in the listVocsQuerySchema sort enum so this
    // branch is unreachable at runtime — guard kept for belt-and-suspenders.
      sortKey = rawSort;
      sortDir = rawSort.endsWith(':asc') ? 'asc' : 'desc';
    }

    // ── 4. Decode cursor ──────────────────────────────────────────────────────
    let decodedCursor: { sv: string | number; id: string } | undefined;
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor, sortKey, sortDir);
      decodedCursor = { sv: cursor.sv, id: cursor.id };
    }

    // ── 5. view=my: reject managed_system_id='all' ────────────────────────────
    if (view === 'my' && managed_system_id === 'all') {
      throw new HttpError('validation.failed', 'managed_system_id=all not allowed for view=my', {
        fields: [{ path: ['managed_system_id'], code: 'invalid' }],
      });
    }

    // ── 6. Resolve scopes (skip triageScope for non-triage views) ─────────────
    let readScope: Scope;
    let effectiveScope: Scope;
    let triageScope: Scope | undefined;

    if (view === 'triage') {
      [readScope, effectiveScope, triageScope] = await Promise.all([
        repoRead.actorReadScope(deps.db, actor),
        repoRead.actorEffectiveScope(deps.db, actor),
        repoRead.actorTriageScope(deps.db, actor),
      ]);
    } else {
      [readScope, effectiveScope] = await Promise.all([
        repoRead.actorReadScope(deps.db, actor),
        repoRead.actorEffectiveScope(deps.db, actor),
      ]);
    }

    // ── 7. View-specific scope validation + scope filter selection ─────────────
    let scopeFilter: Scope;
    let actorIdForMyFilter: string | undefined;

    if (view === 'my') {
      // No scope filter for 'my' view (reporter_id filter is applied in repo).
      // Allow managed_system_id=<uuid> narrowing.
      if (managed_system_id && managed_system_id !== 'all') {
        scopeFilter = { kind: 'scoped', managedSystemIds: [managed_system_id] };
      } else {
        scopeFilter = { kind: 'all' };
      }
      actorIdForMyFilter = actor.actor_id;
    } else if (view === 'inbox') {
      // Validate read scope is non-empty.
      if (readScope.kind === 'scoped' && readScope.managedSystemIds.length === 0) {
        if (actor.role_level === 'developer') {
          throw new HttpError(
            'permission.scope_required',
            'voc.read capability required; developer needs MS-scoped grant',
            {
              requiredScope: [],
              requestable_permission: {
                permission: 'voc.read',
                managed_system_id: null,
              },
            },
          );
        }
        throw new HttpError(
          'permission.denied',
          'no voc.read scope for actor',
          { reason: 'no_grant' },
        );
      }

      // managed_system_id narrowing for inbox view.
      if (managed_system_id && managed_system_id !== 'all') {
        // Must be in actor's read scope.
        if (!msInScope(readScope, managed_system_id)) {
          throw new HttpError(
            'permission.scope_required',
            'managed_system_id not in voc.read scope',
            {
              requiredScope: [managed_system_id],
              requestable_permission: {
                permission: 'voc.read',
                managed_system_id,
              },
            },
          );
        }
        scopeFilter = { kind: 'scoped', managedSystemIds: [managed_system_id] };
      } else {
        scopeFilter = readScope;
      }
    } else {
      // view === 'triage'
      const tScope = triageScope!;
      const intersected = intersectScopes(readScope, tScope);
      if (intersected.kind === 'scoped' && intersected.managedSystemIds.length === 0) {
        throw new HttpError(
          'permission.denied',
          'no voc.triage scope for actor',
          {
            requestable_permission: {
              permission: 'voc.triage',
              managed_system_id: null,
            },
          },
        );
      }

      // managed_system_id narrowing for triage view.
      if (managed_system_id && managed_system_id !== 'all') {
        if (!msInScope(intersected, managed_system_id)) {
          throw new HttpError(
            'permission.scope_required',
            'managed_system_id not in voc.triage scope',
            {
              requiredScope: [managed_system_id],
              requestable_permission: {
                permission: 'voc.triage',
                managed_system_id,
              },
            },
          );
        }
        scopeFilter = { kind: 'scoped', managedSystemIds: [managed_system_id] };
      } else {
        scopeFilter = intersected;
      }
    }

    // ── 8. Call repo ──────────────────────────────────────────────────────────
    const repoArgs: repoRead.ListVocsRepoArgs = {
      workspaceId: actor.workspace_id,
      scopeFilter,
      view,
      sort: sortKey as repoRead.ListVocsRepoArgs['sort'],
      limit,
    };
    if (actorIdForMyFilter !== undefined) repoArgs.actorIdForMyFilter = actorIdForMyFilter;
    if (tab !== undefined) repoArgs.tab = tab;
    if (filterSeverity !== undefined) repoArgs.filterSeverity = filterSeverity;
    if (filterReporterFacingStatus !== undefined) repoArgs.filterReporterFacingStatus = filterReporterFacingStatus;
    if (filterOwner !== undefined) repoArgs.filterOwner = filterOwner;
    if (decodedCursor !== undefined) repoArgs.cursor = decodedCursor;

    const { rows, hasMore, nextCursor: repoCursor } = await repoRead.listVocsForRead(deps.db, repoArgs);

    // ── 9. Map rows → VocListItem ──────────────────────────────────────────────
    const items = rows.map(mapRowToListItem);

    // ── 10. Encode nextCursor ──────────────────────────────────────────────────
    let nextCursorStr: string | undefined;
    if (hasMore && repoCursor) {
      nextCursorStr = encodeCursor({ s: sortKey, d: sortDir, sv: repoCursor.sv, id: repoCursor.id });
    }

    // ── 11. out_of_scope_summary (inbox only) ──────────────────────────────────
    let out_of_scope_summary: { count: number; severity_distribution: Record<string, number> } | undefined;
    if (view === 'inbox' && readScope.kind === 'scoped') {
      const summary = await repoRead.outOfScopeSummary(deps.db, {
        workspaceId: actor.workspace_id,
        effectiveScope,
        readScope,
      });
      if (summary !== null) {
        out_of_scope_summary = summary;
      }
    }

    const page: { cursor?: string; has_more: boolean } = { has_more: hasMore };
    if (nextCursorStr !== undefined) page.cursor = nextCursorStr;

    return {
      items,
      page,
      ...(out_of_scope_summary !== undefined ? { out_of_scope_summary } : {}),
    };
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

    // ── 1. Fetch VOC ────────────────────────────────────────────────────────
    const row = await repoRead.selectVocByIdForRead(deps.db, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'VOC not found');

    // ── 2. Resolve scopes in parallel ───────────────────────────────────────
    const [readScope, effectiveScope, triageScope] = await Promise.all([
      repoRead.actorReadScope(deps.db, actor),
      repoRead.actorEffectiveScope(deps.db, actor),
      repoRead.actorTriageScope(deps.db, actor),
    ]);

    // ── 3. Compute access flags ──────────────────────────────────────────────
    const isReporter = row.reporterId === actor.actor_id;
    const primaryMs = row.primaryManagedSystemId;
    const msInReadScope = msInScope(readScope, primaryMs);
    const msInEffectiveScope = msInScope(effectiveScope, primaryMs);
    const canTriage = msInScope(triageScope, primaryMs);

    // ── 4. Access matrix ─────────────────────────────────────────────────────
    const etag = `W/"${row.updatedAt.toISOString()}"`;

    if (!msInReadScope && !isReporter && !msInEffectiveScope) {
      // 404 to prevent existence probe.
      throw new HttpError('not_found.record', 'VOC not found');
    }

    if (!msInReadScope && !isReporter && msInEffectiveScope) {
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

    const conversationTimeline = convResult.entries.map(mapConversationRow);
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
      analytics_area_id: row.analyticsAreaId,
      reporter_id: row.reporterId,
      owner_user_id: row.ownerUserId,
      owner_team_id: row.ownerTeamId,
      severity: row.severity,
      reporter_facing_status: row.reporterFacingStatus as VocDetailEnvelope['reporter_facing_status'],
      triage_state: row.triageState as VocDetailEnvelope['triage_state'],
      source_context: row.sourceContext as VocDetailEnvelope['source_context'],
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      similar_count: 0,
      description_rich_content: row.descriptionRichContent,
      next_actions: [],
      next_reporter_states: {
        allowed: nextStates.allowed,
        forbidden: nextStates.forbidden as Record<VocDetailEnvelope['reporter_facing_status'], string>,
      },
      linked_execution: { findingRef: null, taskRef: null },
      conversation_timeline: conversationTimeline,
      // conversation_page.cursor uses exactOptionalPropertyTypes: build without key when absent.
      conversation_page: convNextCursor !== undefined
        ? { cursor: convNextCursor, has_more: convResult.hasMore }
        : { has_more: convResult.hasMore },
      permission_decisions: permissionDecisions,
    };

    return { kind: 'full', envelope, etag };
  }

  // ── getConversation ───────────────────────────────────────────────────────

  async function getConversation(args: {
    actor: ReadActorContext;
    vocId: string;
    query: GetConversationQuery;
  }): Promise<{ items: ConversationEntry[]; page: { cursor?: string; has_more: boolean } }> {
    const { actor, vocId, query } = args;

    // ── 1. Fetch VOC (access matrix check) ──────────────────────────────────
    const row = await repoRead.selectVocByIdForRead(deps.db, actor.workspace_id, vocId);
    if (!row) throw new HttpError('not_found.record', 'VOC not found');

    // ── 2. Resolve scopes in parallel ───────────────────────────────────────
    const [readScope, effectiveScope, triageScope] = await Promise.all([
      repoRead.actorReadScope(deps.db, actor),
      repoRead.actorEffectiveScope(deps.db, actor),
      repoRead.actorTriageScope(deps.db, actor),
    ]);

    // ── 3. Compute access flags ──────────────────────────────────────────────
    const isReporter = row.reporterId === actor.actor_id;
    const primaryMs = row.primaryManagedSystemId;
    const msInReadScope = msInScope(readScope, primaryMs);
    const msInEffectiveScope = msInScope(effectiveScope, primaryMs);
    const canTriage = msInScope(triageScope, primaryMs);

    // ── 4. Access matrix ─────────────────────────────────────────────────────
    if (!msInReadScope && !isReporter && !msInEffectiveScope) {
      // 404 to prevent existence probe.
      throw new HttpError('not_found.record', 'VOC not found');
    }

    if (!msInReadScope && !isReporter && msInEffectiveScope) {
      // Summary-territory actors don't get conversation access.
      throw new HttpError('permission.denied', 'conversation not available without voc.read scope');
    }

    // ── 5. Decode conversation cursor ────────────────────────────────────────
    const decodedConvCursor = decodeConversationCursor(query.cursor);

    // ── 6. Fetch conversation page ────────────────────────────────────────────
    const convArgs: repoRead.SelectConversationPageArgs = {
      workspaceId: actor.workspace_id,
      vocId,
      actorId: actor.actor_id,
      canTriage,
      isReporter,
      cursor: decodedConvCursor,
      limit: query.limit,
    };
    if (query.kind !== undefined) convArgs.kind = query.kind;

    const convResult = await repoRead.selectConversationPage(deps.db, convArgs);

    const items = convResult.entries.map(mapConversationRow);

    let nextCursorStr: string | undefined;
    if (convResult.hasMore && convResult.nextCursor) {
      nextCursorStr = encodeConversationCursor(convResult.nextCursor);
    }

    const convPage: { cursor?: string; has_more: boolean } = { has_more: convResult.hasMore };
    if (nextCursorStr !== undefined) convPage.cursor = nextCursorStr;

    return { items, page: convPage };
  }

  return { listVocs, getVocDetail, getConversation };
}

export type VocReadService = ReturnType<typeof createVocReadService>;
