// Shared VOC repository row shape and row/date mapping.

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
// Utility: normalise raw postgres row dates.
export function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}
function toDateOrNull(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v : new Date(v);
}

export function mapVocRow(row: Record<string, unknown>): VocReadRow {
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
    triageStateReviewPostponedAt: toDateOrNull(
      row.triage_state_review_postponed_at as Date | string | null | undefined,
    ),
    sourceContext: row.source_context as string,
    // For list rows, descriptionRichContent is null (heavy column not fetched).
    descriptionRichContent: row.description_rich_content ?? null,
    createdAt: toDate(row.created_at as Date | string),
    updatedAt: toDate(row.updated_at as Date | string),
  };
}
