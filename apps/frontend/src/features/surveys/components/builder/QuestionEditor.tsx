import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import type { QuestionKind, SurveyQuestion } from '../../types';
import { BranchEditor } from './BranchEditor';
import { OptionsEditor } from './OptionsEditor';
import { questionForKind } from './lib/questionDraft';

const kinds: Array<{ value: QuestionKind; label: string }> = [
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'rating', label: 'Rating' },
  { value: 'text', label: 'Text' },
];

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
  const set = (patch: Partial<SurveyQuestion>) => onChange({ ...question, ...patch });
  const parent = questions.find((candidate) => candidate.id === question.branch_parent_question_id);
  const parents = questions.filter(
    (candidate) =>
      candidate.id !== question.id &&
      candidate.kind === 'single_choice' &&
      !candidate.branch_parent_question_id,
  );
  return (
    <div className="space-y-4">
      <label className="block text-sm" htmlFor="question-kind">
        Question kind
        <Select
          value={question.kind}
          disabled={!editable}
          onValueChange={(kind) => set(questionForKind(question, kind as QuestionKind))}
        >
          <SelectTrigger id="question-kind" aria-label="Question kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((kind) => (
              <SelectItem key={kind.value} value={kind.value}>
                {kind.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="block text-sm" htmlFor="question-title">
        Question title
        <Textarea
          id="question-title"
          value={question.prompt}
          disabled={!editable}
          onChange={(event) => set({ prompt: event.target.value })}
        />
      </label>
      {(question.kind === 'single_choice' || question.kind === 'multiple_choice') && (
        <OptionsEditor question={question} editable={editable} onChange={set} />
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
