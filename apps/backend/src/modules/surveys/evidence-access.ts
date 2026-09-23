import {
  type ApprovedExcerptDto,
  type SurveyResponseExcerptCandidateDto,
  approvedExcerptDtoSchema,
  surveyResponseExcerptCandidateDtoSchema,
} from '@fops/shared';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';
import {
  checkSurveyManage,
  checkSurveyPersonalResponseRead,
  checkSurveyRead,
} from './authorization.js';
import {
  type SurveyResponseEvidenceSubject,
  hasActiveApprovedResponseExcerpt,
  insertApprovedExcerpt,
  lockResponseEvidenceSubject,
  readApprovedResponseExcerpts,
  readResponseTextCandidate,
  readSurveyQuestionLabel,
  revokeApprovedExcerpt,
} from './repo-evidence.js';
import type { SurveysActor, SurveysServiceDeps } from './service.js';

export type SurveyResponseEvidencePurpose =
  | 'personal_read'
  | 'approve_excerpt'
  | 'create_finding'
  | 'read_highlight';
export type SurveyResponseEvidenceAccess = {
  subject: SurveyResponseEvidenceSubject;
};

/**
 * The only Survey-owned personal-response access seam.  It locks and resolves
 * the source before capability checks so response existence, workspace scope,
 * survey.read, and personal-read denial collapse to the same 404.
 */
export async function resolveSurveyResponseEvidenceAccess(
  deps: Pick<SurveysServiceDeps, 'checkService'>,
  tx: Tx,
  actor: SurveysActor,
  responseId: string,
  purpose: SurveyResponseEvidencePurpose,
): Promise<SurveyResponseEvidenceAccess> {
  const subject = await lockResponseEvidenceSubject(tx, actor.workspace_id, responseId);
  if (!subject) throw new HttpError('not_found.record', 'survey response not found');
  const read = await checkSurveyRead(deps.checkService, actor, subject.primary_managed_system_id, {
    tx,
  });
  if (!read.allow) throw new HttpError('not_found.record', 'survey response not found');
  // Approved highlight projections are safe linked content. They deliberately do
  // not pass through the personal-response seam.
  if (purpose === 'read_highlight') {
    return { subject };
  }
  const personal = await checkSurveyPersonalResponseRead(
    deps.checkService,
    actor,
    subject.primary_managed_system_id,
    { tx },
  );
  if (!personal.allow) throw new HttpError('not_found.record', 'survey response not found');
  if (subject.survey_status === 'draft')
    throw new HttpError('conflict.survey_results_unavailable', 'survey results unavailable');
  if (purpose === 'approve_excerpt') {
    const manage = await checkSurveyManage(
      deps.checkService,
      actor,
      subject.primary_managed_system_id,
      { tx },
    );
    if (!manage.allow)
      throw new HttpError('permission.denied', 'survey.manage capability required');
  }
  return { subject };
}

/**
 * Resolves active approval snapshots only after the caller has crossed the
 * personal-response access seam in this transaction. Question labels remain
 * definer-provided metadata; raw answer text is never returned from here.
 */
export async function resolveApprovedSurveyResponseExcerpts(
  tx: Tx,
  actor: SurveysActor,
  subject: SurveyResponseEvidenceSubject,
  approvedExcerptIds: string[],
): Promise<
  Array<{
    approved_excerpt_id: string;
    question_id: string;
    question_label: string;
    redacted_excerpt: string;
  }>
> {
  const approvals = await readApprovedResponseExcerpts(
    tx,
    actor.workspace_id,
    subject.response_id,
    approvedExcerptIds,
  );
  if (approvals.length !== approvedExcerptIds.length)
    throw new HttpError('validation.failed', 'approved excerpt is not active for survey response', {
      fields: [{ path: ['approved_excerpt_ids'], code: 'invalid' }],
    });
  const labels = await Promise.all(
    approvals.map(async (approval) => {
      const candidate = await readSurveyQuestionLabel(
        tx,
        actor.workspace_id,
        subject.survey_id,
        approval.question_id,
      );
      if (!candidate)
        throw new HttpError('validation.failed', 'approved excerpt question is invalid', {
          fields: [{ path: ['approved_excerpt_ids'], code: 'invalid' }],
        });
      return { ...approval, question_label: candidate.question_label };
    }),
  );
  const byId = new Map(labels.map((label) => [label.approved_excerpt_id, label]));
  return approvedExcerptIds.map((id) => {
    const approval = byId.get(id);
    if (!approval)
      throw new HttpError(
        'validation.failed',
        'approved excerpt is not active for survey response',
        {
          fields: [{ path: ['approved_excerpt_ids'], code: 'invalid' }],
        },
      );
    return approval;
  });
}

