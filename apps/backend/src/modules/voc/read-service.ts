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
// ETag header: weak W/"<voc.updated_at-ISO>". ADR-0031 disables conditional
// detail 304 responses because similarity is peer-derived.

import { z } from 'zod';

import type {
  ConversationEntry,
  GetConversationQuery,
  LinkedAttachment,
  ListVocsQuery,
  VocDetailEnvelope,
  VocListItem,
  VocSummaryEnvelope,
} from '@fops/shared';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { EntityLinksService } from '../entity-links/index.js';
import type { CheckService } from '../permissions/check-service.js';

import { decodeCursor, encodeCursor } from './cursor.js';
import type { ConversationRow, Scope, VocReadRow } from './repo-read.js';
import * as repoRead from './repo-read.js';
import { type ReporterFacingStatus, nextReporterStates } from './transitions.js';

// ── Public interface ─────────────────────────────────────────────────────────

export interface VocReadServiceDeps {
  db: Db;
  checkService: CheckService;
  entityLinksService: EntityLinksService;
}

export interface ReadActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

/** Count queries use the same predicates as the list, without list-only fields. */
export type CountVocsQuery = Pick<
  ListVocsQuery,
  | 'view'
  | 'managed_system_id'
  | 'tab'
  | 'filter.severity'
  | 'filter.reporter_facing_status'
  | 'filter.owner'
>;

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

function mapRowToListItem(row: VocReadRow, attachmentCount = 0, similarCount = 0): VocListItem {
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
    similar_count: similarCount,
    // PLAN-22 §Bug-1: populated by listVocs via bulk subquery.
    attachment_count: attachmentCount,
  };
}

function mapSimilarItems(items: repoRead.SimilarVocReadItem[]): VocDetailEnvelope['similar'] {
  return {
    items: items.map((item) => ({
      id: item.id,
      display_id: item.displayId,
      title: item.title,
      reporter_facing_status: item.reporterFacingStatus as VocDetailEnvelope['reporter_facing_status'],
      severity: item.severity,
    })),
  };
}

// PLAN-22 §Bug-1: read-row → wire-shape mapper for linked attachments.
function mapAttachmentRow(row: import('./repo-read.js').LinkedAttachmentReadRow): LinkedAttachment {
  return {
    id: row.id,
    name: row.name,
    size_bytes: row.size_bytes,
    mime_type: row.mime_type,
    uploaded_by_actor_id: row.uploaded_by_actor_id,
    created_at: row.created_at.toISOString(),
    linked_at: row.linked_at.toISOString(),
  };
}

function mapConversationRow(
  row: ConversationRow,
  attachments: LinkedAttachment[] = [],
): ConversationEntry {
  const entry: ConversationEntry = {
    id: row.id,
    kind: row.kind,
    actor_id: row.actorId,
    body_rich_content: row.bodyRichContent,
    created_at: row.createdAt.toISOString(),
    visibility: row.visibility,
    // PLAN-22 §Bug-1: per-entry attachments; [] when none.
    attachments,
  };
  if (row.kind === 'public_update') {
    entry.reporter_facing_status_before = row.reporterFacingStatusBefore;
    entry.reporter_facing_status_after = row.reporterFacingStatusAfter;
    entry.skip_public_update = row.skipPublicUpdate;
    entry.skip_reason = row.skipReason ?? null;
  }
  return entry;
}

