import {
  type AuditEventType,
  COVERAGE_METRIC_IDS,
  type CoverageThresholdPair,
  type CoverageThresholds,
  type WorkspaceSettingsUpdatedDetail,
  resolveCoverageThresholds,
} from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { ActorContext, CheckService } from '../permissions/check-service.js';
import {
  type PermissionSelfApproval,
  ensureAndLockWorkspaceSettings,
  findWorkspaceSettings,
  updateWorkspaceSettings,
} from './repo.js';

const UPDATED: AuditEventType = 'workspace_settings_updated';
const DEFAULT_PERMISSION_SELF_APPROVAL: PermissionSelfApproval = 'allowed';
const DEFAULT_SURVEY_ANONYMITY_THRESHOLD = 5;

export interface ResolvedWorkspaceSettings {
  voc_cluster_suggestions_enabled: boolean;
  coverage_thresholds: CoverageThresholds;
  permission_self_approval: PermissionSelfApproval;
  survey_anonymity_threshold: number;
}

export interface UpdateWorkspaceSettingsBody {
  voc_cluster_suggestions_enabled?: boolean | undefined;
  coverage_thresholds?:
    | Partial<Record<(typeof COVERAGE_METRIC_IDS)[number], CoverageThresholdPair | undefined>>
    | undefined;
  permission_self_approval?: PermissionSelfApproval | undefined;
  survey_anonymity_threshold?: number | undefined;
}

export interface WorkspaceSettingsServiceDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
}

export async function getResolvedWorkspaceSettings(
  db: Db | Tx,
  workspaceId: string,
): Promise<ResolvedWorkspaceSettings> {
  const row = await findWorkspaceSettings(db, workspaceId);
  return {
    voc_cluster_suggestions_enabled: row?.voc_cluster_suggestions_enabled ?? false,
    coverage_thresholds: resolveCoverageThresholds(row?.coverage_thresholds),
    permission_self_approval: row?.permission_self_approval ?? DEFAULT_PERMISSION_SELF_APPROVAL,
    survey_anonymity_threshold:
      row?.survey_anonymity_threshold ?? DEFAULT_SURVEY_ANONYMITY_THRESHOLD,
  };
}

export async function getResolvedWorkspaceSettingsForUpdate(
  tx: Tx,
  workspaceId: string,
): Promise<ResolvedWorkspaceSettings> {
  const row = await ensureAndLockWorkspaceSettings(tx, workspaceId);
  return {
    voc_cluster_suggestions_enabled: row.voc_cluster_suggestions_enabled,
    coverage_thresholds: resolveCoverageThresholds(row.coverage_thresholds),
    permission_self_approval: row.permission_self_approval,
    survey_anonymity_threshold: row.survey_anonymity_threshold,
  };
}

async function requireWorkspaceAdmin(
  checkService: CheckService,
  actor: ActorContext,
  tx?: Tx,
): Promise<void> {
  const decision = await checkService.checkCapability(
    actor,
    'workspace.admin',
    { workspace_id: actor.workspace_id },
    tx ? { tx } : undefined,
  );
  if (decision.allow !== true) {
    throw new HttpError('permission.denied', 'workspace.admin required');
  }
}

// Roll back insert-and-lock on no-op, including a previously absent singleton.
class SettingsNoop extends Error {
  constructor(readonly settings: ResolvedWorkspaceSettings) {
    super('effective workspace settings no-op');
  }
}

export function createWorkspaceSettingsService(deps: WorkspaceSettingsServiceDeps) {
  const { db, checkService, auditService } = deps;

  async function getWorkspaceSettings(actor: ActorContext): Promise<ResolvedWorkspaceSettings> {
    await requireWorkspaceAdmin(checkService, actor);
    return getResolvedWorkspaceSettings(db, actor.workspace_id);
  }

  async function patchWorkspaceSettings(
    actor: ActorContext,
    body: UpdateWorkspaceSettingsBody,
  ): Promise<ResolvedWorkspaceSettings> {
    return db
      .transaction(async (tx) => {
        await requireWorkspaceAdmin(checkService, actor, tx);
        const current = await ensureAndLockWorkspaceSettings(tx, actor.workspace_id);
        const resolvedCurrent: ResolvedWorkspaceSettings = {
          voc_cluster_suggestions_enabled: current.voc_cluster_suggestions_enabled,
          coverage_thresholds: resolveCoverageThresholds(current.coverage_thresholds),
          permission_self_approval: current.permission_self_approval,
          survey_anonymity_threshold: current.survey_anonymity_threshold,
        };
        const changes: WorkspaceSettingsUpdatedDetail['changes'] = {};
        const mergedBands = { ...resolvedCurrent.coverage_thresholds };
        for (const id of COVERAGE_METRIC_IDS) {
          const pair = body.coverage_thresholds?.[id];
          if (pair !== undefined) mergedBands[id] = pair;
        }
        const metricChanges: Partial<
          Record<
            (typeof COVERAGE_METRIC_IDS)[number],
            { from: CoverageThresholdPair; to: CoverageThresholdPair }
          >
        > = {};
        for (const id of COVERAGE_METRIC_IDS) {
          const from = resolvedCurrent.coverage_thresholds[id];
          const to = mergedBands[id];
          if (
            from.good_min_percent !== to.good_min_percent ||
            from.warn_min_percent !== to.warn_min_percent
          ) {
            metricChanges[id] = { from, to };
          }
        }
        if (Object.keys(metricChanges).length > 0) changes.coverage_thresholds = metricChanges;

        if (
          body.permission_self_approval !== undefined &&
          body.permission_self_approval !== resolvedCurrent.permission_self_approval
        ) {
          changes.permission_self_approval = {
            from: resolvedCurrent.permission_self_approval,
            to: body.permission_self_approval,
          };
        }
        if (
          body.survey_anonymity_threshold !== undefined &&
          body.survey_anonymity_threshold !== resolvedCurrent.survey_anonymity_threshold
        ) {
          changes.survey_anonymity_threshold = {
            from: resolvedCurrent.survey_anonymity_threshold,
            to: body.survey_anonymity_threshold,
          };
        }

        if (
          body.voc_cluster_suggestions_enabled !== undefined &&
          body.voc_cluster_suggestions_enabled !== resolvedCurrent.voc_cluster_suggestions_enabled
        ) {
          changes.voc_cluster_suggestions_enabled = {
            from: resolvedCurrent.voc_cluster_suggestions_enabled,
            to: body.voc_cluster_suggestions_enabled,
          };
        }

        if (Object.keys(changes).length === 0) throw new SettingsNoop(resolvedCurrent);

        const updated = await updateWorkspaceSettings(tx, actor.workspace_id, {
          ...body,
          coverage_thresholds: Object.keys(metricChanges).length > 0 ? mergedBands : undefined,
        });
        await auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: UPDATED,
          subject_type: 'workspace',
          subject_id: actor.workspace_id,
          summary: 'Workspace settings updated',
          detail: { changes },
        });
        return {
          voc_cluster_suggestions_enabled: updated.voc_cluster_suggestions_enabled,
          coverage_thresholds: resolveCoverageThresholds(updated.coverage_thresholds),
          permission_self_approval: updated.permission_self_approval,
          survey_anonymity_threshold: updated.survey_anonymity_threshold,
        };
      })
      .catch((error: unknown) => {
        if (error instanceof SettingsNoop) return error.settings;
        throw error;
      });
  }

  return { getWorkspaceSettings, patchWorkspaceSettings };
}

export type WorkspaceSettingsService = ReturnType<typeof createWorkspaceSettingsService>;
