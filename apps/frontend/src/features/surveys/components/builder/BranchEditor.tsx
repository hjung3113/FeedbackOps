import { SURVEY_BUILDER_COPY } from '@/lib/copy/survey-builder';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@fops/ui';
import type { SurveyQuestion } from '../../types';

const NO_BRANCH = '__no_branch__';

export function BranchEditor({
  question,
  parent,
  parents,
  onChange,
}: {
  question: SurveyQuestion;
  parent?: SurveyQuestion;
  parents: SurveyQuestion[];
  onChange: (patch: Partial<SurveyQuestion>) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor="survey-branch-parent" className="block text-sm">
          조건부로 다음 질문을 보여주기 (한 단계)
        </label>
        <Select
          value={question.branch_parent_question_id ?? NO_BRANCH}
          onValueChange={(value) => {
            const parentId = value === NO_BRANCH ? null : value;
            const nextParent = parents.find((candidate) => candidate.id === parentId);
            onChange({
              branch_parent_question_id: parentId,
              branch_trigger_option_key: nextParent?.options?.[0]?.key ?? null,
            });
          }}
        >
          <SelectTrigger
            id="survey-branch-parent"
            aria-label="분기 부모 질문"
            appearance="canvas"
            className="mt-1 w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_BRANCH}>분기 없음</SelectItem>
            {parent && !parents.some((candidate) => candidate.id === parent.id) && (
              <SelectItem value={parent.id} disabled>
                {SURVEY_BUILDER_COPY.branchParentLabel(parent.sort_order + 1, parent.prompt)}
              </SelectItem>
            )}
            {parents.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {SURVEY_BUILDER_COPY.branchParentLabel(candidate.sort_order + 1, candidate.prompt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {parent && (
        <div>
          <label htmlFor="survey-branch-option" className="block text-sm">
            표시 조건 옵션
          </label>
          <Select
            value={question.branch_trigger_option_key ?? ''}
            onValueChange={(value) =>
              onChange({
                branch_trigger_option_key: value,
              })
            }
          >
            <SelectTrigger
              id="survey-branch-option"
              aria-label="분기 조건 옵션"
              appearance="canvas"
              className="mt-1 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(parent.options ?? []).map((option, index) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label.trim() || SURVEY_BUILDER_COPY.optionLabel(index + 1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
