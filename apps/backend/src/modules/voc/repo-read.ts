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
import { entityLinks } from '../../db/schema/core.js';
import {
  vocInternalComments,
  vocPermissionDecisionsSeedFixture,
  vocPublicUpdates,
  vocReporterReplies,
  vocs,
} from '../../db/schema/voc.js';
import type { Tx } from '../../db/tx.js';
import { allManagedSystemIds } from '../core/managed-systems/read-projections.js';
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
 * Effective scope: union of voc.read and voc.triage grants for the actor.
 * Admin role → 'all'. MS-scoped grants → union of both capability MS lists.
 *
 * WHY: using undefined (any capability) let future non-VOC capabilities
 * widen VOC summary visibility, creating an unintended existence-probe
 * surface. Restricting to voc.read ∪ voc.triage bounds the effective
 * scope to capabilities that are semantically relevant to VOC reads (M1).
 *
 * Used for out_of_scope_summary visibility and detail-existence-probe defense.
 */
export async function actorEffectiveScope(
  db: Db | Tx,
  actor: ActorContextLite,
): Promise<Scope> {
  if (actor.role_level === 'admin') {
    return { kind: 'all' };
  }
  const [readScope, triageScope] = await Promise.all([
    actorScopeForCapability(db, actor as ScopeActorContext, 'voc.read'),
    actorScopeForCapability(db, actor as ScopeActorContext, 'voc.triage'),
  ]);
  // Union: if either is 'all', effective scope is 'all'.
  if (readScope.kind === 'all' || triageScope.kind === 'all') {
    return { kind: 'all' };
  }
  const unionIds = [...new Set([...readScope.managedSystemIds, ...triageScope.managedSystemIds])];
  return { kind: 'scoped', managedSystemIds: unionIds };
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
  tab?: 'untriaged' | 'high' | 'unassigned' | 'similar' | 'no-link' | 'high-no-link' | 'waiting';
  filterSeverity?: ('low' | 'medium' | 'high' | 'critical')[];
  filterReporterFacingStatus?: string[];
  filterOwner?: 'assigned' | 'unassigned';
  sort: 'created_at:desc' | 'created_at:asc' | 'severity:asc' | 'severity:desc' | 'reporter_facing_status:asc' | 'triage_pinned';
  cursor?: { sv: string | number; id: string };
  limit: number;
}

type VocListPredicateArgs = Omit<ListVocsRepoArgs, 'sort' | 'cursor' | 'limit'>;

/**
 * The canonical list/count predicate.  Keep navigation counts on this path so
 * a badge cannot silently drift from the corresponding VOC list.
 */
export function buildVocListPredicate(args: VocListPredicateArgs): ReturnType<typeof sql>[] | null {
  const {
    workspaceId,
    scopeFilter,
    view,
    actorIdForMyFilter,
    tab,
    filterSeverity,
    filterReporterFacingStatus,
    filterOwner,
  } = args;
  if (scopeFilter.kind === 'scoped' && scopeFilter.managedSystemIds.length === 0) return null;
  if (tab === 'similar') return null;

  const wheres: ReturnType<typeof sql>[] = [
    sql`workspace_id = ${workspaceId}`,
    sql`archived_at IS NULL`,
  ];
  if (scopeFilter.kind === 'scoped') {
    wheres.push(sql`primary_managed_system_id = ANY(${sqlUuidArray(scopeFilter.managedSystemIds)})`);
  }
  if (view === 'my') {
    if (!actorIdForMyFilter) throw new Error('actorIdForMyFilter required for view=my');
    wheres.push(sql`reporter_id = ${actorIdForMyFilter}`);
  } else if (view === 'triage') {
    wheres.push(sql`triage_state IN ('untriaged','needs_more_information')`);
  }
  if (tab === 'untriaged') wheres.push(sql`triage_state = 'untriaged'`);
  else if (tab === 'high') wheres.push(sql`severity = 'high'`);
  else if (tab === 'unassigned') wheres.push(sql`owner_user_id IS NULL AND owner_team_id IS NULL`);
  else if (tab === 'waiting') wheres.push(sql`triage_state = 'untriaged' AND triage_state_review_postponed_at IS NOT NULL`);
  else if (tab === 'no-link' || tab === 'high-no-link') {
    if (tab === 'high-no-link') wheres.push(sql`severity IN ('high', 'critical')`);
    wheres.push(sql`NOT EXISTS (
      SELECT 1 FROM ${entityLinks} el
      WHERE el.workspace_id = ${workspaceId} AND el.status = 'active'
        AND ((el.source_type = 'voc' AND el.source_id = ${vocs.id})
          OR (el.target_type = 'voc' AND el.target_id = ${vocs.id}))
    )`);
  }
  if (filterSeverity && filterSeverity.length > 0) wheres.push(sql`severity = ANY(${sqlTextArray(filterSeverity)})`);
  if (filterReporterFacingStatus && filterReporterFacingStatus.length > 0) {
    wheres.push(sql`reporter_facing_status = ANY(${sqlTextArray(filterReporterFacingStatus)})`);
  }
  if (filterOwner === 'assigned') wheres.push(sql`(owner_user_id IS NOT NULL OR owner_team_id IS NOT NULL)`);
  else if (filterOwner === 'unassigned') wheres.push(sql`owner_user_id IS NULL AND owner_team_id IS NULL`);
  return wheres;
}

