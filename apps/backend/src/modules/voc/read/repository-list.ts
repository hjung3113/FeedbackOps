// VOC list predicate, list/count queries, and out-of-scope summary.
import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { entityLinks } from '../../../db/schema/core.js';
import { vocClusterMembers } from '../../../db/schema/voc-cluster.js';
import { vocs } from '../../../db/schema/voc.js';
import { sqlTextArray, sqlUuidArray } from '../../../db/sql-arrays.js';
import type { Tx } from '../../../db/tx.js';
import { allManagedSystemIds } from '../../managed-systems/read-projections.js';
import type { Scope } from '../authorization.js';
import { SEVERITY_ORDINAL, SORT_CONFIG } from '../cursor.js';
import type { VocGroupedCountRow } from '../read-contract.js';
import { type VocReadRow, mapVocRow } from './repository-shared.js';

// ── listVocsForRead ──────────────────────────────────────────────────────────

export interface ListVocsRepoArgs {
  workspaceId: string;
  scopeFilter: Scope;
  view: 'inbox' | 'my' | 'triage';
  analyticsAreaId?: string;
  actorIdForMyFilter?: string; // required when view='my'
  tab?:
    | 'untriaged'
    | 'high'
    | 'unassigned'
    | 'similar'
    | 'no-link'
    | 'no-task'
    | 'high-no-link'
    | 'waiting';
  filterSeverity?: ('low' | 'medium' | 'high' | 'critical')[];
  filterReporterFacingStatus?: string[];
  filterOwner?: 'assigned' | 'unassigned';
  filterAnalyticsAreaUnset?: boolean;
  sort:
    | 'created_at:desc'
    | 'created_at:asc'
    | 'severity:asc'
    | 'severity:desc'
    | 'reporter_facing_status:asc'
    | 'triage_pinned';
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
    filterAnalyticsAreaUnset,
    analyticsAreaId,
  } = args;
  if (scopeFilter.kind === 'scoped' && scopeFilter.managedSystemIds.length === 0) return null;
  if (tab === 'similar') return null;

  const wheres: ReturnType<typeof sql>[] = [
    sql`workspace_id = ${workspaceId}`,
    sql`archived_at IS NULL`,
  ];
  if (scopeFilter.kind === 'scoped') {
    wheres.push(
      sql`primary_managed_system_id = ANY(${sqlUuidArray(scopeFilter.managedSystemIds)})`,
    );
  }
  if (view === 'my') {
    if (!actorIdForMyFilter) throw new Error('actorIdForMyFilter required for view=my');
    wheres.push(sql`reporter_id = ${actorIdForMyFilter}`);
  } else if (view === 'triage') {
    wheres.push(sql`triage_state IN ('untriaged','needs_more_information')`);
  }
  if (tab === 'untriaged') wheres.push(sql`triage_state = 'untriaged'`);
  else if (tab === 'high') wheres.push(sql`severity IN ('high', 'critical')`);
  else if (tab === 'unassigned') wheres.push(sql`owner_user_id IS NULL AND owner_team_id IS NULL`);
  else if (tab === 'waiting')
    wheres.push(sql`triage_state = 'untriaged' AND triage_state_review_postponed_at IS NOT NULL`);
  else if (tab === 'no-task') {
    wheres.push(sql`NOT EXISTS (
      SELECT 1 FROM ${entityLinks} el
      WHERE el.workspace_id = ${workspaceId} AND el.status = 'active'
        AND el.source_type = 'voc' AND el.source_id = ${vocs.id}
        AND el.target_type = 'task'
    )`);
  } else if (tab === 'no-link' || tab === 'high-no-link') {
    if (tab === 'high-no-link') wheres.push(sql`severity IN ('high', 'critical')`);
    // #513 N1: "no link" means "no direct follow-up link" — an active
    // entity_links row with this VOC as source and a follow-up target
    // (finding / task / task_request). voc ↔ voc related_to and rows that
    // only target this VOC do not count.
    // #513 N2: a follow-up also exists when one of the VOC's clusters has
    // an active voc_cluster → finding/task_request link. No cluster status
    // filter (the create path links from draft clusters) and no membership
    // soft-delete column exists; a detached link simply is not active.
    wheres.push(sql`NOT EXISTS (
      SELECT 1 FROM ${entityLinks} el
      WHERE el.workspace_id = ${workspaceId} AND el.status = 'active'
        AND el.source_type = 'voc' AND el.source_id = ${vocs.id}
        AND el.target_type IN ('finding', 'task', 'task_request')
    ) AND NOT EXISTS (
      SELECT 1 FROM ${vocClusterMembers} vcm
      WHERE vcm.voc_id = ${vocs.id}
        AND EXISTS (
          SELECT 1 FROM ${entityLinks} el
          WHERE el.workspace_id = ${workspaceId} AND el.status = 'active'
            AND el.source_type = 'voc_cluster' AND el.source_id = vcm.cluster_id
            AND el.target_type IN ('finding', 'task_request')
        )
    )`);
  }
  if (filterSeverity && filterSeverity.length > 0)
    wheres.push(sql`severity = ANY(${sqlTextArray(filterSeverity)})`);
  if (filterReporterFacingStatus && filterReporterFacingStatus.length > 0) {
    wheres.push(sql`reporter_facing_status = ANY(${sqlTextArray(filterReporterFacingStatus)})`);
  }
  if (filterOwner === 'assigned')
    wheres.push(sql`(owner_user_id IS NOT NULL OR owner_team_id IS NOT NULL)`);
  else if (filterOwner === 'unassigned')
    wheres.push(sql`owner_user_id IS NULL AND owner_team_id IS NULL`);
  if (filterAnalyticsAreaUnset) {
    wheres.push(sql`analytics_area_id IS NULL`);
  }
  if (analyticsAreaId !== undefined) {
    wheres.push(sql`analytics_area_id = ${analyticsAreaId}::uuid`);
  }
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