/** Safe-highlight read seam: survey.read plus an active approval snapshot only. */
export async function resolveSurveyResponseHighlightAccess(
  deps: Pick<SurveysServiceDeps, 'checkService'>,
  tx: Tx,
  actor: SurveysActor,
  responseId: string,
  approvedExcerptId: string,
): Promise<SurveyResponseEvidenceSubject | null> {
  const { subject } = await resolveSurveyResponseEvidenceAccess(
    deps,
    tx,
    actor,
    responseId,
    'read_highlight',
  );
  const approved = await hasActiveApprovedResponseExcerpt(
    tx,
    actor.workspace_id,
    subject.response_id,
    approvedExcerptId,
  );
  return approved ? subject : null;
}

export function createSurveyEvidenceAccess(deps: SurveysServiceDeps) {
  async function readEvidenceExcerptCandidate(
    actor: SurveysActor,
    responseId: string,
    questionId: string,
  ): Promise<SurveyResponseExcerptCandidateDto> {
    return deps.db.transaction(async (tx) => {
      const { subject } = await resolveSurveyResponseEvidenceAccess(
        deps,
        tx,
        actor,
        responseId,
        'personal_read',
      );
      const candidate = await readResponseTextCandidate(
        tx,
        actor.workspace_id,
        responseId,
        questionId,
      );
      if (!candidate) throw new HttpError('not_found.record', 'survey response not found');
      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'survey_response_personal_read',
        subject_type: 'survey_response',
        subject_id: responseId,
        summary: 'Survey response personal text read',
        detail: {
          survey_id: subject.survey_id,
          survey_response_id: responseId,
          question_id: questionId,
        },
      });
      return surveyResponseExcerptCandidateDtoSchema.parse(candidate);
    });
  }
  async function approveEvidenceExcerpt(
    actor: SurveysActor,
    responseId: string,
    input: { question_id: string; redacted_excerpt: string },
  ): Promise<ApprovedExcerptDto> {
    return deps.db.transaction(async (tx) => {
      const { subject } = await resolveSurveyResponseEvidenceAccess(
        deps,
        tx,
        actor,
        responseId,
        'approve_excerpt',
      );
      // Validate membership through the narrow definer before the app writes its approval row.
      const candidate = await readResponseTextCandidate(
        tx,
        actor.workspace_id,
        responseId,
        input.question_id,
      );
      if (!candidate) throw new HttpError('not_found.record', 'survey response not found');
      // The candidate definer crosses the raw-text boundary even though this
      // command discards its text, so it receives the same sensitive-read audit.
      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'survey_response_personal_read',
        subject_type: 'survey_response',
        subject_id: responseId,
        summary: 'Survey response personal text read for excerpt approval',
        detail: {
          survey_id: subject.survey_id,
          survey_response_id: responseId,
          question_id: input.question_id,
        },
      });
      const approved = await insertApprovedExcerpt(tx, {
        workspaceId: actor.workspace_id,
        surveyId: subject.survey_id,
        responseId,
        questionId: input.question_id,
        redactedExcerpt: input.redacted_excerpt,
        approvedBy: actor.actor_id,
      });
      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'survey_response_excerpt_approved',
        subject_type: 'survey_response_excerpt_approval',
        subject_id: approved.approved_excerpt_id,
        summary: 'Survey response excerpt approved',
        detail: {
          survey_id: subject.survey_id,
          survey_response_id: responseId,
          question_id: input.question_id,
          approved_excerpt_id: approved.approved_excerpt_id,
        },
      });
      return approvedExcerptDtoSchema.parse(approved);
    });
  }
  async function revokeEvidenceExcerpt(
    actor: SurveysActor,
    responseId: string,
    approvedExcerptId: string,
  ): Promise<ApprovedExcerptDto> {
    return deps.db.transaction(async (tx) => {
      const { subject } = await resolveSurveyResponseEvidenceAccess(
        deps,
        tx,
        actor,
        responseId,
        'approve_excerpt',
      );
      const revoked = await revokeApprovedExcerpt(tx, {
        workspaceId: actor.workspace_id,
        responseId,
        approvedExcerptId,
      });
      if (!revoked)
        throw new HttpError(
          'validation.failed',
          'approved excerpt does not belong to survey response',
        );
      const { revoked_now, ...approvedExcerpt } = revoked;
      if (revoked_now) {
        await deps.auditService.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: 'survey_response_excerpt_revoked',
          subject_type: 'survey_response_excerpt_approval',
          subject_id: approvedExcerptId,
          summary: 'Survey response excerpt revoked',
          detail: {
            survey_id: subject.survey_id,
            survey_response_id: responseId,
            question_id: revoked.question_id,
            approved_excerpt_id: approvedExcerptId,
          },
        });
      }
      return approvedExcerptDtoSchema.parse(approvedExcerpt);
    });
  }
  return { readEvidenceExcerptCandidate, approveEvidenceExcerpt, revokeEvidenceExcerpt };
}
