export const roleLevels = ["Admin", "Developer", "User"] as const;
export type RoleLevel = (typeof roleLevels)[number];

export const reporterVocStatuses = [
  "접수됨",
  "검토 중",
  "담당자 배정됨",
  "처리 중",
  "해결 준비 중",
  "해결됨",
  "다시 처리 중",
  "종료됨"
] as const;
export type ReporterVocStatus = (typeof reporterVocStatuses)[number];

export const taskStatuses = [
  "Backlog",
  "Todo",
  "Doing",
  "Review",
  "Done",
  "Released",
  "Reopened"
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const relationTypes = [
  "created_finding",
  "generated_finding",
  "requested_task",
  "converted_to_task",
  "linked_task",
  "evidence_for"
] as const;
export type RelationType = (typeof relationTypes)[number];

export const forbiddenRelationTypes = ["generated_voc"] as const;

export type Visibility = "internal_only" | "summary_visible" | "visible_to_reporter" | "admin_only";
export type Severity = "low" | "medium" | "high" | "critical";
export type SourceContext = "direct_use" | "proxy_report" | "operational_discovery" | "stakeholder_request";

export interface Actor {
  id: string;
  workspaceId: string;
  name: string;
  roleLevel: RoleLevel;
  managedSystemIds: string[];
  explicitDeniedManagedSystemIds?: string[];
  capabilities?: string[];
}

export interface ManagedSystem {
  id: string;
  workspaceId: string;
  name: string;
  archived?: boolean;
}

export interface AnalyticsArea {
  id: string;
  workspaceId: string;
  managedSystemId: string;
  name: string;
  archived?: boolean;
}

export interface Voc {
  id: string;
  workspaceId: string;
  managedSystemId: string;
  analyticsAreaId?: string;
  reporterId: string;
  title: string;
  description: string;
  sourceContext?: SourceContext;
  severity?: Severity;
  triageState: "new" | "triaging" | "triaged";
  reporterFacingStatus: ReporterVocStatus;
  ownerId?: string;
}

export interface ConversationEntry {
  id: string;
  vocId: string;
  authorId: string;
  type: "public_update" | "reporter_reply" | "internal_comment";
  body: string;
  createdAt: string;
}

export interface EntityLink {
  id: string;
  workspaceId: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: RelationType;
  visibility: Visibility;
}

export interface Finding {
  id: string;
  workspaceId: string;
  managedSystemId: string;
  title: string;
  summary: string;
  status: "draft" | "active" | "not_actionable" | "converted" | "archived";
}

export interface TaskRequest {
  id: string;
  workspaceId: string;
  managedSystemId: string;
  title: string;
  status: "pending_review" | "approved" | "rejected" | "needs_more_evidence" | "converted";
  sourceType: "voc" | "finding";
  sourceId: string;
  requestedById: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  managedSystemId: string;
  title: string;
  status: TaskStatus;
  assigneeId?: string;
  priority?: "low" | "medium" | "high";
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export function isForbiddenRelationType(value: string): value is (typeof forbiddenRelationTypes)[number] {
  return forbiddenRelationTypes.includes(value as (typeof forbiddenRelationTypes)[number]);
}

export function richContentHasUnsafeInlineImage(value: string): boolean {
  return /<img[^>]+src=["'](?:data:|https?:\/\/)/i.test(value);
}
