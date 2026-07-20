import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { workspaceSettings } from '../../db/schema/core.js';
import type { Tx } from '../../db/tx.js';

export type PermissionSelfApproval = 'allowed' | 'forbidden';

export interface WorkspaceSettingsRow extends Record<string, unknown> {
  workspace_id: string;
  permission_self_approval: PermissionSelfApproval;
  survey_anonymity_threshold: number;
}

const WORKSPACE_SETTINGS_SELECT = sql`
  workspace_id,
  permission_self_approval,
  survey_anonymity_threshold
`;

function mapRow(row: WorkspaceSettingsRow): WorkspaceSettingsRow {
  return {
    workspace_id: row.workspace_id,
    permission_self_approval: row.permission_self_approval,
    survey_anonymity_threshold: row.survey_anonymity_threshold,
  };
}

export async function findWorkspaceSettings(
  db: Db | Tx,
  workspaceId: string,
): Promise<WorkspaceSettingsRow | null> {
  const result = await db.execute<WorkspaceSettingsRow>(sql`
    SELECT ${WORKSPACE_SETTINGS_SELECT}
      FROM ${workspaceSettings}
     WHERE workspace_id = ${workspaceId}
     LIMIT 1
  `);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function ensureAndLockWorkspaceSettings(
  tx: Tx,
  workspaceId: string,
): Promise<WorkspaceSettingsRow> {
  await tx
    .insert(workspaceSettings)
    .values({ workspaceId })
    .onConflictDoNothing({ target: workspaceSettings.workspaceId });

  const result = await tx.execute<WorkspaceSettingsRow>(sql`
    SELECT ${WORKSPACE_SETTINGS_SELECT}
      FROM ${workspaceSettings}
     WHERE workspace_id = ${workspaceId}
     FOR UPDATE
  `);
  const row = result.rows[0];
  if (!row) throw new Error('workspace settings singleton missing after insert');
  return mapRow(row);
}

export async function updateWorkspaceSettings(
  tx: Tx,
  workspaceId: string,
  fields: {
    permission_self_approval?: PermissionSelfApproval | undefined;
    survey_anonymity_threshold?: number | undefined;
  },
): Promise<WorkspaceSettingsRow> {
  const result = await tx.execute<WorkspaceSettingsRow>(sql`
    UPDATE ${workspaceSettings}
       SET permission_self_approval = COALESCE(${fields.permission_self_approval}, permission_self_approval),
           survey_anonymity_threshold = COALESCE(${fields.survey_anonymity_threshold}, survey_anonymity_threshold),
           updated_at = now()
     WHERE workspace_id = ${workspaceId}
     RETURNING ${WORKSPACE_SETTINGS_SELECT}
  `);
  const row = result.rows[0];
  if (!row) throw new Error('workspace settings update returned no row');
  return mapRow(row);
}
