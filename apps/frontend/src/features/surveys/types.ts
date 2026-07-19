export type SurveyType = 'discovery' | 'validation' | 'outcome';
export type SurveyStatus = 'draft' | 'open' | 'closed';
export type QuestionKind = 'single_choice' | 'multiple_choice' | 'rating' | 'text';

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  kind: QuestionKind;
  prompt: string;
  is_required: boolean;
  options: Array<{ key: string; label: string }> | null;
  rating_min: number | null;
  rating_max: number | null;
  rating_low_label: string | null;
  rating_high_label: string | null;
  sort_order: number;
  branch_depth: number;
  branch_parent_question_id: string | null;
  branch_trigger_option_key: string | null;
}

export interface Survey {
  id: string;
  workspace_id?: string;
  display_id: string;
  type: SurveyType;
  status: SurveyStatus;
  title: string;
  description?: string | null;
  primary_managed_system_id: string;
  analytics_area_id: string | null;
  operator_actor_id: string | null;
  responses_identity_protected: boolean;
  created_by: string;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  questions?: SurveyQuestion[];
}

/** Strict question-route input: absent optional fields must be omitted, never null. */
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
  branch_parent_question_id?: string;
  branch_trigger_option_key?: string;
}
