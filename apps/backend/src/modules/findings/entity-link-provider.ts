import type { EntityLinkTargetSummary } from '@fops/shared';

import type { Db } from '../../db/client.js';
import type { EntityLinkProvider } from '../entity-links/provider-types.js';
import { checkFindingManage, checkFindingRead } from './authorization.js';
import { type FindingReadRow, findFindingById } from './repo-read.js';

function findingToInternalSummary(row: FindingReadRow): EntityLinkTargetSummary {
  return {
    type: 'finding',
    id: row.id,
    display_id: row.display_id,
    title: row.title,
    summary: row.summary,
    severity: row.severity,
    confidence: row.confidence,
    status: row.status,
    primary_managed_system_id: row.primary_managed_system_id,
    evidence_count: row.evidence_count,
  };
}

async function resolveFinding(db: Db, workspaceId: string, id: string) {
  const finding = await findFindingById(db, { workspaceId, findingId: id });
  if (!finding) return null;
  return {
    workspace_id: finding.workspace_id,
    managed_system_id: finding.primary_managed_system_id,
    reporter_id: null,
  };
}

export const findingEntityLinkProvider: EntityLinkProvider = {
  entityType: 'finding',
  assertExists: resolveFinding,
  getPermissionSubject: resolveFinding,
  canRead: async (deps, actor, subject) => {
    const decision = await checkFindingRead(deps.checkService, actor, subject.managed_system_id, {
      requireElevatedRole: false,
    });
    return decision.allow;
  },
  canCreateTarget: async (deps, actor, subject) => {
    const decision = await checkFindingManage(deps.checkService, actor, subject.managed_system_id, {
      requireElevatedRole: false,
    });
    return decision.allow;
  },
  getReporterSummary: async () => ({ available: false }),
  getInternalSummary: async (db, workspaceId, id) => {
    const finding = await findFindingById(db, { workspaceId, findingId: id });
    return finding ? findingToInternalSummary(finding) : null;
  },
  listExpectedLinks: async () => [],
};
