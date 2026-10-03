import type { SurveyType } from '@fops/shared';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';

export type SurveyResponseEvidenceSubject = {
  response_id: string;
  survey_id: string;
  survey_display_id: string;
  survey_type: SurveyType;
  survey_status: 'draft' | 'open' | 'closed';
  primary_managed_system_id: string;
  analytics_area_id: string | null;
  identity_protected: boolean;
};

export async function lockResponseEvidenceSubject(
  tx: Tx,
  workspaceId: string,
  responseId: string,
): Promise<SurveyResponseEvidenceSubject | null> {
  const result = await tx.execute<SurveyResponseEvidenceSubject>(
    sql`select * from survey.lock_response_evidence_subject(${workspaceId}, ${responseId})`,
  );
  return result.rows[0] ?? null;
}

export async function readResponseTextCandidate(
  tx: Tx,
  workspaceId: string,
  responseId: string,
  questionId: string,
): Promise<{ question_id: string; question_label: string; raw_text: string } | null> {
  const result = await tx.execute<{
    question_id: string;
    question_label: string;
    raw_text: string;
  }>(
    sql`select * from survey.read_response_text_candidate(${workspaceId}, ${responseId}, ${questionId})`,
  );
  return result.rows[0] ?? null;
}

export async function insertApprovedExcerpt(
  tx: Tx,
  input: {
    workspaceId: string;
    surveyId: string;
    responseId: string;
    questionId: string;
    redactedExcerpt: string;
    approvedBy: string;
  },
): Promise<{ approved_excerpt_id: string; question_id: string; redacted_excerpt: string }> {
  const result = await tx.execute<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
  }>(sql`
    insert into survey.survey_response_excerpt_approvals
      (workspace_id, survey_id, response_id, question_id, redacted_excerpt, approved_by)
    values
      (${input.workspaceId}, ${input.surveyId}, ${input.responseId}, ${input.questionId},
       ${input.redactedExcerpt}, ${input.approvedBy})
    returning id as approved_excerpt_id, question_id, redacted_excerpt
  `);
  const row = result.rows[0];
  if (!row) throw new Error('approved excerpt insert did not return a row');
  return row;
}

export async function revokeApprovedExcerpt(
  tx: Tx,
  input: { workspaceId: string; responseId: string; approvedExcerptId: string },
): Promise<{
  approved_excerpt_id: string;
  question_id: string;
  redacted_excerpt: string;
  revoked_now: boolean;
} | null> {
  // #569: fops_app has no SELECT on response_id, so the (response, approval)
  // binding check runs in the definer; the app then revokes by approval id only.
  const approval = await tx.execute<{
    question_id: string;
    redacted_excerpt: string;
    is_active: boolean;
  }>(
    sql`select * from survey.read_response_excerpt_approval(${input.workspaceId}, ${input.responseId}, ${input.approvedExcerptId})`,
  );
  const current = approval.rows[0];
  if (!current) return null;
  if (!current.is_active) {
    return {
      approved_excerpt_id: input.approvedExcerptId,
      question_id: current.question_id,
      redacted_excerpt: current.redacted_excerpt,
      revoked_now: false,
    };
  }
  const result = await tx.execute<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
  }>(sql`
    update survey.survey_response_excerpt_approvals
       set revoked_at = now()
     where workspace_id = ${input.workspaceId}
       and id = ${input.approvedExcerptId}
       and revoked_at is null
    returning id as approved_excerpt_id, question_id, redacted_excerpt
  `);
  const revoked = result.rows[0];
  if (revoked) return { ...revoked, revoked_now: true };
  // A concurrent transaction revoked the approval between the definer check and
  // this update; report it as already-revoked like the single-statement path did.
  return {
    approved_excerpt_id: input.approvedExcerptId,
    question_id: current.question_id,
    redacted_excerpt: current.redacted_excerpt,
    revoked_now: false,
  };
}

export async function readApprovedResultExcerpts(
  tx: Tx,
  workspaceId: string,
  surveyId: string,
): Promise<Array<{ approved_excerpt_id: string; question_id: string; redacted_excerpt: string }>> {
  const result = await tx.execute<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
  }>(sql`select * from survey.read_approved_result_excerpts(${workspaceId}, ${surveyId})`);
  return result.rows;
}

export async function readApprovedResultExcerptsPersonal(
  tx: Tx,
  workspaceId: string,
  surveyId: string,
): Promise<
  Array<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
    response_id: string;
  }>
> {
  const result = await tx.execute<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
    response_id: string;
  }>(sql`select * from survey.read_approved_result_excerpts_personal(${workspaceId}, ${surveyId})`);
  return result.rows;
}

export async function listDerivedFindingsForResponses(
  tx: Tx,
  workspaceId: string,
  responseIds: string[],
): Promise<Array<{ finding_id: string; primary_managed_system_id: string }>> {
  if (responseIds.length === 0) return [];
  const ids = sql`ARRAY[${sql.join(
    responseIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
  const result = await tx.execute<{ finding_id: string; primary_managed_system_id: string }>(sql`
    select distinct f.id as finding_id, f.primary_managed_system_id
      from core.entity_links el
      join finding.findings f
        on f.id = el.target_id
       and f.workspace_id = el.workspace_id
     where el.workspace_id = ${workspaceId}
       and el.source_type = 'survey_response'
       and el.target_type = 'finding'
       and el.relation_type = 'generated_finding'
       and el.status = 'active'
       and el.source_id = any(${ids})
     order by f.id
  `);
  return result.rows;
}

/** Safe approval projection for one response. It never reads response answers. */
export async function readApprovedResponseExcerpts(
  tx: Tx,
  workspaceId: string,
  responseId: string,
  approvedExcerptIds: string[],
): Promise<
  Array<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
  }>
> {
  if (approvedExcerptIds.length === 0) return [];
  const ids = sql`ARRAY[${sql.join(
    approvedExcerptIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
  // #569: reads the per-response binding in the definer; fops_app cannot
  // filter the approvals table on response_id directly.
  const result = await tx.execute<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
  }>(
    sql`select * from survey.read_approved_response_excerpts(${workspaceId}, ${responseId}, ${ids})`,
  );
  return result.rows;
}

/**
 * Direct fops_app metadata projection. Unlike readResponseTextCandidate this
 * cannot reach survey_response_answers, so resolving a template label never
 * crosses the audited raw-answer seam.
 */
export async function readSurveyQuestionLabel(
  tx: Tx,
  workspaceId: string,
  surveyId: string,
  questionId: string,
): Promise<{ question_id: string; question_label: string } | null> {
  const result = await tx.execute<{ question_id: string; question_label: string }>(sql`
    select id as question_id, prompt as question_label
      from survey.survey_questions
     where workspace_id = ${workspaceId}
       and survey_id = ${surveyId}
       and id = ${questionId}
       and kind = 'text'
  `);
  return result.rows[0] ?? null;
}

/** A stored highlight is safe to project only while its own approval remains active. */
export async function hasActiveApprovedResponseExcerpt(
  tx: Tx,
  workspaceId: string,
  responseId: string,
  approvedExcerptId: string,
): Promise<boolean> {
  // #569: the (response, approval) binding is resolved by the definer reader;
  // a returned row exists only while the approval is active.
  const rows = await readApprovedResponseExcerpts(tx, workspaceId, responseId, [approvedExcerptId]);
  return rows.length > 0;
}
