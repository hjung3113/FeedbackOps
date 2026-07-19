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