export async function countGroupedVocsForRead(
  db: Db | Tx,
  args: Pick<VocListPredicateArgs, 'workspaceId' | 'scopeFilter'>,
): Promise<VocGroupedCountRow[]> {
  const baseArgs: VocListPredicateArgs = { ...args, view: 'inbox' };
  const baseWheres = buildVocListPredicate(baseArgs);
  if (baseWheres === null) return [];

  // Derive each FILTER clause from the canonical list predicate to keep tab semantics aligned.
  const additionalPredicate = (query: Pick<VocListPredicateArgs, 'tab' | 'filterSeverity'>) => {
    const wheres = buildVocListPredicate({ ...baseArgs, ...query });
    if (wheres === null) return sql`false`;
    return sql.join(wheres.slice(baseWheres.length), sql` AND `);
  };
  const hasTaskLink = sql`EXISTS (
    SELECT 1 FROM ${entityLinks}
    WHERE ${entityLinks.workspaceId} = ${vocs.workspaceId}
      AND ${entityLinks.status} = 'active'
      AND ${entityLinks.sourceType} = 'voc'
      AND ${entityLinks.sourceId} = ${vocs.id}
      AND ${entityLinks.targetType} = 'task'
  )`;
  const result = await (db as Db).execute<{
    managed_system_id: string;
    analytics_area_id: string | null;
    total: number | string;
    unassigned: number | string;
    high_no_link: number | string;
    high_severity: number | string;
    with_task: number | string;
  }>(sql`
    SELECT
      ${vocs.primaryManagedSystemId}::text AS managed_system_id,
      ${vocs.analyticsAreaId}::text AS analytics_area_id,
      count(*)::int AS total,
      count(*) FILTER (WHERE ${additionalPredicate({ tab: 'unassigned' })})::int AS unassigned,
      count(*) FILTER (WHERE ${additionalPredicate({ tab: 'high-no-link' })})::int AS high_no_link,
      count(*) FILTER (
        WHERE ${additionalPredicate({ filterSeverity: ['high', 'critical'] })}
      )::int AS high_severity,
      count(*) FILTER (WHERE ${hasTaskLink})::int AS with_task
    FROM ${vocs}
    WHERE ${sql.join(baseWheres, sql` AND `)}
    GROUP BY ${vocs.primaryManagedSystemId}, ${vocs.analyticsAreaId}
    ORDER BY ${vocs.primaryManagedSystemId}::text, ${vocs.analyticsAreaId}::text
  `);

  return result.rows.map((row) => ({
    managed_system_id: row.managed_system_id,
    analytics_area_id: row.analytics_area_id,
    total: Number(row.total),
    unassigned: Number(row.unassigned),
    high_no_link: Number(row.high_no_link),
    high_severity: Number(row.high_severity),
    with_task: Number(row.with_task),
  }));
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
): Promise<{
  rows: VocReadRow[];
  hasMore: boolean;
  nextCursor: { sv: string | number; id: string } | null;
}> {
  const {
    workspaceId,
    scopeFilter,
    view,
    actorIdForMyFilter,
    tab,
    filterSeverity,
    filterReporterFacingStatus,
    filterOwner,
    sort,
    cursor,
    limit,
  } = args;

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
      const createdAt = parts.length >= 4 ? parts.slice(3).join('|') : (parts[2] ?? '');
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
      orderBySql =
        dir === 'asc'
          ? sql`(severity IS NULL) ASC, ${SEVERITY_ORDINAL_CASE} ASC NULLS LAST, id ASC`
          : sql`(severity IS NULL) ASC, ${SEVERITY_ORDINAL_CASE} DESC NULLS LAST, id DESC`;
    } else if (config.column === 'created_at') {
      orderBySql = dir === 'asc' ? sql`created_at ASC, id ASC` : sql`created_at DESC, id DESC`;
    } else {
      // reporter_facing_status
      orderBySql =
        dir === 'asc'
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
    const rawCreatedAt =
      (last._created_at_raw as string | undefined) ?? lastMapped.createdAt.toISOString();

    if (isTriage) {
      const unassignedInt =
        lastMapped.ownerUserId === null && lastMapped.ownerTeamId === null ? 1 : 0;
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

// ── outOfScopeSummary ─────────────────────────────────────────────────────────

export async function outOfScopeSummary(
  db: Db | Tx,
  args: {
    workspaceId: string;
    effectiveScope: Scope;
    readScope: Scope;
  },
): Promise<{
  count: number;
  severity_distribution: Record<'low' | 'medium' | 'high' | 'critical', number>;
} | null> {
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
  const total = rows.reduce((acc, r) => acc + Number.parseInt(r.cnt, 10), 0);

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
      dist[sev as 'low' | 'medium' | 'high' | 'critical'] += Number.parseInt(row.cnt, 10);
    }
    // null severity rows are excluded from histogram per spec.
  }

  return { count: total, severity_distribution: dist };
}
