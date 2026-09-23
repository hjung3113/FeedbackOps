import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { createSurveyAuthoring } from './authoring.js';
import { createSurveyEvidenceAccess } from './evidence-access.js';
import { createSurveyResults } from './results.js';

export interface SurveysActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}
export interface ResolvedSurveyWorkspaceSettings {
  survey_anonymity_threshold: number;
}
export interface SurveysServiceDeps {
  db: Db;
  auditService: AuditService;
  checkService: CheckService;
  idempotencyService: IdempotencyService;
  resolveWorkspaceSettings: (
    dbOrTx: Db | Tx,
    workspaceId: string,
  ) => Promise<ResolvedSurveyWorkspaceSettings>;
}

export function createSurveysService(deps: SurveysServiceDeps) {
  return {
    ...createSurveyAuthoring(deps),
    ...createSurveyResults(deps),
    ...createSurveyEvidenceAccess(deps),
  };
}
export type SurveysService = ReturnType<typeof createSurveysService>;
