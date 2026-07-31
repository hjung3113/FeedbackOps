import { sql } from 'drizzle-orm';
import type { Tx } from '../../db/tx.js';

export type SurveyResponseEvidenceSubject = {
  response_id: string;
  survey_id: string;
  survey_display_id: string;
  survey_type: 'discovery' | 'validation' | 'outcome';
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
  const result = await tx.execute<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
    revoked_now: boolean;
  }>(sql`
    with revoked as (
      update survey.survey_response_excerpt_approvals
         set revoked_at = now()
       where workspace_id = ${input.workspaceId}
         and response_id = ${input.responseId}
         and id = ${input.approvedExcerptId}
         and revoked_at is null
      returning id, question_id, redacted_excerpt
    )
    select id as approved_excerpt_id, question_id, redacted_excerpt, true as revoked_now
      from revoked
    union all
    select a.id as approved_excerpt_id, a.question_id, a.redacted_excerpt, false as revoked_now
      from survey.survey_response_excerpt_approvals a
     where a.workspace_id = ${input.workspaceId}
       and a.response_id = ${input.responseId}
       and a.id = ${input.approvedExcerptId}
       and not exists (select 1 from revoked)
  `);
  return result.rows[0] ?? null;
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
  }>(
    sql`select * from survey.read_approved_result_excerpts_personal(${workspaceId}, ${surveyId})`,
  );
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
  const result = await tx.execute<{
    approved_excerpt_id: string;
    question_id: string;
    redacted_excerpt: string;
  }>(sql`
    select a.id as approved_excerpt_id, a.question_id, a.redacted_excerpt
      from survey.survey_response_excerpt_approvals a
     where a.workspace_id = ${workspaceId}
       and a.response_id = ${responseId}
       and a.id = any(${ids})
       and a.revoked_at is null
  `);
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
  const result = await tx.execute<{ exists: boolean }>(sql`
    select exists(
      select 1
        from survey.survey_response_excerpt_approvals a
       where a.workspace_id = ${workspaceId}
         and a.response_id = ${responseId}
         and a.id = ${approvedExcerptId}
         and a.revoked_at is null
    ) as exists
  `);
  return result.rows[0]?.exists ?? false;
}
