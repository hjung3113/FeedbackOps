import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";

export type SurveyResultAggregateRow = {
  question_id: string;
  question_kind: "single_choice" | "multiple_choice" | "rating" | "text";
  bucket_key: string | null;
  bucket_count: number;
};

/** The fops_app role may use only these aggregate-only SECURITY DEFINER functions. */
export async function readSurveyResultAggregates(
  db: Db,
  workspaceId: string,
  surveyId: string,
): Promise<SurveyResultAggregateRow[]> {
  const result = await db.execute<{
    question_id: string;
    question_kind: SurveyResultAggregateRow["question_kind"];
    bucket_key: string | null;
    bucket_count: number | string;
  }>(
    sql`select question_id, question_kind, bucket_key, bucket_count from survey.read_result_aggregates(${workspaceId}, ${surveyId})`,
  );
  return result.rows.map((row) => ({
    ...row,
    bucket_count: Number(row.bucket_count),
  }));
}

export async function readSurveyResultResponseCount(
  db: Db,
  workspaceId: string,
  surveyId: string,
): Promise<number> {
  const result = await db.execute<{ response_count: number | string }>(
    sql`select survey.read_result_response_count(${workspaceId}, ${surveyId}) as response_count`,
  );
  return Number(result.rows[0]?.response_count ?? 0);
}
