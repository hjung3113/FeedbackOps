import type { SurveyDto, SurveyQuestionDto } from '@fops/shared';

export type SurveyType = 'discovery' | 'validation' | 'outcome';
export type SurveyStatus = 'draft' | 'open' | 'closed';
export type QuestionKind = 'single_choice' | 'multiple_choice' | 'rating' | 'text';

/**
 * Wire-validated aliases (#398): these are the shared runtime schemas'
 * inferred DTOs, which `apiRequest` parses at the network seam. Aliasing the
 * schema output (instead of hand-written interfaces) keeps the FE type from
 * drifting from what the backend actually sends.
 */
export type SurveyQuestion = SurveyQuestionDto;
export type Survey = SurveyDto;

export interface CreateSurveyInput {
  type: SurveyType;
  title: string;
  description?: string;
  primary_managed_system_id: string;
  analytics_area_id?: string;
  operator_actor_id?: string;
  responses_identity_protected: boolean;
}

export type SurveyPatchInput = Partial<CreateSurveyInput>;

/**
 * Strict question-route input: absent optional fields must be omitted, never
 * null. `branch_parent_question_id` is the one exception — the route reads
 * `undefined` as "leave as is" and an explicit `null` as "clear the branch"
 * (#192), so clearing a branch is the only case that may send a null.
 */
export interface QuestionInput {
  kind: QuestionKind;
  prompt: string;
  is_required?: boolean;
  options?: Array<{ key: string; label: string }>;
  rating_min?: number;
  rating_max?: number;
  rating_low_label?: string;
  rating_high_label?: string;
  sort_order?: number;
  branch_parent_question_id?: string | null;
  branch_trigger_option_key?: string;
}
