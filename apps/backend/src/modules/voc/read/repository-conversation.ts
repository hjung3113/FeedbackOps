// VOC public update, reporter reply, and internal comment page query.
import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import {
  vocInternalComments,
  vocPublicUpdates,
  vocReporterReplies,
  vocs,
} from '../../../db/schema/voc.js';
import type { Tx } from '../../../db/tx.js';
import { normalizePgTimestampToIso } from '../../../lib/pg-timestamp.js';
import { toDate } from './repository-shared.js';

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
  workspaceId: string; // defense-in-depth: JOIN to voc.vocs v AND v.workspace_id (M2)
  vocId: string;
  actorId: string; // for reporter_reply visibility filter
  canTriage: boolean; // gates internal_comment + sees all reporter_replies
  isReporter: boolean; // when true && !canTriage → only own reporter_replies
  cursor?: { createdAt: string; id: string }; // (createdAt, id) pagination
  limit: number;
  kind?: ConversationKind;
}

export async function selectConversationPage(
  db: Db | Tx,
  args: SelectConversationPageArgs,
): Promise<{
  entries: ConversationRow[];
  hasMore: boolean;
  nextCursor: { createdAt: string; id: string } | null;
}> {
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

  const unionSql = branches.length === 1 ? branches[0]! : sql.join(branches, sql` UNION ALL `);

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
    // WHY: normalize postgres text format to ISO 8601 so the cursor: (a) validates with
    // z.string().datetime() in decodeConversationCursor, and (b) preserves
    // full microsecond precision for correct tie-breaking in the cursor predicate.
    // Postgres text format: "2026-05-18 17:19:45.160586+00"
    // ISO 8601 format:      "2026-05-18T17:19:45.160586+00:00"
    const rawCreatedAt = (last._created_at_raw as string | undefined)
      ? normalizePgTimestampToIso(String(last._created_at_raw))
      : toDate(last.created_at as Date | string).toISOString();
    nextCursor = {
      createdAt: rawCreatedAt,
      id: last.id as string,
    };
  }

  return { entries, hasMore, nextCursor };
}
