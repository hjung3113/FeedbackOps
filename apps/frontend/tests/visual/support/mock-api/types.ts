import type { AdminSettingsVisualScenario } from '../../fixtures/admin-settings';
import type { HomeVisualScenario } from '../../fixtures/home';
import type { populatedInboxNotifications } from '../../fixtures/notifications';
import type {
  PermissionScenarioName,
  createPermissionRequestsScenario,
} from '../../fixtures/permissions';
import type { SurveyResultsVisualScenario } from '../../fixtures/survey-results';
import type { SurveyVisualScenario } from '../../fixtures/surveys';
import type { TriageAreaVisualScenario } from '../../fixtures/triage-analytics-area';
import type {
  IntegrationDashboardVisualScenario,
  ScenarioName,
  VisualScenario,
} from '../scenarios';

export type RoleLevel = 'admin' | 'developer' | 'user';

export interface InstallOptions {
  permissionScenario?: PermissionScenarioName;
  role?: RoleLevel;
  scenario?: ScenarioName;
  /** Issue #180 VOC detail surface; schemas validate its fixture at import. */
  vocReview?: boolean;
  /** Supplies a schema-validated VOC list for the High · no link inbox state. */
  inboxHighNoLink?: boolean;
  /** Issue #179 reporter-safe linked Task summary surface. */
  vocReporterTaskSummary?: boolean;
  surveyScenario?: SurveyVisualScenario;
  surveyResultsScenario?: SurveyResultsVisualScenario;
  /** ADR-0055 outcome follow-up review screen, with a holder response fixture. */
  surveyFollowUp?: boolean;
  adminSettingsScenario?: AdminSettingsVisualScenario;
  /** Rail/scope fixture uses two systems to make scope selector snapshots meaningful. */
  railScope?: boolean;
  /** Declares the saved-view sidebar visual state; its PNG is host-generated. */
  savedViews?: boolean;
  /** Home action dashboard fixture state. */
  home?: HomeVisualScenario;
  /** Populated Home Inbox state; the default notification response remains empty. */
  notifications?: 'populated';
  /** #513 coverage page fixture state: summary, systems, and analytics areas. */
  coverage?: 'populated' | 'empty';
  /** #532 Integration Action Dashboard summary and Managed System fixtures. */
  integrationDashboard?: IntegrationDashboardVisualScenario;
  /** Request-access confirmation dialog state; screenshot spec is host-owned. */
  permissionRequestCompose?: boolean;
  /** Managed System registration dialog with owner candidates; screenshot spec is host-owned. */
  managedSystemOwner?: boolean;
  /** Triage Analytics Area wiring and Finding inheritance states. */
  triageAreaScenario?: TriageAreaVisualScenario;
  /** VOC creation with a selected Managed System and pre-submit peers. */
  vocCreate?: boolean;
  /** Issue #399 Finding detail baseline surface; schemas validate fixtures at import. */
  findingDetail?: boolean;
  /**
   * #514 Milestone list surface: `true` serves the prototype-mirrored list,
   * `'empty'` serves an empty list; status-query params filter the fixture.
   * `'denied-detail'` keeps the populated list but answers the detail route
   * with 403 permission.denied so dismissal of an inaccessible selection is
   * observable in the browser. Fixtures validate against shared DTO schemas
   * at import.
   */
  milestones?: boolean | 'empty' | 'denied-detail';
}

export interface PostedRequest {
  body: unknown;
  idempotencyKey: string | null;
  pathname: string;
}

export interface SavedView {
  id: string;
  surface: string;
  name: string;
  filter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MockApiContext {
  options: InstallOptions;
  scenario: VisualScenario;
  postedBodies: unknown[];
  postedRequests: PostedRequest[];
  permissionRequests: ReturnType<typeof createPermissionRequestsScenario>;
  savedViews: SavedView[];
  notificationItems: Array<(typeof populatedInboxNotifications.items)[number]>;
  role: RoleLevel;
  reporterActorId: string;
}

export interface InstalledMockApi {
  postedBodies: unknown[];
  postedRequests: PostedRequest[];
  scenario: VisualScenario;
}
