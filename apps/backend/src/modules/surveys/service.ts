import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { IdempotencyService } from '../core/idempotency/idempotency-service.js';
import type { RecoveryRecorder } from '../dashboard/recorder.js';
import type { CheckService } from '../permissions/check-service.js';
import { createMyAnswerableSurveys } from './answerable-surveys.js';
import { createSurveyAuthoring } from './authoring.js';
import { createSurveyEvidenceAccess } from './evidence-access.js';
import { createSurveyEvidenceCandidates } from './evidence-candidates.js';
import { createSurveyFollowUp } from './follow-up.js';
import { createOutcomeRecoveryPresentation } from './recovery-presentation.js';
import { createMySurveyResponseHistory } from './response-history.js';
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
  recoveryClock?: () => Date;
  recoveryRecorder?: RecoveryRecorder;
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
    ...createOutcomeRecoveryPresentation(deps),
    ...createSurveyAuthoring(deps),
    ...createSurveyResults(deps),
    ...createSurveyEvidenceCandidates(deps),
    ...createSurveyEvidenceAccess(deps),
    ...createSurveyFollowUp(deps),
    ...createMySurveyResponseHistory(deps),
    ...createMyAnswerableSurveys(deps),
  };
}
export type SurveysService = ReturnType<typeof createSurveysService>;
