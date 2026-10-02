import { SURVEY_PARTICIPATION_COPY } from '@/lib/copy/survey-participation';
import type { SurveyQuestionKind } from '@fops/shared';
import { Textarea } from '@fops/ui';

export type RespondentAnswer = string | string[] | number;

export interface RespondentQuestionData {
  id: string;
  kind: SurveyQuestionKind;
  prompt: string;
  options: Array<{ key: string; label: string }> | null;
  rating_min: number | null;
  rating_max: number | null;
}

export function RespondentQuestion({
  question,
  value,
  onChange,
}: {
  question: RespondentQuestionData;
  value: RespondentAnswer | undefined;
  onChange: (value: RespondentAnswer) => void;
}) {
  if (question.kind === 'text') {
    return (
      <Textarea
        aria-label={question.prompt}
        className="mt-2 min-h-24"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={SURVEY_PARTICIPATION_COPY.textPlaceholder}
      />
    );
  }

  if (question.kind === 'rating') {
    const minimum = question.rating_min ?? 1;
    const maximum = question.rating_max ?? 5;
    return (
      <div className="mt-2 flex gap-2">
        {Array.from({ length: Math.max(0, maximum - minimum + 1) }, (_, index) => {
          const score = minimum + index;
          const selected = value === score;
          return (
            <button
              key={score}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(score)}
              className={`h-8 w-8 rounded-full border ${selected ? 'border-border-selected bg-surface-row-selected' : 'border-border-subtle'}`}
            >
              {score}
            </button>
          );
        })}
      </div>
    );
  }

  const multiple = question.kind === 'multiple_choice';
  return (
    <fieldset className="mt-2 space-y-2">
      <legend className="sr-only">{question.prompt}</legend>
      {(question.options ?? []).map((option) => {
        const checked = multiple
          ? Array.isArray(value) && value.includes(option.key)
          : value === option.key;
        return (
          <label key={option.key} className="flex gap-2 text-sm">
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={question.id}
              checked={checked}
              onChange={() => {
                if (!multiple) {
                  onChange(option.key);
                  return;
                }
                const current = Array.isArray(value) ? value : [];
                onChange(
                  checked
                    ? current.filter((item) => item !== option.key)
                    : [...current, option.key],
                );
              }}
            />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}
