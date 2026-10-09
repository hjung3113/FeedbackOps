// VOC read model mappers for lists, details, attachments, and conversation rows.
import type {
  ConversationEntry,
  LinkedAttachment,
  VocDetailEnvelope,
  VocListItem,
} from '@fops/shared';
import type {
  ConversationRow,
  LinkedAttachmentReadRow,
  SimilarVocReadItem,
  VocReadRow,
} from '../repo-read.js';

// ── Row mappers ──────────────────────────────────────────────────────────────

export function mapRowToListItem(
  row: VocReadRow,
  attachmentCount = 0,
  similarCount = 0,
): VocListItem {
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
    review_postponed_at: row.triageStateReviewPostponedAt?.toISOString() ?? null,
    source_context: row.sourceContext as VocListItem['source_context'],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    similar_count: similarCount,
    // PLAN-22 §Bug-1: populated by listVocs via bulk subquery.
    attachment_count: attachmentCount,
  };
}

export function mapSimilarItems(items: SimilarVocReadItem[]): VocDetailEnvelope['similar'] {
  return {
    items: items.map((item) => ({
      id: item.id,
      display_id: item.displayId,
      title: item.title,
      reporter_facing_status:
        item.reporterFacingStatus as VocDetailEnvelope['reporter_facing_status'],
      severity: item.severity,
    })),
  };
}

// PLAN-22 §Bug-1: read-row → wire-shape mapper for linked attachments.
export function mapAttachmentRow(row: LinkedAttachmentReadRow): LinkedAttachment {
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
export function mapConversationRowsWithAttachments(
  rows: ConversationRow[],
  attachmentsByCommentId: Map<string, LinkedAttachmentReadRow[]>,
): ConversationEntry[] {
  return rows.map((row) => {
    const linked = attachmentsByCommentId.get(row.id) ?? [];
    return mapConversationRow(row, linked.map(mapAttachmentRow));
  });
}