export async function countVocsForRead(db: Db | Tx, args: VocListPredicateArgs): Promise<number> {
  const wheres = buildVocListPredicate(args);
  if (wheres === null) return 0;
  const result = await (db as Db).execute<{ count: number | string }>(sql`
    SELECT count(*)::int AS count FROM ${vocs} WHERE ${sql.join(wheres, sql` AND `)}
  `);
  return Number(result.rows[0]?.count ?? 0);
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

// Severity ordinal CASE expression for SQL (ordinal 1..4 for low..critical;
// NULL is excluded from CASE so it evaluates to SQL NULL).
// WHY: using ELSE 0 made nulls sort first in DESC (0 < any ordinal).
// Fix (M6): use a separate IS NULL flag so nulls always sort last in both
// ASC and DESC: ORDER BY (severity IS NULL) ASC, severity_ord ASC|DESC.
// The IS NULL flag (false=0, true=1) sorts NULLs to the end of any direction.
const SEVERITY_ORDINAL_CASE = sql<number>`
  CASE severity
    WHEN 'low'      THEN 1
    WHEN 'medium'   THEN 2
    WHEN 'high'     THEN 3
    WHEN 'critical' THEN 4
    ELSE NULL
  END`;

export async function listVocsForRead(
  db: Db | Tx,
  args: ListVocsRepoArgs,
): Promise<{ rows: VocReadRow[]; hasMore: boolean; nextCursor: { sv: string | number; id: string } | null }> {
  const { workspaceId, scopeFilter, view, actorIdForMyFilter, tab, filterSeverity, filterReporterFacingStatus, filterOwner, sort, cursor, limit } = args;

  const wheres = buildVocListPredicate(args);
  if (wheres === null) return { rows: [], hasMore: false, nextCursor: null };

  // Determine sort order and cursor predicate.
  // triage_pinned uses a server-pinned composite sort; others use SORT_CONFIG.
  const isTriage = sort === 'triage_pinned';
  const fetchLimit = limit + 1;

  let querySql: ReturnType<typeof sql>;

  if (isTriage) {
    // Triage pinned sort: unassigned_first DESC, severity_ord DESC (nulls last),
    // created_at ASC, id ASC.
    // Cursor sv encodes composite as `${unassignedBool}|${sevOrd}|${isNull}|${createdAtIso}`.
    // WHY: null severity must sort after all real severities (M6 fix). We encode
    // an isNull flag in the cursor so the predicate can correctly handle null rows.
    const whereClause = sql.join(wheres, sql` AND `);

    let cursorPredicate = sql`true`;
    if (cursor) {
      // Cursor sv format: `${unassigned}|${sevOrd}|${isNull}|${createdAt}`
      // For backward compat, support old 3-part format too (isNull defaults to '0').
      const parts = String(cursor.sv).split('|');
      const unassignedBool = parts[0] === '1';
      const sevOrd = Number(parts[1]);
      const isNullBool = parts[2] === '1';
      const createdAt = parts.length >= 4 ? parts.slice(3).join('|') : parts[2] ?? '';
      // Triage sort: (unassigned DESC, isNull ASC, sevOrd DESC, createdAt ASC, id ASC).
      // "after cursor" means the row comes later in this ordering.
      cursorPredicate = sql`(
        (owner_user_id IS NULL AND owner_team_id IS NULL)::int < ${unassignedBool ? 1 : 0}
        OR (
          (owner_user_id IS NULL AND owner_team_id IS NULL)::int = ${unassignedBool ? 1 : 0}
          AND (severity IS NULL)::int > ${isNullBool ? 1 : 0}
        )
        OR (
          (owner_user_id IS NULL AND owner_team_id IS NULL)::int = ${unassignedBool ? 1 : 0}
          AND (severity IS NULL)::int = ${isNullBool ? 1 : 0}
          AND (severity IS NOT NULL AND ${SEVERITY_ORDINAL_CASE} < ${sevOrd})
        )
        OR (
          (owner_user_id IS NULL AND owner_team_id IS NULL)::int = ${unassignedBool ? 1 : 0}
          AND (severity IS NULL)::int = ${isNullBool ? 1 : 0}
          AND (severity IS NULL OR ${SEVERITY_ORDINAL_CASE} = ${sevOrd})
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
        (severity IS NULL) ASC,
        ${SEVERITY_ORDINAL_CASE} DESC NULLS LAST,
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
        // Cursor sv format for severity sort: `${isNull}|${sevOrd}`.
        // WHY: null severity always sorts last (M6 fix); we need the null flag to
        // correctly paginate past null-severity rows in both ASC and DESC.
        const svStr = String(cursor.sv);
        const [isNullStr, sevOrdStr] = svStr.includes('|') ? svStr.split('|') : ['0', svStr];
        const isNullBool = isNullStr === '1';
        const sevOrd = Number(sevOrdStr);
        if (dir === 'asc') {
          // ORDER: (isNull ASC, sevOrd ASC NULLS LAST, id ASC). "After cursor" rows satisfy:
          cursorPredicate = sql`(
            (severity IS NULL)::int > ${isNullBool ? 1 : 0}
            OR (
              (severity IS NULL)::int = ${isNullBool ? 1 : 0}
              AND severity IS NOT NULL
              AND ${SEVERITY_ORDINAL_CASE} > ${sevOrd}
            )
            OR (
              (severity IS NULL)::int = ${isNullBool ? 1 : 0}
              AND (severity IS NULL OR ${SEVERITY_ORDINAL_CASE} = ${sevOrd})
              AND id > ${cursor.id}::uuid
            )
          )`;
        } else {
          // ORDER: (isNull ASC, sevOrd DESC NULLS LAST, id DESC). "After cursor" rows satisfy:
          cursorPredicate = sql`(
            (severity IS NULL)::int > ${isNullBool ? 1 : 0}
            OR (
              (severity IS NULL)::int = ${isNullBool ? 1 : 0}
              AND severity IS NOT NULL
              AND ${SEVERITY_ORDINAL_CASE} < ${sevOrd}
            )
            OR (
              (severity IS NULL)::int = ${isNullBool ? 1 : 0}
              AND (severity IS NULL OR ${SEVERITY_ORDINAL_CASE} = ${sevOrd})
              AND id < ${cursor.id}::uuid
            )
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
    // WHY (M6): severity nulls always last — prepend (severity IS NULL) ASC flag.
    let orderBySql: ReturnType<typeof sql>;
    if (config.severityOrdinal) {
      orderBySql = dir === 'asc'
        ? sql`(severity IS NULL) ASC, ${SEVERITY_ORDINAL_CASE} ASC NULLS LAST, id ASC`
        : sql`(severity IS NULL) ASC, ${SEVERITY_ORDINAL_CASE} DESC NULLS LAST, id DESC`;
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
      const isNullInt = lastMapped.severity === null ? 1 : 0;
      const sevOrd = lastMapped.severity ? (SEVERITY_ORDINAL[lastMapped.severity] ?? 0) : 0;
      // Encode: `${unassigned}|${sevOrd}|${isNull}|${createdAt}` (M6: added isNull flag)
      nextCursor = { sv: `${unassignedInt}|${sevOrd}|${isNullInt}|${rawCreatedAt}`, id: lastId };
    } else {
      const config = SORT_CONFIG[sort as keyof typeof SORT_CONFIG];
      let sv: string | number;
      if (config.severityOrdinal) {
        // Encode: `${isNull}|${sevOrd}` so cursor predicate can handle nulls last (M6)
        const isNullInt = lastMapped.severity === null ? 1 : 0;
        const sevOrd = lastMapped.severity ? (SEVERITY_ORDINAL[lastMapped.severity] ?? 0) : 0;
        sv = `${isNullInt}|${sevOrd}`;
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
  workspaceId: string;    // defense-in-depth: JOIN to voc.vocs v AND v.workspace_id (M2)
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
  const { workspaceId, vocId, actorId, canTriage, isReporter, cursor, limit, kind } = args;

  const fetchLimit = limit + 1;

  // Build UNION ALL branches based on visibility flags and optional kind filter.
  // WHY (M2): each branch JOINs voc.vocs to enforce workspace_id + archived_at
  // as defense-in-depth even though the service fetches the VOC first.
  // Cursor predicate is inlined per branch with the table alias to avoid
  // ambiguous column references (JOIN adds v.id, v.created_at etc.).
  const branches: ReturnType<typeof sql>[] = [];

  // public_update branch — always included (everyone with VOC access sees public).
  if (!kind || kind === 'public_update') {
    const puCursor = cursor
      ? sql`(pu.created_at < ${cursor.createdAt}::timestamptz OR (pu.created_at = ${cursor.createdAt}::timestamptz AND pu.id < ${cursor.id}::uuid))`
      : sql`true`;
    branches.push(sql`
      SELECT
        pu.id, 'public_update'::text AS kind, pu.actor_id,
        pu.body_rich_content, pu.created_at, pu.created_at::text AS _created_at_raw,
        'public'::text AS visibility,
        pu.reporter_facing_status_before,
        pu.reporter_facing_status_after,
        pu.skip_public_update,
        pu.skip_reason
      FROM ${vocPublicUpdates} pu
      JOIN ${vocs} v ON v.id = pu.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
      WHERE pu.voc_id = ${vocId}
        AND ${puCursor}
    `);
  }

  // reporter_reply branch — visibility depends on role (B2 fix).
  // canTriage → sees all reporter_replies.
  // !canTriage && isReporter → sees own replies only (WHERE actor_id = actorId).
  // !canTriage && !isReporter → omit branch entirely (read-only non-reporter sees public only).
  if (!kind || kind === 'reporter_reply') {
    const rrCursor = cursor
      ? sql`(rr.created_at < ${cursor.createdAt}::timestamptz OR (rr.created_at = ${cursor.createdAt}::timestamptz AND rr.id < ${cursor.id}::uuid))`
      : sql`true`;

    if (canTriage) {
      branches.push(sql`
        SELECT
          rr.id, 'reporter_reply'::text AS kind, rr.actor_id,
          rr.body_rich_content, rr.created_at, rr.created_at::text AS _created_at_raw,
          'reporter'::text AS visibility,
          NULL::text AS reporter_facing_status_before,
          NULL::text AS reporter_facing_status_after,
          NULL::boolean AS skip_public_update,
          NULL::text AS skip_reason
        FROM ${vocReporterReplies} rr
        JOIN ${vocs} v ON v.id = rr.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
        WHERE rr.voc_id = ${vocId}
          AND ${rrCursor}
      `);
    } else if (isReporter) {
      branches.push(sql`
        SELECT
          rr.id, 'reporter_reply'::text AS kind, rr.actor_id,
          rr.body_rich_content, rr.created_at, rr.created_at::text AS _created_at_raw,
          'reporter'::text AS visibility,
          NULL::text AS reporter_facing_status_before,
          NULL::text AS reporter_facing_status_after,
          NULL::boolean AS skip_public_update,
          NULL::text AS skip_reason
        FROM ${vocReporterReplies} rr
        JOIN ${vocs} v ON v.id = rr.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
        WHERE rr.voc_id = ${vocId}
          AND ${rrCursor}
          AND rr.actor_id = ${actorId}
      `);
    }
    // WHY: !canTriage && !isReporter → omit reporter_replies branch entirely.
    // Spec: non-triage, non-reporter read actors see public_updates only.
  }

  // internal_comment branch — only if canTriage.
  if (canTriage && (!kind || kind === 'internal_comment')) {
    const icCursor = cursor
      ? sql`(ic.created_at < ${cursor.createdAt}::timestamptz OR (ic.created_at = ${cursor.createdAt}::timestamptz AND ic.id < ${cursor.id}::uuid))`
      : sql`true`;
    branches.push(sql`
      SELECT
        ic.id, 'internal_comment'::text AS kind, ic.actor_id,
        ic.body_rich_content, ic.created_at, ic.created_at::text AS _created_at_raw,
        'internal'::text AS visibility,
        NULL::text AS reporter_facing_status_before,
        NULL::text AS reporter_facing_status_after,
        NULL::boolean AS skip_public_update,
        NULL::text AS skip_reason
      FROM ${vocInternalComments} ic
      JOIN ${vocs} v ON v.id = ic.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
      WHERE ic.voc_id = ${vocId}
        AND ${icCursor}
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
    // WHY: normalize postgres text format to ISO 8601 (replace space with T,
    // keep microsecond precision) so the cursor: (a) validates with
    // z.string().datetime() in decodeConversationCursor, and (b) preserves
    // full microsecond precision for correct tie-breaking in the cursor predicate.
    // Postgres text format: "2026-05-18 17:19:45.160586+00"
    // ISO 8601 format:      "2026-05-18T17:19:45.160586+00:00"
    const rawCreatedAt = (last._created_at_raw as string | undefined)
      ? String(last._created_at_raw).replace(' ', 'T').replace(/\+00$/, '+00:00')
      : toDate(last.created_at as Date | string).toISOString();
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

// ── selectVocAttachments / selectAttachmentsForComments (PLAN-22 §Bug-1) ────
//
// Read-side projections for the `voc_attachments` table. These power the
// `attachments[]` field on `VocDetailEnvelope` and on each
// `ConversationEntry`.
//
// Filters: `archived_at IS NULL` (active rows only). Ordered by `created_at`
// ASC, `id` ASC for deterministic surface.

export interface LinkedAttachmentReadRow {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  uploaded_by_actor_id: string;
  created_at: Date;
  linked_at: Date;
}

function mapAttachmentRow(row: Record<string, unknown>): LinkedAttachmentReadRow {
  const sb = row.size_bytes as string | number;
  return {
    id: row.id as string,
    name: row.name as string,
    size_bytes: typeof sb === 'string' ? Number(sb) : sb,
    mime_type: row.mime_type as string,
    uploaded_by_actor_id: row.uploaded_by_actor_id as string,
    created_at: toDate(row.created_at as Date | string),
    linked_at: toDate(row.linked_at as Date | string),
  };
}

/**
 * Fetch all VOC-body-linked attachments for one VOC.
 * Uses the `voc_attachments_active_idx` partial index (vocId, archived_at IS NULL).
 *
 * Defense-in-depth: caller already validated workspace via selectVocByIdForRead;
 * we additionally constrain via JOIN to voc.vocs (workspace_id + archived_at).
 */
export async function selectVocAttachments(
  db: Db | Tx,
  workspaceId: string,
  vocId: string,
): Promise<LinkedAttachmentReadRow[]> {
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT a.id, a.name, a.size_bytes, a.mime_type, a.uploaded_by_actor_id,
           a.created_at, a.linked_at
      FROM voc.voc_attachments a
      JOIN ${vocs} v ON v.id = a.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
     WHERE a.voc_id = ${vocId}
       AND a.archived_at IS NULL
     ORDER BY a.created_at ASC, a.id ASC
  `);
  return result.rows.map(mapAttachmentRow);
}

/**
 * Bulk-fetch attachments linked to a set of comment ids. Returns a map from
 * comment_id → attachments[] (in deterministic created_at/id order).
 *
 * One query per VOC detail call covers ALL inline conversation entries.
 * Empty `commentIds` short-circuits to {}.
 */
export async function selectAttachmentsForComments(
  db: Db | Tx,
  workspaceId: string,
  commentIds: string[],
): Promise<Map<string, LinkedAttachmentReadRow[]>> {
  const out = new Map<string, LinkedAttachmentReadRow[]>();
  if (commentIds.length === 0) return out;

  // JOIN to voc.vocs is via the attached comment_kind table — but the
  // attachment rows themselves do not carry workspace_id (per schema comment
  // in attachments/repo.ts). The link to a VOC is via comment_id → comment
  // → voc_id. We accept the looser defense-in-depth here (comment_id is the
  // PK we already trust, validated transitively via the parent VOC fetch
  // in read-service), and just filter by comment_id IN (...) AND
  // archived_at IS NULL.
  //
  // workspaceId is kept as a parameter for future hardening (e.g. a per-row
  // workspace_id column) without changing the call signature.
  void workspaceId;
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT id, name, size_bytes, mime_type, uploaded_by_actor_id,
           created_at, linked_at, comment_id
      FROM voc.voc_attachments
     WHERE comment_id = ANY(${sqlUuidArray(commentIds)})
       AND archived_at IS NULL
     ORDER BY created_at ASC, id ASC
  `);
  for (const raw of result.rows) {
    const cid = raw.comment_id as string;
    const arr = out.get(cid) ?? [];
    arr.push(mapAttachmentRow(raw));
    out.set(cid, arr);
  }
  return out;
}

// ── selectVocAttachmentCounts (PLAN-22 §Bug-1) ───────────────────────────────
//
// Bulk-fetch `count(*)` of active attachments grouped by voc_id for a set of
// VOC ids. Used by listVocsForRead to project `attachment_count` per row
// without an N+1 — one extra query covers the page.

export async function selectVocAttachmentCounts(
  db: Db | Tx,
  vocIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (vocIds.length === 0) return out;
  const result = await (db as Db).execute<{ voc_id: string; cnt: string }>(sql`
    SELECT voc_id, COUNT(*)::text AS cnt
      FROM voc.voc_attachments
     WHERE voc_id = ANY(${sqlUuidArray(vocIds)})
       AND archived_at IS NULL
     GROUP BY voc_id
  `);
  for (const row of result.rows) {
    out.set(row.voc_id, parseInt(row.cnt, 10));
  }
  return out;
}

// ── Similar VOC projections (ADR-0031) ──────────────────────────────────────
//
// The peer predicate is deliberately expressed here, rather than inferred from
// source-VOC access: a reporter can read their own source VOC without voc.read,
// but must not learn whether other reporters submitted peers. Every peer is
// therefore constrained by the actor's voc.read scope OR reporter ownership.

export interface SimilarVocReadItem {
  id: string;
  displayId: string;
  title: string;
  reporterFacingStatus: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
}

/**
 * The ADR-0031 VOC visibility rule, and the only copy of it.
 *
 * A VOC other than the actor's own source is visible when its Managed System
 * is in the actor's `voc.read` scope, or the actor reported it. Both the
 * ADR-0031 similar-peer projections below and the ADR-0034 recommendation read
 * model (`recommendations/repo.ts`) call this one function; ADR-0034 D4 says
 * the recommendation surface *reuses* this rule rather than deriving one of
 * its own, and reuse means calling it, not restating it.
 *
 * It was briefly restated in `recommendations/scope.ts` because that query
 * aliases the VOC differently — which is why the alias is a parameter now. A
 * second body is not worth an aliasing difference: a future change to the
 * scope semantics (a team-based arm, a different resolution of `kind: 'all'`)
 * would be made in one copy, the other would keep authorizing under the old
 * rule, and the divergence would leak VOC existence with nothing failing.
 *
 * `vocAlias` is a table alias, not a value — callers supply e.g. sql`p`.
 * `__tests__/voc-visibility-predicate.integration.test.ts` pins the verdict
 * matrix and asserts both surfaces admit the same VOCs on one fixture.
 */
export function similarVocVisibilityPredicate(
  readScope: Scope,
  actorId: string,
  vocAlias: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (readScope.kind === 'all') return sql`true`;
  return sql`(
    ${vocAlias}.primary_managed_system_id = ANY(${sqlUuidArray(readScope.managedSystemIds)})
    OR ${vocAlias}.reporter_id = ${actorId}
  )`;
}

/** Bulk count for a list page. One query covers every returned source VOC. */
export async function selectSimilarVocCounts(
  db: Db | Tx,
  args: { workspaceId: string; sourceVocIds: string[]; actorId: string; readScope: Scope },
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { workspaceId, sourceVocIds, actorId, readScope } = args;
  if (sourceVocIds.length === 0) return out;
  const peerVisible = similarVocVisibilityPredicate(readScope, actorId, sql`p`);
  const result = await (db as Db).execute<{ source_voc_id: string; cnt: string }>(sql`
    SELECT source.id AS source_voc_id, COUNT(p.id)::text AS cnt
      FROM ${vocs} source
      JOIN ${vocs} p
        ON p.workspace_id = source.workspace_id
       AND p.primary_managed_system_id = source.primary_managed_system_id
       AND p.archived_at IS NULL
       AND p.id <> source.id
       AND ${peerVisible}
     WHERE source.workspace_id = ${workspaceId}
       AND source.id = ANY(${sqlUuidArray(sourceVocIds)})
       AND source.archived_at IS NULL
     GROUP BY source.id
  `);
  for (const row of result.rows) out.set(row.source_voc_id, parseInt(row.cnt, 10));
  return out;
}

export async function selectSimilarVocCount(
  db: Db | Tx,
  args: {
    workspaceId: string;
    sourceVocId: string;
    primaryManagedSystemId: string;
    actorId: string;
    readScope: Scope;
  },
): Promise<number> {
  const { workspaceId, sourceVocId, primaryManagedSystemId, actorId, readScope } = args;
  const peerVisible = similarVocVisibilityPredicate(readScope, actorId, sql`p`);
  const result = await (db as Db).execute<{ cnt: string }>(sql`
    SELECT COUNT(p.id)::text AS cnt
      FROM ${vocs} p
     WHERE p.workspace_id = ${workspaceId}
       AND p.primary_managed_system_id = ${primaryManagedSystemId}
       AND p.archived_at IS NULL
       AND p.id <> ${sourceVocId}
       AND ${peerVisible}
  `);
  return parseInt(result.rows[0]?.cnt ?? '0', 10);
}

export async function selectSimilarVocItems(
  db: Db | Tx,
  args: {
    workspaceId: string;
    sourceVocId: string;
    primaryManagedSystemId: string;
    actorId: string;
    readScope: Scope;
  },
): Promise<SimilarVocReadItem[]> {
  const { workspaceId, sourceVocId, primaryManagedSystemId, actorId, readScope } = args;
  const peerVisible = similarVocVisibilityPredicate(readScope, actorId, sql`p`);
  const result = await (db as Db).execute<Record<string, unknown>>(sql`
    SELECT p.id, p.display_id, p.title, p.reporter_facing_status, p.severity
      FROM ${vocs} p
     WHERE p.workspace_id = ${workspaceId}
       AND p.primary_managed_system_id = ${primaryManagedSystemId}
       AND p.archived_at IS NULL
       AND p.id <> ${sourceVocId}
       AND ${peerVisible}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT 3
  `);
  return result.rows.map((row) => ({
    id: row.id as string,
    displayId: row.display_id as string,
    title: row.title as string,
    reporterFacingStatus: row.reporter_facing_status as string,
    severity: (row.severity as SimilarVocReadItem['severity']) ?? null,
  }));
}

// ── selectPermissionDecisionsSeed ─────────────────────────────────────────────

export async function selectPermissionDecisionsSeed(
  db: Db | Tx,
  workspaceId: string,
  vocId: string,
): Promise<unknown | null> {
  // WHY (M2): JOIN to voc.vocs enforces workspace_id + archived_at as
  // defense-in-depth even though the service validated the VOC first.
  const result = await (db as Db).execute<{ envelope: unknown }>(sql`
    SELECT f.envelope
    FROM ${vocPermissionDecisionsSeedFixture} f
    JOIN ${vocs} v ON v.id = f.voc_id AND v.workspace_id = ${workspaceId} AND v.archived_at IS NULL
    WHERE f.voc_id = ${vocId}
  `);
  return result.rows[0]?.envelope ?? null;
}
