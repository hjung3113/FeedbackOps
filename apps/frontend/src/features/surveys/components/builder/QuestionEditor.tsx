import { SURVEY_QUESTION_KIND_LABELS } from '@/lib/copy/enum-labels';
import { SURVEY_BUILDER_COPY } from '@/lib/copy/survey-builder';
import { surveyQuestionKindSchema } from '@fops/shared';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import * as React from 'react';
import type { QuestionKind, SurveyQuestion } from '../../types';
import { BranchEditor } from './BranchEditor';
import { OptionsEditor } from './OptionsEditor';
import { questionForKind } from './lib/questionDraft';

export function QuestionEditor({
  question,
  questions,
  editable,
  onChange,
}: {
  question: SurveyQuestion;
  questions: SurveyQuestion[];
  editable: boolean;
  onChange: (question: SurveyQuestion) => void;
}) {
  const [blockedBranchKindChangeId, setBlockedBranchKindChangeId] = React.useState<string | null>(
    null,
  );
  const set = (patch: Partial<SurveyQuestion>) => onChange({ ...question, ...patch });
  const parent = questions.find((candidate) => candidate.id === question.branch_parent_question_id);
  const hasBranchChildren = questions.some(
    (candidate) => candidate.branch_parent_question_id === question.id,
  );
  const blockedBranchKindChange = blockedBranchKindChangeId === question.id;
  const branchKindErrorId = `survey-branch-kind-error-${question.id}`;
  const promptIsBlank = editable && question.prompt.trim().length === 0;
  const promptErrorId = `survey-prompt-error-${question.id}`;
  const parents = questions.filter(
    (candidate) =>
      candidate.id !== question.id &&
      candidate.kind === 'single_choice' &&
      !candidate.branch_parent_question_id,
  );
  const branchTriggerOptionKeys = questions.flatMap((candidate) => {
    if (candidate.branch_parent_question_id !== question.id || !candidate.branch_trigger_option_key)
      return [];
    return [candidate.branch_trigger_option_key];
  });
  return (
    <div className="space-y-4">
      <label className="block text-sm" htmlFor="question-kind">
        질문 유형
        <Select
          value={question.kind}
          disabled={!editable}
          onValueChange={(kind) => {
            if (
              question.kind === 'single_choice' &&
              kind === 'multiple_choice' &&
              hasBranchChildren
            ) {
              setBlockedBranchKindChangeId(question.id);
              return;
            }
            setBlockedBranchKindChangeId(null);
            set(questionForKind(question, kind as QuestionKind));
          }}
        >
          <SelectTrigger
            id="question-kind"
            aria-label="질문 유형"
            aria-invalid={blockedBranchKindChange}
            {...(blockedBranchKindChange ? { 'aria-describedby': branchKindErrorId } : {})}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {surveyQuestionKindSchema.options.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {SURVEY_QUESTION_KIND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {blockedBranchKindChange && (
          <p id={branchKindErrorId} role="alert" className="mt-1 text-xs text-text-danger-label">
            {SURVEY_BUILDER_COPY.branchParentKindChange}
          </p>
        )}
      </label>
      <div className="block text-sm">
        <label htmlFor="question-title">질문 제목</label>
        <Textarea
          id="question-title"
          value={question.prompt}
          aria-invalid={promptIsBlank}
          {...(promptIsBlank ? { 'aria-describedby': promptErrorId } : {})}
          disabled={!editable}
          onChange={(event) => set({ prompt: event.target.value })}
        />
        {promptIsBlank && (
          <p id={promptErrorId} role="alert" className="mt-1 text-xs text-text-danger-label">
            {SURVEY_BUILDER_COPY.emptyPrompt}
          </p>
        )}
      </div>
      {(question.kind === 'single_choice' || question.kind === 'multiple_choice') && (
        <OptionsEditor
          question={question}
          editable={editable}
          branchTriggerOptionKeys={branchTriggerOptionKeys}
          onChange={set}
        />
      )}
      {question.kind === 'rating' && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            aria-label="최소 점수"
            type="number"
            value={question.rating_min ?? 1}
            disabled={!editable}
            onChange={(event) => set({ rating_min: Number(event.target.value) })}
          />
          <Input
            aria-label="최대 점수"
            type="number"
            value={question.rating_max ?? 5}
            disabled={!editable}
            onChange={(event) => set({ rating_max: Number(event.target.value) })}
          />
        </div>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={question.is_required}
          disabled={!editable}
          onChange={(event) => set({ is_required: event.target.checked })}
        />
        필수 질문
      </label>
      {editable && (
        <BranchEditor
          question={question}
          parents={parents}
          onChange={set}
          {...(parent ? { parent } : {})}
        />
      )}
    </div>
  );
}
