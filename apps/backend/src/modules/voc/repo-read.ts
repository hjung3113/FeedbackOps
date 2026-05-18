// apps/backend/src/modules/voc/repo-read.ts
//
// Read repo layer for the VOC module. Pure SQL/drizzle reads on voc.* tables.
// No route handlers, no service-layer logic.
//
// Cross-module dependency note:
//   Scope resolution (actorEffectiveScope / actorReadScope / actorTriageScope)
//   reads permission.permission_grants. Per AGENTS.md layer rules, repos may
//   not reach into tables owned by another module. We delegate to
//   permissions/scope-service.ts which owns that cross-module read. This file
//   calls actorScopeForCapability() from scope-service.ts; it MUST NOT import
//   from permission.ts schema directly.

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import {
  managedSystems,
} from '../../db/schema/core.js';
import {
  vocInternalComments,
  vocPermissionDecisionsSeedFixture,
  vocPublicUpdates,
  vocReporterReplies,
  vocs,
} from '../../db/schema/voc.js';
import type { Scope, ScopeActorContext } from '../permissions/scope-service.js';
import { actorScopeForCapability } from '../permissions/scope-service.js';
import { SEVERITY_ORDINAL, SORT_CONFIG } from './cursor.js';

// Re-export Scope so callers only need one import.
export type { Scope };

// ── Actor context ─────────────────────────────────────────────────────────────

