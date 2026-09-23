import type { SurveyQuestion } from '../../types';

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
      <label className="block text-sm">
        조건부로 다음 질문을 보여주기 (one-level)
        <select
          aria-label="분기 부모 질문"
          className="mt-1 w-full rounded border border-border-subtle bg-surface-canvas p-2"
          value={question.branch_parent_question_id ?? ''}
          onChange={(event) => {
            const parentId = event.target.value;
            const nextParent = parents.find((candidate) => candidate.id === parentId);
            onChange({
              branch_parent_question_id: parentId || null,
              branch_trigger_option_key: nextParent?.options?.[0]?.key ?? null,
            });
          }}
        >
          <option value="">분기 없음</option>
          {parents.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.prompt || candidate.id}
            </option>
          ))}
        </select>
      </label>
      {parent && (
        <label className="block text-sm">
          표시 조건 옵션
          <select
            aria-label="분기 조건 옵션"
            className="mt-1 w-full rounded border border-border-subtle bg-surface-canvas p-2"
            value={question.branch_trigger_option_key ?? ''}
            onChange={(event) =>
              onChange({
                branch_trigger_option_key: event.target.value || null,
              })
            }
          >
            {(parent.options ?? []).map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
