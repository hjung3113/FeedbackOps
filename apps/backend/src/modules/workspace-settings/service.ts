import type { AuditEventType } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { ActorContext, CheckService } from '../permissions/check-service.js';
import {
  ensureAndLockWorkspaceSettings,
  findWorkspaceSettings,
  type PermissionSelfApproval,
  updateWorkspaceSettings,
} from './repo.js';

const UPDATED: AuditEventType = 'workspace_settings_updated';
const DEFAULT_PERMISSION_SELF_APPROVAL: PermissionSelfApproval = 'allowed';
const DEFAULT_SURVEY_ANONYMITY_THRESHOLD = 5;

export interface ResolvedWorkspaceSettings {
  permission_self_approval: PermissionSelfApproval;
  survey_anonymity_threshold: number;
}

export interface UpdateWorkspaceSettingsBody {
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
    return db.transaction(async (tx) => {
      await requireWorkspaceAdmin(checkService, actor, tx);
      const current = await ensureAndLockWorkspaceSettings(tx, actor.workspace_id);
      const resolvedCurrent: ResolvedWorkspaceSettings = {
        permission_self_approval: current.permission_self_approval,
        survey_anonymity_threshold: current.survey_anonymity_threshold,
      };
      const changes: Record<string, { from: string | number; to: string | number }> = {};

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

      if (Object.keys(changes).length === 0) return resolvedCurrent;

      const updated = await updateWorkspaceSettings(tx, actor.workspace_id, body);
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
        permission_self_approval: updated.permission_self_approval,
        survey_anonymity_threshold: updated.survey_anonymity_threshold,
      };
    });
  }

  return { getWorkspaceSettings, patchWorkspaceSettings };
}

export type WorkspaceSettingsService = ReturnType<typeof createWorkspaceSettingsService>;
