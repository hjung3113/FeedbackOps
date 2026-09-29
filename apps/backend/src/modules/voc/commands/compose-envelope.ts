// Shared VOC mutation envelope projection.
import type { ReporterFacingStatus } from '../transitions.js';
import type { VocEnvelope } from '../service.js';

export function composeEnvelope(
  row: {
    id: string;
    displayId: string;
    workspaceId: string;
    primaryManagedSystemId: string;
    analyticsAreaId: string | null;
    reporterId: string;
    title: string;
    descriptionRichContent: unknown;
    severity: VocEnvelope['severity'];
    reporterFacingStatus: string;
    triageState: VocEnvelope['triage_state'];
    ownerUserId: string | null;
    ownerTeamId: string | null;
    sourceContext: string;
    createdAt: Date;
    updatedAt: Date;
  },
  nextStates: {
    allowed: ReporterFacingStatus[];
    forbidden: Partial<Record<ReporterFacingStatus, string>>;
  },
): VocEnvelope {
  return {
    id: row.id,
    display_id: row.displayId,
    workspace_id: row.workspaceId,
    primary_managed_system_id: row.primaryManagedSystemId,
    analytics_area_id: row.analyticsAreaId,
    reporter_id: row.reporterId,
    title: row.title,
    description_rich_content: row.descriptionRichContent,
    severity: row.severity,
    reporter_facing_status: row.reporterFacingStatus as ReporterFacingStatus,
    triage_state: row.triageState,
    owner_user_id: row.ownerUserId,
    owner_team_id: row.ownerTeamId,
    source_context: row.sourceContext,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    next_actions: [],
    next_reporter_states: nextStates,
    permission_decisions: {},
  };
}