// PLAN-22 §Bug-1: helper that takes a list of conversation rows + bulk
// attachment map (comment_id → rows) and emits ConversationEntry[] with
// per-entry `attachments[]` populated.
function mapConversationRowsWithAttachments(
  rows: ConversationRow[],
  attachmentsByCommentId: Map<string, import('./repo-read.js').LinkedAttachmentReadRow[]>,
): ConversationEntry[] {
  return rows.map((row) => {
    const linked = attachmentsByCommentId.get(row.id) ?? [];
    return mapConversationRow(row, linked.map(mapAttachmentRow));
  });
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

type ResolvedVocListScope = {
  scopeFilter: Scope;
  actorIdForMyFilter?: string;
};

/** Shared view-to-scope decision for VOC lists and their navigation counts. */
function resolveVocListScope(args: {
  actor: ReadActorContext;
  query: Pick<ListVocsQuery, 'view' | 'managed_system_id'>;
  readScope: Scope;
  triageScope: Scope | undefined;
}): ResolvedVocListScope {
  const { actor, query, readScope, triageScope } = args;
  const { view, managed_system_id } = query;

  if (view === 'my') {
    if (managed_system_id === 'all') {
      throw new HttpError('validation.failed', 'managed_system_id=all not allowed for view=my', {
        fields: [{ path: ['managed_system_id'], code: 'invalid' }],
      });
    }
    return {
      scopeFilter: managed_system_id && managed_system_id !== 'all'
        ? { kind: 'scoped', managedSystemIds: [managed_system_id] }
        : { kind: 'all' },
      actorIdForMyFilter: actor.actor_id,
    };
  }

  if (view === 'inbox') {
    if (readScope.kind === 'scoped' && readScope.managedSystemIds.length === 0) {
      if (actor.role_level === 'developer') {
        throw new HttpError('permission.scope_required', 'voc.read capability required; developer needs MS-scoped grant', {
          requiredScope: [],
          requestable_permission: { permission: 'voc.read', managed_system_id: null },
        });
      }
      throw new HttpError('permission.denied', 'no voc.read scope for actor', { reason: 'no_grant' });
    }
    if (managed_system_id && managed_system_id !== 'all') {
      if (!msInScope(readScope, managed_system_id)) {
        throw new HttpError('permission.scope_required', 'managed_system_id not in voc.read scope', {
          requiredScope: [managed_system_id],
          requestable_permission: { permission: 'voc.read', managed_system_id },
        });
      }
      return { scopeFilter: { kind: 'scoped', managedSystemIds: [managed_system_id] } };
    }
    return { scopeFilter: readScope };
  }

  const intersected = intersectScopes(readScope, triageScope!);
  if (intersected.kind === 'scoped' && intersected.managedSystemIds.length === 0) {
    throw new HttpError('permission.denied', 'no voc.triage scope for actor', {
      requestable_permission: { permission: 'voc.triage', managed_system_id: null },
    });
  }
  if (managed_system_id && managed_system_id !== 'all') {
    if (!msInScope(intersected, managed_system_id)) {
      throw new HttpError('permission.scope_required', 'managed_system_id not in voc.triage scope', {
        requiredScope: [managed_system_id],
        requestable_permission: { permission: 'voc.triage', managed_system_id },
      });
    }
    return { scopeFilter: { kind: 'scoped', managedSystemIds: [managed_system_id] } };
  }
  return { scopeFilter: intersected };
}

// ── Service factory ──────────────────────────────────────────────────────────

export function createVocReadService(deps: VocReadServiceDeps) {
  async function countVocs(args: { actor: ReadActorContext; query: CountVocsQuery }): Promise<number> {
    const { actor, query } = args;
    const { view, tab } = query;
    const filterSeverity = query['filter.severity'];
    const filterReporterFacingStatus = query['filter.reporter_facing_status'];
    const filterOwner = query['filter.owner'];
    if (tab === 'waiting' && view !== 'triage') {
      throw new HttpError('validation.failed', 'tab=waiting is only valid for view=triage', {
        fields: [{ path: ['tab'], code: 'invalid_for_view' }],
      });
    }
    const [readScope, triageScope] = await Promise.all([
      repoRead.actorReadScope(deps.db, actor),
      view === 'triage' ? repoRead.actorTriageScope(deps.db, actor) : Promise.resolve(undefined),
    ]);
    const { scopeFilter, actorIdForMyFilter } = resolveVocListScope({ actor, query, readScope, triageScope });
    return repoRead.countVocsForRead(deps.db, {
      workspaceId: actor.workspace_id,
      scopeFilter,
      view,
      ...(actorIdForMyFilter !== undefined ? { actorIdForMyFilter } : {}),
      ...(tab !== undefined ? { tab } : {}),
      ...(filterSeverity !== undefined ? { filterSeverity } : {}),
      ...(filterReporterFacingStatus !== undefined ? { filterReporterFacingStatus } : {}),
      ...(filterOwner !== undefined ? { filterOwner } : {}),
    });
  }

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

    // ── 2b. pin_voc_id cross-view validation (#383) ──────────────────────────
    const pinVocId = query.pin_voc_id;
    if (pinVocId !== undefined && view !== 'triage') {
      throw new HttpError('validation.failed', 'pin_voc_id is only valid for view=triage', {
        fields: [{ path: ['pin_voc_id'], code: 'invalid_for_view' }],
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

    // ── 5. Resolve scopes (skip triageScope for non-triage views) ─────────────
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

    // ── 6. Resolve view-specific scope and validation ─────────────────────────
    const { scopeFilter, actorIdForMyFilter } = resolveVocListScope({
      actor,
      query,
      readScope,
      triageScope,
    });

    // ── 7. Call repo ──────────────────────────────────────────────────────────
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

    // ── 8. Pin the re-triage deep-link target (#383) ─────────────────────────
    // The triage queue predicate excludes already-triaged VOCs, so a deep link
    // from the VOC detail panel would otherwise land on a queue that cannot
    // show its target — and the screen would silently fall back to a different
    // VOC's commit form. Union the requested row in FIRST, and only when the
    // caller's own triage scope already covers it.
    //
    // Deliberately placed AFTER the repo call and BEFORE the count/mapping
    // stage so the pinned row gets the same attachment/similar projection as
    // every other row. `hasMore` / `nextCursor` are computed from the tab query
    // alone and are NOT touched here — pagination must not shift because a row
    // was pinned.
    let pinnedRows = rows;
    if (pinVocId !== undefined && !rows.some((r) => r.id === pinVocId)) {
      const pinnedRow = await repoRead.selectPinnedVocListRow(deps.db, {
        workspaceId: actor.workspace_id,
        scopeFilter,
        vocId: pinVocId,
      });
      // Out of scope, archived, other workspace, or unknown id → drop silently.
      if (pinnedRow !== null) pinnedRows = [pinnedRow, ...rows];
    }

    // ── 9. Bulk attachment count per row (PLAN-22 §Bug-1) ────────────────────
    const sourceVocIds = pinnedRows.map((r) => r.id);
    const [attachmentCounts, similarCounts] = await Promise.all([
      repoRead.selectVocAttachmentCounts(deps.db, sourceVocIds),
      repoRead.selectSimilarVocCounts(deps.db, {
        workspaceId: actor.workspace_id,
        sourceVocIds,
        actorId: actor.actor_id,
        readScope,
      }),
    ]);

    // ── 9b. Map rows → VocListItem with attachment_count ─────────────────────
    const items = pinnedRows.map((r) => mapRowToListItem(
      r,
      attachmentCounts.get(r.id) ?? 0,
      similarCounts.get(r.id) ?? 0,
    ));

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
    const isReporterArm = isReporter && !msInReadScope && !canTriage;

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

    // ── 5. Decode conversation cursor (optional — first-page call passes none) ─
    // PLAN-22 §Bug-2: cursor is optional at the schema layer. Treat undefined
    // as "start from oldest" — selectConversationPage already handles the
    // undefined-cursor branch (no cursor predicate emitted).
    const decodedConvCursor =
      query.cursor !== undefined ? decodeConversationCursor(query.cursor) : undefined;

    // ── 6. Fetch conversation page ────────────────────────────────────────────
    const convArgs: repoRead.SelectConversationPageArgs = {
      workspaceId: actor.workspace_id,
      vocId,
      actorId: actor.actor_id,
      canTriage,
      isReporter,
      limit: query.limit,
    };
    if (decodedConvCursor !== undefined) convArgs.cursor = decodedConvCursor;
    if (query.kind !== undefined) convArgs.kind = query.kind;

    const convResult = await repoRead.selectConversationPage(deps.db, convArgs);

    // PLAN-22 §Bug-1: hydrate per-entry attachments[] (same contract as the
    // inline timeline on getVocDetail).
    const commentIds = convResult.entries.map((e) => e.id);
    const commentAttachmentsMap = await repoRead.selectAttachmentsForComments(
      deps.db,
      actor.workspace_id,
      commentIds,
    );
    const items = mapConversationRowsWithAttachments(convResult.entries, commentAttachmentsMap);

    let nextCursorStr: string | undefined;
    if (convResult.hasMore && convResult.nextCursor) {
      nextCursorStr = encodeConversationCursor(convResult.nextCursor);
    }

    const convPage: { cursor?: string; has_more: boolean } = { has_more: convResult.hasMore };
    if (nextCursorStr !== undefined) convPage.cursor = nextCursorStr;

    return { items, page: convPage };
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
      repoRead.actorTriageScope(tx, actor),
      repoRead.actorReadScope(tx, actor),
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

  return { listVocs, countVocs, getVocDetail, getConversation, composeDetailEnvelope };
}

export type VocReadService = ReturnType<typeof createVocReadService>;
