// VOC list and navigation count read methods.
import type { ListVocsQuery, VocListItem } from '@fops/shared';
import { HttpError } from '../../../lib/errors.js';
import {
  type Scope,
  actorEffectiveScope,
  actorReadScope,
  actorTriageScope,
} from '../authorization.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { CountVocsQuery, VocGroupedCountArgs } from '../read-contract.js';
import type { ReadActorContext, VocReadServiceDeps } from '../read-service.js';
import * as repoRead from '../repo-read.js';
import { mapRowToListItem } from './mappers.js';
import { resolveVocListScope } from './scope.js';

export function createVocListReaders(deps: VocReadServiceDeps) {
  async function countVocs(args: {
    actor: ReadActorContext;
    query: CountVocsQuery;
  }): Promise<number> {
    const { actor, query } = args;
    const { view, tab } = query;
    const filterSeverity = query['filter.severity'];
    const filterReporterFacingStatus = query['filter.reporter_facing_status'];
    const filterOwner = query['filter.owner'];
    const analyticsAreaId = query.analyticsAreaId;
    if (tab === 'waiting' && view !== 'triage') {
      throw new HttpError('validation.failed', 'tab=waiting is only valid for view=triage', {
        fields: [{ path: ['tab'], code: 'invalid_for_view' }],
      });
    }
    const [readScope, triageScope] = await Promise.all([
      actorReadScope(deps.db, actor),
      view === 'triage' ? actorTriageScope(deps.db, actor) : Promise.resolve(undefined),
    ]);
    const { scopeFilter, actorIdForMyFilter } = resolveVocListScope({
      actor,
      query,
      readScope,
      triageScope,
    });
    return repoRead.countVocsForRead(deps.db, {
      workspaceId: actor.workspace_id,
      scopeFilter,
      view,
      ...(actorIdForMyFilter !== undefined ? { actorIdForMyFilter } : {}),
      ...(tab !== undefined ? { tab } : {}),
      ...(filterSeverity !== undefined ? { filterSeverity } : {}),
      ...(filterReporterFacingStatus !== undefined ? { filterReporterFacingStatus } : {}),
      ...(filterOwner !== undefined ? { filterOwner } : {}),
      ...(analyticsAreaId !== undefined ? { analyticsAreaId } : {}),
    });
  }

  async function countGroupedVocs(args: VocGroupedCountArgs) {
    const { scopeFilter } = resolveVocListScope({
      actor: args.actor,
      query: {
        view: 'inbox',
        ...(args.managedSystemId !== undefined ? { managed_system_id: args.managedSystemId } : {}),
      },
      readScope: args.readScope,
      triageScope: undefined,
    });
    return repoRead.countGroupedVocsForRead(deps.db, {
      workspaceId: args.actor.workspace_id,
      scopeFilter,
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
    const filterAnalyticsAreaUnset = query['filter.analytics_area'] === 'unset';

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
        actorReadScope(deps.db, actor),
        actorEffectiveScope(deps.db, actor),
        actorTriageScope(deps.db, actor),
      ]);
    } else {
      [readScope, effectiveScope] = await Promise.all([
        actorReadScope(deps.db, actor),
        actorEffectiveScope(deps.db, actor),
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
    if (filterReporterFacingStatus !== undefined)
      repoArgs.filterReporterFacingStatus = filterReporterFacingStatus;
    if (filterOwner !== undefined) repoArgs.filterOwner = filterOwner;
    if (filterAnalyticsAreaUnset) repoArgs.filterAnalyticsAreaUnset = true;
    if (decodedCursor !== undefined) repoArgs.cursor = decodedCursor;

    const {
      rows,
      hasMore,
      nextCursor: repoCursor,
    } = await repoRead.listVocsForRead(deps.db, repoArgs);

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
    const items = pinnedRows.map((r) =>
      mapRowToListItem(r, attachmentCounts.get(r.id) ?? 0, similarCounts.get(r.id) ?? 0),
    );

    // ── 10. Encode nextCursor ──────────────────────────────────────────────────
    let nextCursorStr: string | undefined;
    if (hasMore && repoCursor) {
      nextCursorStr = encodeCursor({
        s: sortKey,
        d: sortDir,
        sv: repoCursor.sv,
        id: repoCursor.id,
      });
    }

    // ── 11. out_of_scope_summary (inbox only) ──────────────────────────────────
    let out_of_scope_summary:
      | { count: number; severity_distribution: Record<string, number> }
      | undefined;
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
  return { listVocs, countVocs, countGroupedVocs };
}