export interface ActorContextLite {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

// ── Scope resolvers ───────────────────────────────────────────────────────────

/**
 * Effective scope: ANY non-revoked, non-expired grant of ANY capability for
 * the actor in the workspace. MS-scoped grants → list of MS ids;
 * workspace-wide grants → 'all'. Admin role → 'all'.
 *
 * Used for out_of_scope_summary visibility and detail-existence-probe defense.
 */
export async function actorEffectiveScope(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<Scope> {
  return actorScopeForCapability(db, actor as ScopeActorContext, undefined);
}

/**
 * voc.read scope. Admin → 'all'. Otherwise: workspace-wide voc.read grant →
 * 'all'; MS-scoped voc.read grants → scoped list. Empty list → scoped:[].
 */
export async function actorReadScope(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<Scope> {
  return actorScopeForCapability(db, actor as ScopeActorContext, 'voc.read');
}

/** voc.triage scope. Same shape as actorReadScope; admin → 'all'. */
export async function actorTriageScope(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<Scope> {
  return actorScopeForCapability(db, actor as ScopeActorContext, 'voc.triage');
}

/** All MS ids in workspace (used for diagnostics only — NOT for out_of_scope). */
export async function allManagedSystemIds(
  db: Db | Tx,
  workspaceId: string,
): Promise<string[]> {
  const rows = await (db as Db)
    .select({ id: managedSystems.id })
    .from(managedSystems)
    .where(sql`${managedSystems.workspaceId} = ${workspaceId} AND ${managedSystems.archivedAt} IS NULL`);
  return rows.map((r) => r.id);
}

// ── SQL array helpers ─────────────────────────────────────────────────────────
// Drizzle's sql`` tag serializes JS arrays as postgres row/record literals, not
// postgres array literals. To safely use ANY($arr::uuid[]), we build
// ARRAY[v1, v2, ...]::uuid[] with individual parameterised slots.
// This avoids string interpolation of user-supplied values.

function sqlUuidArray(ids: string[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const items = ids.map((id) => sql`${id}::uuid`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::uuid[]`;
}

function sqlTextArray(values: string[]): ReturnType<typeof sql> {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  const items = values.map((v) => sql`${v}::text`);
  return sql`ARRAY[${sql.join(items, sql`, `)}]::text[]`;
}

// ── VocReadRow ────────────────────────────────────────────────────────────────

export interface VocReadRow {
  id: string;
  displayId: string;
  title: string;
  workspaceId: string;
  primaryManagedSystemId: string;
  analyticsAreaId: string | null;
  reporterId: string;
  ownerUserId: string | null;
  ownerTeamId: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  reporterFacingStatus: string;
  triageState: string;
  triageStateReviewPostponedAt: Date | null;
  sourceContext: string;
  descriptionRichContent: unknown;
  createdAt: Date;
  updatedAt: Date;
}

// ── listVocsForRead ──────────────────────────────────────────────────────────

export interface ListVocsRepoArgs {
  workspaceId: string;
  scopeFilter: Scope;
  view: 'inbox' | 'my' | 'triage';
  actorIdForMyFilter?: string; // required when view='my'
  tab?: 'untriaged' | 'high' | 'unassigned' | 'similar' | 'no-link' | 'waiting';
  filterSeverity?: ('low' | 'medium' | 'high' | 'critical')[];
  filterReporterFacingStatus?: string[];
  filterOwner?: 'assigned' | 'unassigned';
  sort: 'created_at:desc' | 'created_at:asc' | 'severity:asc' | 'severity:desc' | 'reporter_facing_status:asc' | 'triage_pinned';
  cursor?: { sv: string | number; id: string };
  limit: number;
}

// Utility: normalise raw postgres row dates.
function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}
function toDateOrNull(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v : new Date(v);
}

function mapVocRow(row: Record<string, unknown>): VocReadRow {
  return {
    id: row.id as string,
    displayId: row.display_id as string,
    title: row.title as string,
    workspaceId: row.workspace_id as string,
    primaryManagedSystemId: row.primary_managed_system_id as string,
    analyticsAreaId: (row.analytics_area_id as string | null) ?? null,
    reporterId: row.reporter_id as string,
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    ownerTeamId: (row.owner_team_id as string | null) ?? null,
    severity: (row.severity as 'low' | 'medium' | 'high' | 'critical' | null) ?? null,
    reporterFacingStatus: row.reporter_facing_status as string,
    triageState: row.triage_state as string,
    triageStateReviewPostponedAt: toDateOrNull(row.triage_state_review_postponed_at as Date | string | null | undefined),
    sourceContext: row.source_context as string,
    // For list rows, descriptionRichContent is null (heavy column not fetched).
    descriptionRichContent: row.description_rich_content ?? null,
    createdAt: toDate(row.created_at as Date | string),
    updatedAt: toDate(row.updated_at as Date | string),
  };
}

// Severity ordinal CASE expression for SQL (returns 0 when severity IS NULL
// so nulls sort last in ASC, first in DESC; ordinal 1..4 for low..critical).
const SEVERITY_ORDINAL_CASE = sql<number>`
  CASE severity
    WHEN 'low'      THEN 1
    WHEN 'medium'   THEN 2
    WHEN 'high'     THEN 3
    WHEN 'critical' THEN 4
    ELSE 0
  END`;

export async function listVocsForRead(
  db: Db | Tx,
  args: ListVocsRepoArgs,
): Promise<{ rows: VocReadRow[]; hasMore: boolean; nextCursor: { sv: string | number; id: string } | null }> {
  const { workspaceId, scopeFilter, view, actorIdForMyFilter, tab, filterSeverity, filterReporterFacingStatus, filterOwner, sort, cursor, limit } = args;

  // Short-circuit: empty scoped list → no rows possible, skip DB query.
  if (scopeFilter.kind === 'scoped' && scopeFilter.managedSystemIds.length === 0) {
    return { rows: [], hasMore: false, nextCursor: null };
  }

  // tab='similar' → WHERE false (Slice 3; cluster service not available).
  if (tab === 'similar') {
    return { rows: [], hasMore: false, nextCursor: null };
  }

  // Build the WHERE clauses via raw SQL fragments.
  // All values are bound via parameterised sql`` tags — never string-interpolated.
  const wheres: ReturnType<typeof sql>[] = [
    sql`workspace_id = ${workspaceId}`,
    sql`archived_at IS NULL`,
  ];

  // Scope filter.
  if (scopeFilter.kind === 'scoped') {
    wheres.push(sql`primary_managed_system_id = ANY(${sqlUuidArray(scopeFilter.managedSystemIds)})`);
  }

  // View-specific filters.
  if (view === 'my') {
    if (!actorIdForMyFilter) throw new Error('actorIdForMyFilter required for view=my');
    wheres.push(sql`reporter_id = ${actorIdForMyFilter}`);
  } else if (view === 'triage') {
    wheres.push(sql`triage_state IN ('untriaged','needs_more_information')`);
  }

  // Tab filters.
  if (tab === 'untriaged') {
    wheres.push(sql`triage_state = 'untriaged'`);
  } else if (tab === 'high') {
    wheres.push(sql`severity = 'high'`);
  } else if (tab === 'unassigned') {
    wheres.push(sql`owner_user_id IS NULL AND owner_team_id IS NULL`);
  } else if (tab === 'waiting') {
    // Only valid for triage view; no extra clause beyond the triage_state filter
    // since service layer validates view=triage for this tab.
    wheres.push(sql`triage_state = 'untriaged' AND triage_state_review_postponed_at IS NOT NULL`);
  }
  // tab='no-link' → no extra clause (entity_links absent in Slice 3).

  // Scalar column filters.
  if (filterSeverity && filterSeverity.length > 0) {
    wheres.push(sql`severity = ANY(${sqlTextArray(filterSeverity)})`);
  }
  if (filterReporterFacingStatus && filterReporterFacingStatus.length > 0) {
    wheres.push(sql`reporter_facing_status = ANY(${sqlTextArray(filterReporterFacingStatus)})`);
  }
  if (filterOwner === 'assigned') {
    wheres.push(sql`(owner_user_id IS NOT NULL OR owner_team_id IS NOT NULL)`);
  } else if (filterOwner === 'unassigned') {
    wheres.push(sql`owner_user_id IS NULL AND owner_team_id IS NULL`);
  }

  // Determine sort order and cursor predicate.
  // triage_pinned uses a server-pinned composite sort; others use SORT_CONFIG.
  const isTriage = sort === 'triage_pinned';
  const fetchLimit = limit + 1;

  let querySql: ReturnType<typeof sql>;

  if (isTriage) {
    // Triage pinned sort: unassigned_first DESC, severity_ord DESC (nulls last via 0),
    // created_at ASC, id ASC.
    // Cursor sv encodes composite as `${unassignedBool}|${sevOrd}|${createdAtIso}`.
    const whereClause = sql.join(wheres, sql` AND `);

    let cursorPredicate = sql`true`;
    if (cursor) {
      const [unassignedStr, sevOrdStr, createdAtIso] = String(cursor.sv).split('|');
      const unassignedBool = unassignedStr === '1';
      const sevOrd = Number(sevOrdStr);
      const createdAt = createdAtIso;
      // (unassigned_first, severity_ord, created_at, id) > (cursor_values)
      // ascending on (unassigned DESC, sev DESC, created_at ASC, id ASC) requires:
      // ROW comparison in Postgres handles mixed ASC/DESC poorly, so expand:
      //   unassigned_first < cursor.unassigned (lower unassigned rank = later)
      //   OR (unassigned_first = cursor.unassigned AND severity_ord < cursor.sevOrd)
      //   OR (unassigned_first = cursor.unassigned AND severity_ord = cursor.sevOrd AND
      //       (created_at > cursor.created_at OR (created_at = cursor.created_at AND id > cursor.id)))
      cursorPredicate = sql`(
        (owner_user_id IS NULL AND owner_team_id IS NULL)::int < ${unassignedBool ? 1 : 0}
        OR (
          (owner_user_id IS NULL AND owner_team_id IS NULL)::int = ${unassignedBool ? 1 : 0}
          AND ${SEVERITY_ORDINAL_CASE} < ${sevOrd}
        )
        OR (
          (owner_user_id IS NULL AND owner_team_id IS NULL)::int = ${unassignedBool ? 1 : 0}
          AND ${SEVERITY_ORDINAL_CASE} = ${sevOrd}
          AND (
            created_at > ${createdAt}::timestamptz
            OR (created_at = ${createdAt}::timestamptz AND id > ${cursor.id}::uuid)
          )
        )
      )`;
    }

    querySql = sql`
      SELECT
        id, display_id, title, workspace_id, primary_managed_system_id,
        analytics_area_id, reporter_id, owner_user_id, owner_team_id,
        severity, reporter_facing_status, triage_state,
        triage_state_review_postponed_at, source_context,
        NULL::jsonb as description_rich_content,
        created_at, updated_at,
        created_at::text AS _created_at_raw,
        (owner_user_id IS NULL AND owner_team_id IS NULL)::int AS _unassigned_int,
        ${SEVERITY_ORDINAL_CASE} AS _severity_ord
      FROM ${vocs}
      WHERE ${whereClause} AND ${cursorPredicate}
      ORDER BY
        (owner_user_id IS NULL AND owner_team_id IS NULL) DESC,
        ${SEVERITY_ORDINAL_CASE} DESC,
        created_at ASC,
        id ASC
      LIMIT ${fetchLimit}
    `;
  } else {
    // Standard sort via SORT_CONFIG.
    const sortKey = sort as keyof typeof SORT_CONFIG;
    const config = SORT_CONFIG[sortKey];
    const dir = sort.endsWith(':asc') ? 'asc' : 'desc';

    let cursorPredicate = sql`true`;
    if (cursor) {
      if (config.severityOrdinal) {
        const sevOrd = Number(cursor.sv);
        if (dir === 'asc') {
          cursorPredicate = sql`(
            ${SEVERITY_ORDINAL_CASE} > ${sevOrd}
            OR (${SEVERITY_ORDINAL_CASE} = ${sevOrd} AND id > ${cursor.id}::uuid)
          )`;
        } else {
          cursorPredicate = sql`(
            ${SEVERITY_ORDINAL_CASE} < ${sevOrd}
            OR (${SEVERITY_ORDINAL_CASE} = ${sevOrd} AND id < ${cursor.id}::uuid)
          )`;
        }
      } else if (config.column === 'created_at') {
        const createdAt = String(cursor.sv);
        if (dir === 'asc') {
          cursorPredicate = sql`(
            created_at > ${createdAt}::timestamptz
            OR (created_at = ${createdAt}::timestamptz AND id > ${cursor.id}::uuid)
          )`;
        } else {
          cursorPredicate = sql`(
            created_at < ${createdAt}::timestamptz
            OR (created_at = ${createdAt}::timestamptz AND id < ${cursor.id}::uuid)
          )`;
        }
      } else {
        // reporter_facing_status or similar text column.
        const sv = String(cursor.sv);
        if (dir === 'asc') {
          cursorPredicate = sql`(
            reporter_facing_status > ${sv}
            OR (reporter_facing_status = ${sv} AND id > ${cursor.id}::uuid)
          )`;
        } else {
          cursorPredicate = sql`(
            reporter_facing_status < ${sv}
            OR (reporter_facing_status = ${sv} AND id < ${cursor.id}::uuid)
          )`;
        }
      }
    }

    const whereClause = sql.join(wheres, sql` AND `);

    // ORDER BY clause per sort config + direction.
    let orderBySql: ReturnType<typeof sql>;
    if (config.severityOrdinal) {
      orderBySql = dir === 'asc'
        ? sql`${SEVERITY_ORDINAL_CASE} ASC, id ASC`
        : sql`${SEVERITY_ORDINAL_CASE} DESC, id DESC`;
    } else if (config.column === 'created_at') {
      orderBySql = dir === 'asc'
        ? sql`created_at ASC, id ASC`
        : sql`created_at DESC, id DESC`;
    } else {
      // reporter_facing_status
      orderBySql = dir === 'asc'
        ? sql`reporter_facing_status ASC, id ASC`
        : sql`reporter_facing_status DESC, id DESC`;
    }

    querySql = sql`
      SELECT
        id, display_id, title, workspace_id, primary_managed_system_id,
        analytics_area_id, reporter_id, owner_user_id, owner_team_id,
        severity, reporter_facing_status, triage_state,
        triage_state_review_postponed_at, source_context,
        NULL::jsonb as description_rich_content,
        created_at, updated_at,
        created_at::text AS _created_at_raw
      FROM ${vocs}
      WHERE ${whereClause} AND ${cursorPredicate}
      ORDER BY ${orderBySql}
      LIMIT ${fetchLimit}
    `;
  }

  const result = await (db as Db).execute<Record<string, unknown>>(querySql);
  const raw = result.rows;

  const hasMore = raw.length > limit;
  const sliced = hasMore ? raw.slice(0, limit) : raw;
  const rows = sliced.map(mapVocRow);

  // Build nextCursor from the last row when hasMore.
  let nextCursor: { sv: string | number; id: string } | null = null;
  if (hasMore && sliced.length > 0) {
    const last = sliced[sliced.length - 1]!;
    const lastId = last.id as string;
    const lastMapped = mapVocRow(last);

    // Use _created_at_raw (postgres text) for full microsecond precision in cursor.
    // JS Date.toISOString() loses microseconds; raw postgres text preserves them.
    const rawCreatedAt = (last._created_at_raw as string | undefined) ?? lastMapped.createdAt.toISOString();

    if (isTriage) {
      const unassignedInt = lastMapped.ownerUserId === null && lastMapped.ownerTeamId === null ? 1 : 0;
      const sevOrd = lastMapped.severity ? (SEVERITY_ORDINAL[lastMapped.severity] ?? 0) : 0;
      nextCursor = { sv: `${unassignedInt}|${sevOrd}|${rawCreatedAt}`, id: lastId };
    } else {
      const config = SORT_CONFIG[sort as keyof typeof SORT_CONFIG];
      let sv: string | number;
      if (config.severityOrdinal) {
        sv = lastMapped.severity ? (SEVERITY_ORDINAL[lastMapped.severity] ?? 0) : 0;
      } else if (config.column === 'created_at') {
        sv = rawCreatedAt;
      } else {
        sv = lastMapped.reporterFacingStatus;
      }
      nextCursor = { sv, id: lastId };
    }
  }

  return { rows, hasMore, nextCursor };
}

// ── selectVocByIdForRead ─────────────────────────────────────────────────────

export async function selectVocByIdForRead(
  db: Db | Tx,
  workspaceId: string,
  vocId: string,
): Promise<VocReadRow | null> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT
      id, display_id, title, workspace_id, primary_managed_system_id,
      analytics_area_id, reporter_id, owner_user_id, owner_team_id,
      severity, reporter_facing_status, triage_state,
      triage_state_review_postponed_at, source_context,
      description_rich_content,
      created_at, updated_at
    FROM ${vocs}
    WHERE id = ${vocId}
      AND workspace_id = ${workspaceId}
      AND archived_at IS NULL
  `);
  const row = result.rows[0];
  if (!row) return null;
  return mapVocRow(row);
}

// ── selectConversationPage ────────────────────────────────────────────────────

export type ConversationKind = 'public_update' | 'reporter_reply' | 'internal_comment';

export interface ConversationRow {
  id: string;
  kind: ConversationKind;
  actorId: string;
  bodyRichContent: unknown;
  createdAt: Date;
  visibility: 'public' | 'reporter' | 'internal';
  // public_update extras:
  reporterFacingStatusBefore?: string;
  reporterFacingStatusAfter?: string;
  skipPublicUpdate?: boolean;
  skipReason?: string | null;
}

export interface SelectConversationPageArgs {
  vocId: string;
  actorId: string;        // for reporter_reply visibility filter
  canTriage: boolean;     // gates internal_comment + sees all reporter_replies
  isReporter: boolean;    // when true && !canTriage → only own reporter_replies
  cursor?: { createdAt: string; id: string }; // (createdAt, id) pagination
  limit: number;
  kind?: ConversationKind;
}

export async function selectConversationPage(
  db: Db | Tx,
  args: SelectConversationPageArgs,
): Promise<{ entries: ConversationRow[]; hasMore: boolean; nextCursor: { createdAt: string; id: string } | null }> {
  const { vocId, actorId, canTriage, isReporter, cursor, limit, kind } = args;

  const fetchLimit = limit + 1;

  // Cursor predicate: (created_at, id) < (cursor.createdAt, cursor.id) for DESC.
  let cursorSql = sql`true`;
  if (cursor) {
    cursorSql = sql`(
      created_at < ${cursor.createdAt}::timestamptz
      OR (created_at = ${cursor.createdAt}::timestamptz AND id < ${cursor.id}::uuid)
    )`;
  }

  // Build UNION ALL branches based on visibility flags and optional kind filter.
  const branches: ReturnType<typeof sql>[] = [];

  // public_update branch — always included (everyone with VOC access sees public).
  if (!kind || kind === 'public_update') {
    branches.push(sql`
      SELECT
        id, 'public_update'::text AS kind, actor_id,
        body_rich_content, created_at, created_at::text AS _created_at_raw,
        'public'::text AS visibility,
        reporter_facing_status_before,
        reporter_facing_status_after,
        skip_public_update,
        skip_reason
      FROM ${vocPublicUpdates}
      WHERE voc_id = ${vocId}
        AND ${cursorSql}
    `);
  }

  // reporter_reply branch — visibility depends on role.
  if (!kind || kind === 'reporter_reply') {
    // canTriage sees all; isReporter (without triage) sees own only; others see all.
    // "Others with read access" see all reporter_replies (they are not the reporter
    // and they can't triage, but they have read access — show all replies).
    const replyFilter = (!canTriage && isReporter)
      ? sql`AND actor_id = ${actorId}`
      : sql``;

    branches.push(sql`
      SELECT
        id, 'reporter_reply'::text AS kind, actor_id,
        body_rich_content, created_at, created_at::text AS _created_at_raw,
        'reporter'::text AS visibility,
        NULL::text AS reporter_facing_status_before,
        NULL::text AS reporter_facing_status_after,
        NULL::boolean AS skip_public_update,
        NULL::text AS skip_reason
      FROM ${vocReporterReplies}
      WHERE voc_id = ${vocId}
        AND ${cursorSql}
        ${replyFilter}
    `);
  }

  // internal_comment branch — only if canTriage.
  if (canTriage && (!kind || kind === 'internal_comment')) {
    branches.push(sql`
      SELECT
        id, 'internal_comment'::text AS kind, actor_id,
        body_rich_content, created_at, created_at::text AS _created_at_raw,
        'internal'::text AS visibility,
        NULL::text AS reporter_facing_status_before,
        NULL::text AS reporter_facing_status_after,
        NULL::boolean AS skip_public_update,
        NULL::text AS skip_reason
      FROM ${vocInternalComments}
      WHERE voc_id = ${vocId}
        AND ${cursorSql}
    `);
  }

  if (branches.length === 0) {
    return { entries: [], hasMore: false, nextCursor: null };
  }

  const unionSql = branches.length === 1
    ? branches[0]!
    : sql.join(branches, sql` UNION ALL `);

  const querySql = sql`
    SELECT * FROM (${unionSql}) AS conv
    ORDER BY created_at DESC, id DESC
    LIMIT ${fetchLimit}
  `;

  const result = await (db as Db).execute<Record<string, unknown>>(querySql);
  const raw = result.rows;

  const hasMore = raw.length > limit;
  const sliced = hasMore ? raw.slice(0, limit) : raw;

  const entries: ConversationRow[] = sliced.map((row) => {
    const kind = row.kind as ConversationKind;
    const base: ConversationRow = {
      id: row.id as string,
      kind,
      actorId: row.actor_id as string,
      bodyRichContent: row.body_rich_content,
      createdAt: toDate(row.created_at as Date | string),
      visibility: row.visibility as 'public' | 'reporter' | 'internal',
    };
    if (kind === 'public_update') {
      base.reporterFacingStatusBefore = row.reporter_facing_status_before as string;
      base.reporterFacingStatusAfter = row.reporter_facing_status_after as string;
      base.skipPublicUpdate = row.skip_public_update as boolean;
      base.skipReason = (row.skip_reason as string | null) ?? null;
    }
    return base;
  });

  let nextCursor: { createdAt: string; id: string } | null = null;
  if (hasMore && sliced.length > 0) {
    const last = sliced[sliced.length - 1]!;
    // Use full-precision postgres text for the cursor to avoid JS Date millisecond truncation.
    const rawCreatedAt = (last._created_at_raw as string | undefined) ??
      toDate(last.created_at as Date | string).toISOString();
    nextCursor = {
      createdAt: rawCreatedAt,
      id: last.id as string,
    };
  }

  return { entries, hasMore, nextCursor };
}

// ── outOfScopeSummary ─────────────────────────────────────────────────────────

export async function outOfScopeSummary(
  db: Db | Tx,
  args: {
    workspaceId: string;
    effectiveScope: Scope;
    readScope: Scope;
  },
): Promise<{ count: number; severity_distribution: Record<'low' | 'medium' | 'high' | 'critical', number> } | null> {
  const { workspaceId, effectiveScope, readScope } = args;

  // readScope='all' → nothing is out-of-scope.
  if (readScope.kind === 'all') return null;

  // Resolve effective MS ids.
  let effectiveMsIds: string[];
  if (effectiveScope.kind === 'all') {
    // Resolve all workspace MSs as effective set.
    effectiveMsIds = await allManagedSystemIds(db, workspaceId);
  } else {
    effectiveMsIds = effectiveScope.managedSystemIds;
  }

  const readMsIds = readScope.managedSystemIds;

  // Diff: effectiveMSs \ readMSs.
  const readSet = new Set(readMsIds);
  const diffMsIds = effectiveMsIds.filter((id) => !readSet.has(id));

  // No diff → null.
  if (diffMsIds.length === 0) return null;

  // Count and histogram over VOCs in the diff MSs.
  const result = await (db as Db).execute<{ severity: string | null; cnt: string }>(sql`
    SELECT severity, COUNT(*)::text AS cnt
    FROM ${vocs}
    WHERE workspace_id = ${workspaceId}
      AND primary_managed_system_id = ANY(${sqlUuidArray(diffMsIds)})
      AND archived_at IS NULL
    GROUP BY severity
  `);

  const rows = result.rows;
  const total = rows.reduce((acc, r) => acc + parseInt(r.cnt, 10), 0);

  // Zero VOCs in diff → null.
  if (total === 0) return null;

  const dist: Record<'low' | 'medium' | 'high' | 'critical', number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const row of rows) {
    const sev = row.severity;
    if (sev && sev in dist) {
      dist[sev as 'low' | 'medium' | 'high' | 'critical'] += parseInt(row.cnt, 10);
    }
    // null severity rows are excluded from histogram per spec.
  }

  return { count: total, severity_distribution: dist };
}

// ── selectPermissionDecisionsSeed ─────────────────────────────────────────────

export async function selectPermissionDecisionsSeed(
  db: Db | Tx,
  vocId: string,
): Promise<unknown | null> {
  const result = await (db as Db).execute<{ envelope: unknown }>(sql`
    SELECT envelope
    FROM ${vocPermissionDecisionsSeedFixture}
    WHERE voc_id = ${vocId}
  `);
  return result.rows[0]?.envelope ?? null;
}
