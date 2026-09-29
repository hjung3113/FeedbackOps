// VOC body and conversation attachment read projections.
import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import { vocs } from '../../../db/schema/voc.js';
import { sqlUuidArray } from '../../../db/sql-arrays.js';
import type { Tx } from '../../../db/tx.js';
import { toDate } from './repository-shared.js';

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
    out.set(row.voc_id, Number.parseInt(row.cnt, 10));
  }
  return out;
}

